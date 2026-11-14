export function chunkByLimits(segments: string[], maxItems: number, maxChars: number): string[][] {
  const groups: string[][] = []
  let current: string[] = []
  let chars = 0
  for (const segment of segments) {
    const tooLong = chars + segment.length > maxChars
    const tooMany = current.length >= maxItems
    if (current.length > 0 && (tooLong || tooMany)) {
      groups.push(current)
      current = []
      chars = 0
    }
    current.push(segment)
    chars += segment.length
  }
  if (current.length > 0) groups.push(current)
  return groups
}
