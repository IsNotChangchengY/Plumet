# 服务商对接规范

> 改动服务商层时，同步本文件与 `AGENTS.md`；维护与同步规则见 [README.md](README.md)。

## 1. 契约

所有服务商实现 `src/core/providers/types.ts`：

```ts
interface TranslateProvider {
  id: string            // 'ai:<providerId>' | 'mt:baidu' | 'mt:microsoft' | 'mt:google-free' | 'mt:mymemory'
  label: string         // 显示在弹窗与设置里
  kind: 'mt' | 'ai'
  translate(request: TranslateRequest): Promise<TranslateResponse>
}
```

- `request.segments`：要翻译的文本段（弹窗一般 1 段，网页翻译一批 8 段、划词 1 段）。
- `request.sourceLang`：可能是 `auto`，MT 服务商需要自己处理（`lang-map.ts` 转码，或本地检测）。
- `request.context / glossary`：上下文与术语表，MT 可忽略；网页翻译不传 context（见第 9 节）。
- `request.onDelta`：有就推流（AI 单段实现；百度/微软按批整段推）。
- `request.signal`：取消。
- 网页翻译在协议层用 `TranslateJobRequest.silent` 标记「不要写历史」，服务商层无感知。

引擎层（`src/core/engine.ts`）只做三件事：查缓存 → 取主引擎 → 写缓存。**没有失败降级**。

## 2. 引擎就绪与错误策略

服务是否可用由 `src/core/providers/services.ts` 判定，UI 与运行时共用同一份结果：

| 引擎 | 就绪条件 |
|---|---|
| `mt:google-free` / `mt:mymemory` | 服务开关未关闭 |
| `mt:baidu` | AppID 与密钥都填了 |
| `mt:microsoft` | 订阅 Key 填了（区域可选） |
| `ai:<id>` | Base URL、模型、API Key 都填了；`localhost` / `127.0.0.1` 不要求 Key |

规则：

1. 引擎下拉只列**就绪**的服务；槽位已选中但后来失效的，仍显示该值并标「未配置」，旁边给「去配置」。
2. 主引擎未就绪时直接抛 `config`，**不发请求、不换引擎**。
3. 主引擎就绪但运行时失败（网络、限流、返回格式），同样直接报错，不再尝试别的通道。
4. 检查 / 润色的「自动」= 翻译引擎是可用 AI 就用它，否则用第一个可用 AI；一个都没有就报 `config`。

## 3. 新增一个服务商（三步）

1. 在 `src/core/providers/mt/` 或 `src/core/providers/ai/` 新建文件，导出 `createXxxProvider()`。
2. 在 `src/core/providers/services.ts` 里加服务定义（显示名、标签、凭证字段、申请入口、额度说明、申请步骤），并在 `missingMtFields()` / `createMtProvider()` 里补判定与工厂。
3. `registry.ts` 的 `listEngines()` / `resolveEngine()` 会自动带出它；设置页 `src/options/ServicesSection.tsx` 会自动渲染凭证表单与「测试连接」。
   需要新凭证字段时，在 `src/storage/settings.ts` 的 `MtServiceConfig` 加字段并补 `normalizeSettings()` 的收敛。

请求统一用 `src/core/providers/http.ts` 的 `fetchWithTimeout()`（90 秒超时 + 取消联动）与 `ensureOk()`（把 HTTP 状态映射成中文错误）。

## 4. 错误码（UI 会原样展示）

| code | 触发 | 提示 |
|---|---|---|
| `auth` | 401/403、百度 52003/54001 | 密钥无效、签名错误或没有权限 |
| `config` | 404、未选引擎、凭证缺失、语言方向不支持 | 配置不对，去设置页 |
| `quota` | 429、百度 54003/54004/54005 | 请求过频或额度不足 |
| `network` | 超时、TypeError、5xx、百度 52001/52002 | 网络不通或服务端出错 |
| `parse` | 返回格式不符、段数不一致 | 服务商返回了意外数据 |
| `abort` | 用户取消 | 已取消 |

## 5. AI 适配（OpenAI 兼容）

