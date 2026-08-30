import type { z } from 'zod'
import {
  ContractError,
  HttpError,
  RequestTimeoutError,
  RpcResponseError,
} from './errors'
import { rpcFailureSchema, rpcSuccessSchema } from './schemas'

export type FetchLike = typeof fetch

export interface TransportOptions {
  signal?: AbortSignal
  timeoutMs?: number
}

const defaultTimeoutMs = 15_000

const responseMessage = (payload: unknown, fallback: string) => {
  if (
    typeof payload === 'object' &&
    payload !== null &&
    'message' in payload &&
    typeof payload.message === 'string'
  ) {
    return payload.message
  }

  return fallback
}

const readJson = async (response: Response, endpoint: string) => {
  const raw = await response.text()
  try {
    return JSON.parse(raw) as unknown
  } catch (error) {
    if (!response.ok) {
      throw new HttpError(
        response.status,
        response.statusText || `HTTP ${response.status}`,
        raw,
      )
    }
    throw new ContractError(
      endpoint,
      error instanceof Error ? error.message : 'Response was not valid JSON',
      raw,
    )
  }
}

const joinUrl = (baseUrl: string, path: string) => {
  if (!baseUrl) return path
  return `${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`
}

async function fetchJsonWithTimeout(
  fetchImpl: FetchLike,
  endpoint: string,
  init: RequestInit,
  options: TransportOptions,
) {
  const timeoutMs = options.timeoutMs ?? defaultTimeoutMs
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError('Transport timeout must be a positive finite number')
  }
  if (options.signal?.aborted) {
    throw options.signal.reason ?? new DOMException('Aborted', 'AbortError')
  }

  const controller = new AbortController()
  let timeout: ReturnType<typeof setTimeout> | undefined
  let onAbort: (() => void) | undefined
  const guard = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      const error = new RequestTimeoutError(endpoint, timeoutMs)
      controller.abort(error)
      reject(error)
    }, timeoutMs)
    onAbort = () => {
      const error =
        options.signal?.reason ?? new DOMException('Aborted', 'AbortError')
      controller.abort(error)
      reject(error)
    }
    options.signal?.addEventListener('abort', onAbort, { once: true })
  })

  try {
    return await Promise.race([
      (async () => {
        const response = await fetchImpl(endpoint, {
          ...init,
          signal: controller.signal,
        })
        const payload = await readJson(response, endpoint)
        return { response, payload }
      })(),
      guard,
    ])
  } finally {
    if (timeout !== undefined) clearTimeout(timeout)
    if (onAbort) options.signal?.removeEventListener('abort', onAbort)
  }
}

export class JsonTransport {
  readonly baseUrl: string
  private readonly fetchImpl: FetchLike

  constructor(
    baseUrl = '',
    fetchImpl: FetchLike = (input, init) => globalThis.fetch(input, init),
  ) {
    this.baseUrl = baseUrl
    this.fetchImpl = fetchImpl
  }

  async get<T>(
    path: string,
    schema: z.ZodType<T>,
    options: TransportOptions = {},
  ): Promise<T> {
    const endpoint = joinUrl(this.baseUrl, path)
    const { response, payload } = await fetchJsonWithTimeout(
      this.fetchImpl,
      endpoint,
      {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      },
      options,
    )
    if (!response.ok) {
      throw new HttpError(
        response.status,
        responseMessage(payload, `HTTP ${response.status}`),
        payload,
      )
    }

    const parsed = schema.safeParse(payload)
    if (!parsed.success) {
      throw new ContractError(endpoint, parsed.error.message, payload)
    }

    return parsed.data
  }

  async rpc<T>(
    method: string,
    params: unknown,
    resultSchema: z.ZodType<T>,
    id: string | number,
    options: TransportOptions = {},
  ): Promise<T> {
    const endpoint = joinUrl(this.baseUrl, '/api/rpc2')
    const { response, payload } = await fetchJsonWithTimeout(
      this.fetchImpl,
      endpoint,
      {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id,
          method,
          ...(params === undefined ? {} : { params }),
        }),
      },
      options,
    )
    if (!response.ok) {
      throw new HttpError(
        response.status,
        responseMessage(payload, `HTTP ${response.status}`),
        payload,
      )
    }

    const failure = rpcFailureSchema.safeParse(payload)
    if (failure.success) {
      if (failure.data.id !== id) {
        throw new ContractError(
          endpoint,
          'JSON-RPC response id did not match',
          payload,
        )
      }
      throw new RpcResponseError(
        failure.data.error.code,
        failure.data.error.message,
        failure.data.error.data,
      )
    }

    const success = rpcSuccessSchema(resultSchema).safeParse(payload)
    if (!success.success) {
      throw new ContractError(endpoint, success.error.message, payload)
    }
    if (success.data.id !== id) {
      throw new ContractError(
        endpoint,
        'JSON-RPC response id did not match',
        payload,
      )
    }

    return success.data.result
  }
}
