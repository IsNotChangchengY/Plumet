// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AiProviderConfig } from '../src/storage/settings'
import { runCheckChunk } from '../src/core/providers/ai/check'
import { runPolish } from '../src/core/providers/ai/polish'
import { applyIssues, locateIssues } from '../src/core/check'
import { diffMarks, resultText } from '../src/core/marks'

const config: AiProviderConfig = {
  id: 'test',
  label: 'Mock',
  presetId: 'custom',
  baseUrl: 'https://mock.local/v1',
  apiKey: 'sk-test',
  model: 'mock-model',
  temperature: 0.2,
}

function jsonResponse(content: string): Response {
  return new Response(
    JSON.stringify({ choices: [{ message: { content } }] }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}

function sseResponse(pieces: string[]): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const piece of pieces) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`),
        )
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      controller.close()
    },
  })
  return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AI 检查链路（mock 服务）', () => {
  it('请求体包含原文，问题能定位并生成终稿', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      calls.push(String(init.body))
      return jsonResponse(
        '```json\n{"issues":[{"quote":"teh","replacement":"the","category":"spelling","severity":"error","explanation":"拼写错误"}]}\n```',
      )
    })

    const text = 'I have teh book.'
    const raw = await runCheckChunk(config, text)
    expect(raw).toHaveLength(1)
    expect(calls[0]).toContain('I have teh book.')

    const { located, dropped } = locateIssues(raw, text, 0, 'c0')
    expect(dropped).toBe(0)
    expect(applyIssues(text, located)).toBe('I have the book.')
  })

  it('第一次返回非 JSON 时会自动修复重试', async () => {
    let attempt = 0
    vi.stubGlobal('fetch', async () => {
      attempt += 1
      if (attempt === 1) return jsonResponse('抱歉，我无法检查这段文本。')
      return jsonResponse('{"issues":[]}')
    })

    const raw = await runCheckChunk(config, 'hello world')
    expect(attempt).toBe(2)
    expect(raw).toEqual([])
  })
})

describe('AI 润色链路（mock 服务）', () => {
  it('流式增量拼接出润色稿，diff 能还原结果', async () => {
    vi.stubGlobal('fetch', async () => {
      return sseResponse(['这个设计', '真的', '很不错。'])
    })

    const deltas: string[] = []
    const polished = await runPolish(
      config,
      { text: '这个设计很好。', instruction: '更自然一点' },
      (delta) => deltas.push(delta),
    )

    expect(polished).toBe('这个设计真的很不错。')
    expect(deltas.join('')).toBe(polished)

    const marks = diffMarks('这个设计很好。', polished)
    expect(resultText(marks)).toBe(polished)
    expect(marks.some((mark) => mark.kind === 'ins')).toBe(true)
  })
})
