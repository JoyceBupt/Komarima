import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Connect, Plugin } from 'vite'
import {
  createKomari132Scenario,
  type Komari132RpcRequest,
  type Komari132Scenario,
  type Komari132ScenarioPreset,
  type Komari132ScenarioResponse,
} from './komari132Scenario.ts'

type PreviewRpcRequest = Komari132RpcRequest & {
  jsonrpc: '2.0'
}

export interface PreviewPluginOptions {
  preset?: string
  now?: () => Date
}

export interface PreviewRequest {
  method?: string
  url?: string
  body?: string
}

const previewPresets: readonly Komari132ScenarioPreset[] = [
  'public',
  'private',
  'scale-500',
]
const restPaths = new Set(['/api/public', '/api/me'])
const maximumRequestBodyBytes = 64 * 1024

class PreviewRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'PreviewRequestError'
  }
}

export function parsePreviewPreset(value?: string): Komari132ScenarioPreset {
  const preset = value ?? 'public'
  if (previewPresets.includes(preset as Komari132ScenarioPreset)) {
    return preset as Komari132ScenarioPreset
  }

  throw new Error(
    `KOMARIMA_PREVIEW_SCENARIO must be one of ${previewPresets.join(', ')}; received ${preset}`,
  )
}

function requestPath(url: string | undefined) {
  if (!url) return null
  try {
    return new URL(url, 'http://localhost').pathname
  } catch {
    return null
  }
}

function isRpcRequest(value: unknown): value is PreviewRpcRequest {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }

  const request = value as Record<string, unknown>
  const validId =
    typeof request.id === 'string' ||
    (typeof request.id === 'number' && Number.isFinite(request.id))
  const validParams =
    request.params === undefined ||
    (typeof request.params === 'object' &&
      request.params !== null &&
      !Array.isArray(request.params))
  return (
    request.jsonrpc === '2.0' &&
    validId &&
    typeof request.method === 'string' &&
    validParams
  )
}

function invalidRpcRequest(): Komari132ScenarioResponse {
  return {
    status: 400,
    body: { message: 'Invalid JSON-RPC request' },
  }
}

function requestBodyTooLarge(): Komari132ScenarioResponse {
  return {
    status: 413,
    body: { message: 'Preview request body is too large' },
  }
}

export function createPreviewRequestHandler(scenario: Komari132Scenario) {
  return async ({
    method,
    url,
    body,
  }: PreviewRequest): Promise<Komari132ScenarioResponse | null> => {
    const path = requestPath(url)
    if (!path) return null

    if (method === 'GET' && restPaths.has(path)) {
      return scenario.handleRest(path)
    }
    if (method !== 'POST' || path !== '/api/rpc2') return null
    if (Buffer.byteLength(body ?? '', 'utf8') > maximumRequestBodyBytes) {
      return requestBodyTooLarge()
    }

    let request: unknown
    try {
      request = JSON.parse(body ?? '') as unknown
    } catch {
      return invalidRpcRequest()
    }
    if (!isRpcRequest(request)) return invalidRpcRequest()

    return scenario.handleRpc(request)
  }
}

async function readRequestBody(request: IncomingMessage) {
  const chunks: Buffer[] = []
  let totalBytes = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    totalBytes += buffer.byteLength
    if (totalBytes > maximumRequestBodyBytes) {
      throw new PreviewRequestError(413, 'Preview request body is too large')
    }
    chunks.push(buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

function sendJson(response: ServerResponse, result: Komari132ScenarioResponse) {
  response.statusCode = result.status
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(result.body))
}

export function vitePreviewPlugin({
  preset: presetValue,
  now = () => new Date(),
}: PreviewPluginOptions = {}): Plugin {
  return {
    name: 'komarima-ui-preview',
    apply: (_config, { command, mode }) =>
      command === 'serve' && mode === 'ui-preview',
    configureServer(server) {
      const preset = parsePreviewPreset(presetValue)
      const scenario = createKomari132Scenario({ preset, now })
      const handleRequest = createPreviewRequestHandler(scenario)

      server.middlewares.use(
        async (
          request: Connect.IncomingMessage,
          response: ServerResponse,
          next: Connect.NextFunction,
        ) => {
          const method = request.method
          const path = requestPath(request.url)
          const intercepted =
            (method === 'GET' && path !== null && restPaths.has(path)) ||
            (method === 'POST' && path === '/api/rpc2')
          if (!intercepted) {
            next()
            return
          }

          try {
            const result = await handleRequest({
              method,
              url: request.url,
              body:
                method === 'POST' ? await readRequestBody(request) : undefined,
            })
            if (!result) {
              next()
              return
            }
            sendJson(response, result)
          } catch (error) {
            if (error instanceof PreviewRequestError) {
              sendJson(response, {
                status: error.status,
                body: { message: error.message },
              })
              return
            }
            next(error)
          }
        },
      )
    },
  }
}
