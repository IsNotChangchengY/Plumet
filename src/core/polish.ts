export type PolishChip = {
  id: string
  label: string
  prompt: string
}

export const POLISH_CHIPS: PolishChip[] = [
  { id: 'natural', label: '更自然', prompt: '让表达更自然流畅，像母语者写的' },
  { id: 'formal', label: '更正式', prompt: '改成正式书面语' },
  { id: 'casual', label: '更口语', prompt: '改成自然的口语表达' },
  { id: 'poetic', label: '更诗意', prompt: '让语言更有诗意、更有画面感' },
  { id: 'concise', label: '更简洁', prompt: '精简冗余，让句子更短更有力' },
  { id: 'academic', label: '更学术', prompt: '改成学术写作风格，术语准确' },
  { id: 'keep-terms', label: '保留术语', prompt: '专业术语与专有名词保持原样' },
  { id: 'keep-length', label: '长度相近', prompt: '尽量保持与原文字数接近' },
]

export function chipLabel(id: string): string {
  return POLISH_CHIPS.find((chip) => chip.id === id)?.label ?? id
}

export function buildPolishInstruction(chipIds: string[], custom: string): string {
  const prompts = chipIds
    .map((id) => POLISH_CHIPS.find((chip) => chip.id === id)?.prompt)
    .filter((prompt): prompt is string => Boolean(prompt))
  const parts: string[] = []
  if (prompts.length > 0) parts.push(`风格要求：${prompts.join('；')}。`)
  if (custom.trim()) parts.push(`额外要求：${custom.trim()}`)
  return parts.join('\n')
}
