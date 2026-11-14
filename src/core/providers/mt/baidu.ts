import { AppError, isAbortError } from '../../errors'
import type { MtServiceConfig } from '../../../storage/settings'
import type { TranslateProvider, TranslateRequest, TranslateResponse } from '../types'
import { ensureOk, fetchWithTimeout } from '../http'
import { toBaiduLang } from '../lang-map'
import { md5 } from './md5'

const ENDPOINT = 'https://fanyi-api.baidu.com/api/trans/vip/translate'
const MAX_BYTES = 5500
const MIN_INTERVAL_MS = 1000

type BaiduItem = { src?: string; dst?: string }

type BaiduPayload = {
  from?: string
  to?: string
  trans_result?: BaiduItem[]
  error_code?: string
  error_msg?: string
}

let lastRequestAt = 0

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForSlot(): Promise<void> {
  const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now()
  if (wait > 0) await sleep(wait)
  lastRequestAt = Date.now()
}

const ERRORS: Record<string, { code: 'auth' | 'quota' | 'network' | 'config'; message: string }> = {
  '52001': { code: 'network', message: '百度翻译请求超时，请重试' },
  '52002': { code: 'network', message: '百度翻译系统错误，请重试' },
  '52003': { code: 'auth', message: '百度翻译 AppID 无效，请检查' },
  '54000': { code: 'config', message: '百度翻译缺少必填参数' },
  '54001': { code: 'auth', message: '百度翻译签名错误：密钥不对，或 AppID 与密钥不属于同一个应用' },
  '54003': { code: 'quota', message: '百度翻译访问频率受限，请稍后重试' },
  '54004': { code: 'quota', message: '百度翻译账户余额不足' },
  '54005': { code: 'quota', message: '百度翻译长文本请求过于频繁，请稍后重试' },
  '58000': { code: 'config', message: '百度翻译客户端 IP 非法' },
  '58001': { code: 'config', message: '百度翻译不支持这个翻译方向' },
  '58002': { code: 'config', message: '百度翻译服务已关闭，请到开放平台开启' },
  '90107': { code: 'config', message: '百度翻译认证未通过或未生效' },
}

export function baiduError(code: string, message: string): AppError {
  const mapped = ERRORS[code]
  if (mapped) return new AppError(mapped.code, mapped.message)
  return new AppError('unknown', `百度翻译返回错误 ${code}${message ? `：${message}` : ''}`)
}

export function signBaidu(appId: string, text: string, salt: string, secret: string): string {
  return md5(appId + text + salt + secret)
}

export function parseBaidu(raw: unknown, expected: number): { segments: string[]; from: string } {
  const payload = raw as BaiduPayload
  if (payload && payload.error_code) throw baiduError(payload.error_code, payload.error_msg ?? '')
  const items = payload?.trans_result
  if (!Array.isArray(items)) throw new AppError('parse', '百度翻译没有返回译文')
  const segments = items.map((item) => (typeof item?.dst === 'string' ? item.dst : ''))
  if (segments.length !== expected) {
    throw new AppError('parse', `百度翻译返回了 ${segments.length} 段，但请求了 ${expected} 段`)
  }
  return { segments, from: typeof payload.from === 'string' ? payload.from : '' }
}

export function parseBaiduLines(raw: unknown): string {
  const payload = raw as BaiduPayload
  if (payload && payload.error_code) throw baiduError(payload.error_code, payload.error_msg ?? '')
  const items = payload?.trans_result
  if (!Array.isArray(items) || items.length === 0) throw new AppError('parse', '百度翻译没有返回译文')
  return items.map((item) => (typeof item?.dst === 'string' ? item.dst : '')).join('\n')
}

export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length
}

function cutWithin(text: string, limit: number): number {
  let low = 1
  let high = text.length
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    if (byteLength(text.slice(0, mid)) <= limit) low = mid
    else high = mid - 1
  }
  return low
}

export function chunkByBytes(text: string, limit = MAX_BYTES): string[] {
  if (byteLength(text) <= limit) return [text]
  const parts: string[] = []
  let resting = text
  while (byteLength(resting) > limit && resting.length > 0) {
    const cut = cutWithin(resting, limit)
    parts.push(resting.slice(0, cut))
    resting = resting.slice(cut)
  }
  if (resting) parts.push(resting)
  return parts
}

async function requestBaidu(
  config: MtServiceConfig,
  q: string,
  from: string,
  to: string,
  signal?: AbortSignal,
): Promise<BaiduPayload> {
  await waitForSlot()
  const appId = config.appId.trim()
  const salt = `${Date.now()}${Math.floor(Math.random() * 1000)}`
  const body = new URLSearchParams({
    q,
    from,
    to,
    appid: appId,
    salt,
    sign: signBaidu(appId, q, salt, config.secret.trim()),
  })
  const response = await fetchWithTimeout(
    ENDPOINT,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    },
    signal,
  )
  await ensureOk(response)
  return (await response.json()) as BaiduPayload
}

export function createBaiduProvider(config: MtServiceConfig): TranslateProvider {
  return {
    id: 'mt:baidu',
    label: '百度翻译',
    kind: 'mt',
    async translate(request: TranslateRequest): Promise<TranslateResponse> {
      if (!config.appId.trim()) throw new AppError('config', '百度翻译还没填 AppID')
      if (!config.secret.trim()) throw new AppError('config', '百度翻译还没填密钥')

      const from = toBaiduLang(request.sourceLang)
      const to = toBaiduLang(request.targetLang)
      const joined = request.segments.join('\n')
      const canJoin =
        request.segments.length > 1 &&
        !request.segments.some((segment) => segment.includes('\n')) &&
        byteLength(joined) <= MAX_BYTES

      if (canJoin) {
        try {
          const payload = await requestBaidu(config, joined, from, to, request.signal)
          const parsed = parseBaidu(payload, request.segments.length)
          request.onDelta?.(parsed.segments.join('\n\n'))
          return {
            segments: parsed.segments,
            engineLabel: '百度翻译',
            detectedLang: parsed.from || undefined,
          }
        } catch (error) {
          if (isAbortError(error)) throw error
          if (!(error instanceof AppError) || error.code !== 'parse') throw error
        }
      }

      const output: string[] = []
      let detected = ''
      for (const segment of request.segments) {
        const translated: string[] = []
        for (const piece of chunkByBytes(segment)) {
          const payload = await requestBaidu(config, piece, from, to, request.signal)
          const text = piece.includes('\n') ? parseBaiduLines(payload) : (parseBaidu(payload, 1).segments[0] ?? '')
          if (!detected && typeof payload.from === 'string') detected = payload.from
          translated.push(text)
          request.onDelta?.(text)
        }
        output.push(translated.join(''))
      }
      return { segments: output, engineLabel: '百度翻译', detectedLang: detected || undefined }
    },
  }
}
