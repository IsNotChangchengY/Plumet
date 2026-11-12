import { AppError } from '../../errors'
import { parseIssues } from '../../check'
import type { RawIssue } from '../../check'
import type { AiProviderConfig } from '../../../storage/settings'
import { chatText } from './client'
import { buildCheckMessages, buildCheckRepairMessages } from './prompts'

export async function runCheckChunk(
  config: AiProviderConfig,
  text: string,
  signal?: AbortSignal,
): Promise<RawIssue[]> {
  const raw = await chatText(config, buildCheckMessages({ text }), signal)
  try {
    return parseIssues(raw)
  } catch (error) {
    if (!(error instanceof AppError) || error.code !== 'parse') throw error
    const retried = await chatText(config, buildCheckRepairMessages({ text, previous: raw }), signal)
    return parseIssues(retried)
  }
}
