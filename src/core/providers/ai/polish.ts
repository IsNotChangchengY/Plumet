import { AppError } from '../../errors'
import type { AiProviderConfig } from '../../../storage/settings'
import { chatStream } from './client'
import { buildPolishMessages } from './prompts'

export async function runPolish(
  config: AiProviderConfig,
  input: { text: string; instruction: string },
  onDelta: ((delta: string) => void) | undefined,
  signal?: AbortSignal,
): Promise<string> {
  const raw = await chatStream(config, buildPolishMessages(input), onDelta, signal)
  const polished = raw.trim()
  if (!polished) throw new AppError('parse', 'AI 没有返回润色结果')
  return polished
}
