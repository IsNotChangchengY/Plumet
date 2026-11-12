const MAX_SEGMENT_CHARS = 2500

export function splitSegments(text: string): string[] {
  const trimmed = text.trim()
  if (!trimmed) return []
  if (trimmed.length <= MAX_SEGMENT_CHARS) return [trimmed]

  const paragraphs = trimmed
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)

  const segments: string[] = []
  let current = ''

  for (const paragraph of paragraphs) {
    if (paragraph.length > MAX_SEGMENT_CHARS) {
      if (current) {
        segments.push(current)
        current = ''
      }
      for (let index = 0; index < paragraph.length; index += MAX_SEGMENT_CHARS) {
        segments.push(paragraph.slice(index, index + MAX_SEGMENT_CHARS))
      }
      continue
    }
    const merged = current ? `${current}\n\n${paragraph}` : paragraph
    if (merged.length > MAX_SEGMENT_CHARS) {
      segments.push(current)
      current = paragraph
    } else {
      current = merged
    }
  }

  if (current) segments.push(current)
  return segments.length > 0 ? segments : [trimmed]
}