- 端点：`{baseUrl}/chat/completions`，`Authorization: Bearer <key>`（key 为空时不发，兼容 Ollama）。
- 单段 + 有 `onDelta`：`stream: true`，逐行解析 `data: {...}`（`[DONE]` 结束）。
- 多段：请求 JSON，提示模型只返回 `{"translations": [...]}`；用 zod 校验；条数不一致直接报 `parse`（避免段落错位）。
- 批量上限：单批 16 段 / 2200 字符，超出自动分组，串行发送。
- 内置预设（`src/core/providers/ai/presets.ts`）：OpenAI / ChatGPT、Gemini、Grok（xAI）、DeepSeek、硅基流动、Moonshot、智谱、通义兼容模式、Ollama、LM Studio、自定义。
- Gemini 走 Google 官方的 OpenAI 兼容层：Base URL `https://generativelanguage.googleapis.com/v1beta/openai`，不需要单独适配器（待实测：流式与批量 JSON 的稳定性）。
- Grok 用 `https://api.x.ai/v1`；ChatGPT 即 OpenAI 官方接口，必须自备 API Key（网页版没有公开接口）。

**权限**：固定厂商域名已写进 `public/manifest.json` 的 `host_permissions`，装好即可用；自定义 / 本地端点仍走 `optional_host_permissions` + 设置页点击「授权并测试」触发 `chrome.permissions.request()`（浏览器要求用户手势；模式里不能带端口）。

## 6. 需要凭证的机器翻译

### 6.1 百度翻译（`src/core/providers/mt/baidu.ts`）

- 端点：`POST https://fanyi-api.baidu.com/api/trans/vip/translate`，`application/x-www-form-urlencoded`。
- 参数：`q / from / to / appid / salt / sign`，`sign = md5(appid + q + salt + 密钥)` 32 位小写。
- **浏览器没有 MD5**（`crypto.subtle` 只有 SHA 系），所以自带一份纯 TS 实现 `src/core/providers/mt/md5.ts`，用已知向量与 Node `crypto` 对拍（`tests/services.test.ts`）。
- 语言码要转换（`src/core/providers/lang-map.ts`）：`zh-CN→zh`、`zh-TW→cht`、`ja→jp`、`ko→kor`、`fr→fra`、`es→spa`、`ar→ara`；`auto` 直传。
- 限制：单次 `q ≤ 6000` 字节（适配器按 5500 字节切分）；标准版 QPS = 1，适配器用 1 秒间隔串行排队，网页翻译一批 8 段会明显变慢。
- 多段：先把多段用换行拼成一条 `q`，按 `trans_result` 数组还原（待实测：官方是否稳定按行返回）；条数不符自动退回逐段请求。
- 错误码映射见第 4 节；返回体是 200 + `error_code`，不是 HTTP 错误，适配器解析后抛 `AppError`。
- 免费额度以开放平台定价为准（个人认证约 5 万字符/月）。

### 6.2 微软 / 必应翻译（`src/core/providers/mt/microsoft.ts`）

「必应翻译」与「微软翻译」是同一条 Azure AI Translator v3 接口，只做一份适配器。

- 端点：`POST {endpoint}/translate?api-version=3.0&to=zh-Hans[&from=en]`，默认 `https://api.cognitive.microsofttranslator.com`，可在设置里换成自定义 Endpoint（VNET / 私有资源）。
- 头：`Ocp-Apim-Subscription-Key`、`Ocp-Apim-Subscription-Region`（区域资源必填，全球资源可空）、`Content-Type: application/json`。
- 体：`[{ "text": "..." }]`，单次 ≤ 100 条 / 5 万字符；响应 `[{ translations: [{ text, to }], detectedLanguage }]`。
- 语言码用 BCP-47：`zh-CN→zh-Hans`、`zh-TW→zh-Hant`；源语言为 `auto` 时不传 `from`。
- 免费层 F0 约 200 万字符/月（以官网为准）。

## 7. 免费通道实测记录（2026 年实测，环境：本机 Edge 157）

