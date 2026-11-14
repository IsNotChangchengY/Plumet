export type AiPreset = {
  id: string
  label: string
  baseUrl: string
  models: string[]
}

export const AI_PRESETS: AiPreset[] = [
  {
    id: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    models: ['deepseek-chat', 'deepseek-reasoner'],
  },
  {
    id: 'siliconflow',
    label: '硅基流动 SiliconFlow',
    baseUrl: 'https://api.siliconflow.cn/v1',
    models: ['deepseek-ai/DeepSeek-V3', 'Qwen/Qwen2.5-7B-Instruct', 'THUDM/glm-4-9b-chat'],
  },
  {
    id: 'openai',
    label: 'OpenAI / ChatGPT',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'],
  },
  {
    id: 'gemini',
    label: 'Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
  },
  {
    id: 'grok',
    label: 'Grok（xAI）',
    baseUrl: 'https://api.x.ai/v1',
    models: ['grok-4', 'grok-3-mini'],
  },
  {
    id: 'moonshot',
    label: 'Moonshot 月之暗面',
    baseUrl: 'https://api.moonshot.cn/v1',
    models: ['moonshot-v1-8k', 'moonshot-v1-32k'],
  },
  {
    id: 'zhipu',
    label: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: ['glm-4-flash', 'glm-4-plus'],
  },
  {
    id: 'dashscope',
    label: '阿里通义千问（兼容模式）',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: ['qwen-plus', 'qwen-turbo'],
  },
  {
    id: 'ollama',
    label: 'Ollama（本机）',
    baseUrl: 'http://localhost:11434/v1',
    models: ['qwen2.5:7b', 'llama3.1:8b'],
  },
  {
    id: 'lmstudio',
    label: 'LM Studio（本机）',
    baseUrl: 'http://127.0.0.1:1234/v1',
    models: [],
  },
  {
    id: 'custom',
    label: '自定义 OpenAI 兼容服务',
    baseUrl: '',
    models: [],
  },
]

export function findPreset(presetId: string): AiPreset {
  return AI_PRESETS.find((preset) => preset.id === presetId) ?? AI_PRESETS[AI_PRESETS.length - 1]
}

export function originPattern(baseUrl: string): string | null {
  try {
    const url = new URL(baseUrl.trim())
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return `${url.protocol}//${url.hostname}/*`
  } catch {
    return null
  }
}

export function isLocalBaseUrl(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl.trim())
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  } catch {
    return false
  }
}
