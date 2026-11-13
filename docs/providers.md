# 服务商对接规范

> 改动服务商层时，同步本文件与 `AGENTS.md`；维护与同步规则见 [README.md](README.md)。

## 1. 契约

所有服务商实现 `src/core/providers/types.ts`：

```ts
interface TranslateProvider {
  id: string            // 'ai:<providerId>' | 'mt:google-free' | 'mt:mymemory'
  label: string         // 显示在弹窗与设置里
  kind: 'mt' | 'ai'
  translate(request: TranslateRequest): Promise<TranslateResponse>
}
```

- `request.segments`：要翻译的文本段（弹窗一般 1 段，网页翻译一批 8 段、划词 1 段）。
- `request.sourceLang`：可能是 `auto`，MT 服务商需要自己检测（`resolveSourceLang`）。
- `request.context / glossary`：上下文与术语表，MT 可忽略；网页翻译不传 context（见第 7 节）。
- `request.onDelta`：有就流式推送（目前只有 AI 单段实现；网页翻译不用 delta，直接等 `done`）。
- `request.signal`：取消。
- 网页翻译在协议层用 `TranslateJobRequest.silent` 标记「不要写历史」，服务商层无感知。

引擎层（`src/core/engine.ts`）负责：缓存 → 主引擎 → 失败降级到免费通道 → 标记 `usedFallback`。

## 2. 新增一个服务商（三步）

1. 在 `src/core/providers/mt/` 或 `src/core/providers/ai/` 新建文件，导出 `createXxxProvider()`。
2. 在 `src/core/providers/registry.ts` 里给 `resolveEngine()` 加分支，并在 `listEngines()` 里给显示名。
3. 如果是需要 Key 的 MT 服务，在 `settings.Settings` 加配置字段 + 设置页加表单；如果是 AI 兼容服务，直接加到 `ai/presets.ts` 即可。

请求统一用 `src/core/providers/http.ts` 的 `fetchWithTimeout()`（90 秒超时 + 取消联动）与 `ensureOk()`（把 HTTP 状态映射成中文错误）。

## 3. 错误码（UI 会原样展示）

| code | 触发 | 提示 |
|---|---|---|
| `auth` | 401/403 | API Key 无效或没有权限 |
| `config` | 404 / 未选引擎 / Base URL 空 | 接口地址或配置不对，去设置页 |
| `quota` | 429 | 请求过频或额度不足 |
| `network` | 超时、TypeError、5xx | 网络不通或服务端出错 |
| `parse` | 返回格式不符 | 服务商返回了意外数据 |
| `abort` | 用户取消 | 已取消 |

## 4. AI 适配（OpenAI 兼容）

- 端点：`{baseUrl}/chat/completions`，`Authorization: Bearer <key>`（key 为空时不发，兼容 Ollama）。
- 单段 + 有 `onDelta`：`stream: true`，逐行解析 `data: {...}`（`[DONE]` 结束）。
- 多段：请求 JSON，提示模型只返回 `{"translations": [...]}`；用 zod 校验；条数不一致直接报 `parse`（避免段落错位）。
- 批量上限：单批 16 段 / 2200 字符，超出自动分组，串行发送。
- 网页翻译每批 8 段 / 1200 字符，在 AI 适配器里不会再被二次拆分。
- 内置预设：DeepSeek、硅基流动、OpenAI、Moonshot、智谱、通义兼容模式、Ollama、LM Studio、自定义。

**权限**：自定义端点不在 manifest 的 `host_permissions` 里，必须在设置页点「授权并测试」触发 `chrome.permissions.request({ origins:['https://host/*'] })`（浏览器要求用户手势；模式里不能带端口）。授权后 SW 才能 fetch。

## 5. 免费通道实测记录（2026 年实测，环境：本机 Edge 157）

