import { AppError } from '../errors'

const DEFAULT_TIMEOUT_MS = 90_000

export type LinkedSignal = {
  signal: AbortSignal
  cleanup: () => void
  timedOut: () => boolean
}

export function linkedSignal(signal?: AbortSignal, timeoutMs = DEFAULT_TIMEOUT_MS): LinkedSignal {
  const controller = new AbortController()
  let didTimeOut = false
  const timer = setTimeout(() => {
    didTimeOut = true
    controller.abort()
  }, timeoutMs)
  const onAbort = () => controller.abort()
  if (signal) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener('abort', onAbort, { once: true })
  }
  return {
    signal: controller.signal,
    timedOut: () => didTimeOut,
    cleanup: () => {
      clearTimeout(timer)
      if (signal) signal.removeEventListener('abort', onAbort)
    },
  }
}

export async function fetchWithTimeout(url: string, init: RequestInit, signal?: AbortSignal): Promise<Response> {
  const linked = linkedSignal(signal)
  try {
    return await fetch(url, { ...init, signal: linked.signal })
  } catch (error) {
    if (linked.timedOut()) {
      throw new AppError('network', '请求超时（90 秒），请检查网络或换一个更快的服务')
    }
    throw error
  } finally {
    linked.cleanup()
  }
}

export async function ensureOk(response: Response): Promise<void> {
  if (response.ok) return
  let detail = ''
  try {
    detail = (await response.text()).slice(0, 300)
  } catch {
    detail = ''
  }
  const suffix = detail ? `：${detail}` : ''
  if (response.status === 401 || response.status === 403) {
    throw new AppError('auth', `API Key 无效或没有权限（HTTP ${response.status}）${suffix}`)
  }
  if (response.status === 404) {
    throw new AppError('config', `接口地址不对（HTTP 404），请检查 Base URL 是否以 /v1 结尾${suffix}`)
  }
  if (response.status === 429) {
    throw new AppError('quota', `请求过于频繁或额度不足（HTTP 429）${suffix}`)
  }
  if (response.status >= 500) {
    throw new AppError('network', `服务端出错（HTTP ${response.status}）${suffix}`)
  }
  throw new AppError('unknown', `请求失败（HTTP ${response.status}）${suffix}`)
}

export function extractJsonObject(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const raw = fenced && fenced[1] ? fenced[1] : text
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start >= 0 && end > start) return raw.slice(start, end + 1)
  return raw.trim()
}
