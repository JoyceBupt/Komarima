import { HttpError, RpcResponseError } from '../api/errors'

export type CapabilityState =
  | 'unknown'
  | 'supported-permitted'
  | 'unsupported'
  | 'denied'
  | 'transient-error'

export const capabilityFromResult = (): CapabilityState => 'supported-permitted'

export const capabilityFromError = (error: unknown): CapabilityState => {
  if (error instanceof RpcResponseError) {
    if (error.code === -32601 || error.code === -32050) return 'unsupported'
    if (error.code === -32040 || error.code === -32041) return 'denied'
    return 'transient-error'
  }

  if (error instanceof HttpError) {
    if (error.status === 401 || error.status === 403) return 'denied'
    return 'transient-error'
  }

  return 'transient-error'
}