| 通道 | 结果 | 结论 |
|---|---|---|
| `clients5.google.com/translate_a/t?client=dict-chrome-ex&sl&tl&q…` | 200；多 `q` 参数正常；1200 字符长文正常 | ✅ 默认免费 MT |
| `translate.googleapis.com/translate_a/single?client=gtx` | 429 Too Many Requests | ⚠️ 仅备用，未接入 |
| `edge.microsoft.com/translate/auth` | 404（免 Key 路径已失效） | ❌ 不接入 |
| `www.bing.com/ttranslatev3`（无 IG/IID） | 200 但响应体为空 | ❌ 需页面 token，弃用；必应改走 Azure v3 |
| `api.mymemory.translated.net/get?q&langpair` | 200 正常，返回 `responseData.translatedText` | ✅ 免费兜底（限额约 5000 字符/天） |
| `fanyi.youdao.com/translate?doctype=json` | 返回 HTML 页面 | ❌ 旧接口已下线 |
| `transmart.qq.com/api/imt` | `Auth-Failed` | ❌ 需要鉴权 |
| LibreTranslate 公共实例 | 403 | ❌ |
| DeepSeek `api.deepseek.com/v1` | 401（无 Key）→ 网络可达 | ✅ 走用户 Key |

谷歌免费通道细节：

- 请求：`GET https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=auto&tl=zh-CN&q=第一段&q=第二段`
- 返回：`[["译文1","en"],["译文2","en"]]`（第二个元素是识别到的源语言）；也见过扁平形式 `["译文","en"]`，解析函数两种都兼容。
- 限制：单次条数与字符数已在适配器里切分（20 段 / 3000 字符）。
- 性质：非官方公开接口，可能随时变化或限流。

MyMemory 细节：

- 请求：`GET https://api.mymemory.translated.net/get?q=文本&langpair=en|zh-CN`
- 不支持 `auto`：先用 `detectLang()` 检测源语言。
- 单次约 500 字节，适配器按 400 字符切片并在片段间停 150ms。
- 匿名额度约 5000 字符/天，超了会返回 warning 字样，已映射成 `quota` 错误。

## 8. 检查与润色的模型调用（M2）

两条链路都只走 AI（免费机器翻译做不了这些）：

- 检查：`/chat/completions`，`stream: false`，要求模型只返回
  `{"issues":[{"quote":"原文片段","replacement":"改法","category":"...","severity":"...","explanation":"一句中文"}]}`。
  解析顺序：`extractJsonObject()` 剥代码块 → `JSON.parse` → zod（未知 category/severity 用 `.catch()` 回退，不整条失败）→ 失败一次修复重试（把上次输出回灌给模型）→ 仍失败报 `parse`。
- 润色：`/chat/completions`，`stream: true`，只要润色后的全文；diff 由前端算，不让模型描述改动。
- 分段：检查按 1400 字符切段、串行调用，每段 emit 一次 `progress`；润色整段一次调用。
- 润色「原文 / 润色稿」的判定都在前端，不依赖模型输出结构。

## 9. 成本与限流

- AI 长文翻译很贵：网页翻译默认走免费通道，把网页翻译切到 AI 时按段计费。
- 网页翻译的分批：8 段 / 1200 字符一批，content script 侧最多 2 批并发；批次落在缓存键上，同一页重复翻译基本零成本。
- 缓存键包含引擎、语言、上下文、原文，所以换引擎不会错误复用；重复的句子第二次不再花钱。
- 批量并发：AI 适配器内部按 16 段 / 2200 字符再分组、串行发送；网页翻译的并发在批次这一层。
- 划词翻译复用 `settings.translateEngine`；上下文（页面标题 + 网站 + 段落）会进入缓存键，所以同一个词在不同段落会各请求一次，这是刻意行为。
- 网页翻译刻意**不带** context（只带语言对）：一批 8 段本身已经提供局部连贯性，而按页面语境写缓存会让同一句话在每个网站各存一份，浪费空间与额度。
- 没有失败降级后，「省额度」只能靠缓存与手动切引擎；关掉的免费通道不会再被悄悄使用。
