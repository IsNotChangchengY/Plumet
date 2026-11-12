export type ErrorCode = 'auth' | 'quota' | 'network' | 'parse' | 'abort' | 'config' | 'unknown'

export class AppError extends Error {
  readonly code: ErrorCode

  constructor(code: ErrorCode, message: string) {
    super(message)
    this.name = 'AppError'
    this.code = code
  }
}

export function isAbortError(error: unknown): boolean {
  if (error instanceof AppError) return error.code === 'abort'
  if (error instanceof DOMException && error.name === 'AbortError') return true
  if (error instanceof Error && error.name === 'AbortError') return true
  return false
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error
  if (isAbortError(error)) return new AppError('abort', '请求已取消')
  if (error instanceof TypeError) {
    return new AppError('network', '网络请求失败：可能是网络不通，或该服务不允许扩展访问')
  }
  if (error instanceof Error) return new AppError('unknown', error.message || '未知错误')
  return new AppError('unknown', '未知错误')
}

export function errorText(error: unknown): string {
  return toAppError(error).message
}
