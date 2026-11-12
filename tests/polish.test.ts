import { describe, expect, it } from 'vitest'
import { POLISH_CHIPS, buildPolishInstruction } from '../src/core/polish'

describe('buildPolishInstruction', () => {
  it('把选中的 chips 翻译成提示词', () => {
    const instruction = buildPolishInstruction(['poetic', 'keep-terms'], '')
    expect(instruction).toContain('诗意')
    expect(instruction).toContain('术语')
    expect(instruction).toContain('风格要求')
  })

  it('自定义要求单独成段', () => {
    const instruction = buildPolishInstruction([], '写给中学生看，不要用生僻词')
    expect(instruction).toContain('额外要求：写给中学生看，不要用生僻词')
  })

  it('chips 与自定义要求可以叠加', () => {
    const instruction = buildPolishInstruction(['formal'], '保留原文的三个段落')
    expect(instruction).toContain('正式')
    expect(instruction).toContain('保留原文的三个段落')
  })

  it('都不选时返回空字符串，由提示词兜底', () => {
    expect(buildPolishInstruction([], '   ')).toBe('')
  })

  it('chips 列表里有「更诗意」，对应需求', () => {
    expect(POLISH_CHIPS.some((chip) => chip.id === 'poetic' && chip.label === '更诗意')).toBe(true)
  })
})
