export class HttpError extends Error {
  readonly status: number
  readonly payload: unknown

  constructor(status: number, message: string, payload: unknown) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.payload = payload
  }
}

export class RpcResponseError extends Error {
  readonly code: number
  readonly data: unknown

  constructor(code: number, message: string, data?: unknown) {
    super(message)
    this.name = 'RpcResponseError'
    this.code = code
    this.data = data
  }
}

export class ContractError extends Error {
  readonly endpoint: string
  readonly payload: unknown

  constructor(endpoint: string, message: string, payload: unknown) {
    super(message)
    this.name = 'ContractError'
    this.endpoint = endpoint
    this.payload = payload
  }
}

export class RequestTimeoutError extends Error {
  readonly endpoint: string
  readonly timeoutMs: number

  constructor(endpoint: string, timeoutMs: number) {
    super(`Request to ${endpoint} timed out after ${timeoutMs}ms`)
    this.name = 'RequestTimeoutError'
    this.endpoint = endpoint
    this.timeoutMs = timeoutMs
  }
}