| 通道 | 结果 | 结论 |
|---|---|---|
| `clients5.google.com/translate_a/t?client=dict-chrome-ex&sl&tl&q…` | 200；多 `q` 参数正常；1200 字符长文正常 | ✅ 默认免费 MT |
| `translate.googleapis.com/translate_a/single?client=gtx` | 429 Too Many Requests | ⚠️ 仅备用，未接入 |
| `edge.microsoft.com/translate/auth` | 404（免 Key 路径已失效） | ❌ 不接入 |
| Azure Translator（正式 Key） | 需 Key，未实测 | 预留适配器 |
| `www.bing.com/ttranslatev3`（无 IG/IID） | 200 但响应体为空 | ❌ 需页面 token，弃用 |
| `api.mymemory.translated.net/get?q&langpair` | 200 正常，返回 `responseData.translatedText` | ✅ 免费兜底（限额约 5000 字符/天） |
| `fanyi.youdao.com/translate?doctype=json` | 返回 HTML 页面 | ❌ 旧接口已下线 |
| `transmart.qq.com/api/imt` | `Auth-Failed` | ❌ 需要鉴权 |
| LibreTranslate 公共实例 | 403 | ❌ |
| DeepSeek `api.deepseek.com/v1` | 401（无 Key）→ 网络可达 | ✅ 走用户 Key |

谷歌免费通道细节：

- 请求：`GET https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=auto&tl=zh-CN&q=第一段&q=第二段`
- 返回：`[["译文1","en"],["译文2","en"]]`（第二个元素是识别到的源语言）；也见过扁平形式 `["译文","en"]`，解析函数两种都兼容。
- 限制：单次条数与字符数已在适配器里切分（20 段 / 3000 字符）。
- 性质：非官方公开接口，可能随时变化或限流；所以它只当兜底，不能当唯一引擎。

MyMemory 细节：

- 请求：`GET https://api.mymemory.translated.net/get?q=文本&langpair=en|zh-CN`
- 不支持 `auto`：先用 `detectLang()` 检测源语言。
- 单次约 500 字节，适配器按 400 字符切片并在片段间停 150ms。
- 匿名额度约 5000 字符/天，超了会返回 warning 字样，已映射成 `quota` 错误。

## 6. 检查与润色的模型调用（M2）

两条链路都只走 AI（免费机器翻译做不了这些）：

- 检查：`/chat/completions`，`stream: false`，要求模型只返回
  `{"issues":[{"quote":"原文片段","replacement":"改法","category":"...","severity":"...","explanation":"一句中文"}]}`。
  解析顺序：`extractJsonObject()` 剥代码块 → `JSON.parse` → zod（未知 category/severity 用 `.catch()` 回退，不整条失败）→ 失败一次修复重试（把上次输出回灌给模型）→ 仍失败报 `parse`。
- 润色：`/chat/completions`，`stream: true`，只要润色后的全文；diff 由前端算，不让模型描述改动。
- 分段：检查按 1400 字符切段、串行调用，每段 emit 一次 `progress`；润色整段一次调用。
- 额度：检查一段 ≈ 1 次调用；长文会按段数线性增加成本，UI 会显示段进度。

## 7. 成本与限流

- AI 长文翻译很贵：网页翻译默认走免费通道，把网页翻译切到 AI 时，设置页的引擎提示会说明按段计费。
- 网页翻译的分批：8 段 / 1200 字符一批，content script 侧最多 2 批并发；批次落在缓存键上，同一页重复翻译基本零成本。
- 缓存键包含引擎、语言、上下文、原文，所以换引擎不会错误复用；重复的句子第二次不再花钱。
- 批量并发：AI 适配器内部按 16 段 / 2200 字符再分组、串行发送；网页翻译的并发在批次这一层。
- 划词翻译复用 `settings.translateEngine`；上下文（页面标题 + 网站 + 段落）会进入缓存键，所以同一个词在不同段落会各请求一次，这是刻意行为。
- 网页翻译刻意**不带** context（只带语言对）：一批 8 段本身已经提供局部连贯性，而按页面语境写缓存会让同一句话在每个网站各存一份，浪费空间与额度。
