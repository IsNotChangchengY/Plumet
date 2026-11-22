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
- `request.context / glossary`：上下文与术语表，MT 可忽略；网页翻译不传 context（见第 9 节）。划词上下文由 `src/content/context.ts` 与 `src/content/structure.ts` 组装（标题 / 网站 / 段落窗口 / 章节标题链 / 相邻段（评论区与聊天列表按对话顺序取上下各最多 2 条评论/消息） / 列表 / 表格，范围与长度由 `selectionContextScope` / `selectionContextChars` 控制），对 AI 引擎只作消歧依据（prompt 明确「只翻译【原文】」），并对 AI 引擎参与缓存键（MT 引擎忽略上下文，也不计入键）。
- `request.onDelta`：有就推流（AI 单段实现；百度/微软按批整段推）。
- `request.signal`：取消。
- 网页翻译在协议层用 `TranslateJobRequest.silent` 标记「不要写历史」，服务商层无感知。

引擎层（`src/core/engine.ts`）只做三件事：查缓存 → 取指定引擎 → 写缓存。**没有失败降级**。翻译面板勾了多个引擎时，`src/background/jobs.ts` 按 `engineIds` 逐个并发调用它，每个引擎各走一遍这套流程，互不共享缓存判断结果。

词典是另一套契约（`src/core/dictionary/types.ts` 的 `DictionaryProvider`：`lookup(word, signal)` 返回 `DictionaryEntry | null`，`null` = 词典未收录），不参与引擎路由、不带凭证字段；见第 10 节。

## 2. 引擎就绪与错误策略

服务是否可用由 `src/core/providers/services.ts` 判定，UI 与运行时共用同一份结果：

| 引擎 | 就绪条件 |
|---|---|
| `mt:google-free` / `mt:mymemory` | 服务开关未关闭 |
| `mt:baidu` | AppID 与密钥都填了 |
| `mt:microsoft` | 订阅 Key 填了（区域可选） |
| `ai:<id>` | Base URL、模型、API Key 都填了；`localhost` / `127.0.0.1` 不要求 Key |

规则：

1. 引擎列表（弹窗与设置页的多选菜单）只列**就绪**的服务；已选中但后来失效的仍保留在列表里并标出缺失项，旁边给「去配置」。
2. 引擎未就绪时直接抛 `config`，**不发请求、不换引擎**；多引擎里只有那一张结果卡报错。
3. 主引擎就绪但运行时失败（网络、限流、返回格式），同样直接报错，不再尝试别的通道。
4. 检查 / 润色的「自动」= 按翻译面板的勾选顺序找第一个可用 AI，一个都没有就报 `config`。

## 3. 新增一个服务商（三步）

1. 在 `src/core/providers/mt/` 或 `src/core/providers/ai/` 新建文件，导出 `createXxxProvider()`。
2. 在 `src/core/providers/services.ts` 里加服务定义（显示名、标签、凭证字段、申请入口、额度说明、申请步骤），并在 `missingMtFields()` / `createMtProvider()` 里补判定与工厂。
3. `registry.ts` 的 `listEngines()` / `resolveEngine()` 会自动带出它；设置页 `src/options/ServicesSection.tsx` 会自动渲染凭证表单与「测试连接」。
   需要新凭证字段时，在 `src/storage/settings.ts` 的 `MtServiceConfig` 加字段并补 `normalizeSettings()` 的收敛。

新增词典服务同理，见第 10 节末尾。

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
- 思考强度：`AiProviderConfig.reasoningEffort` 取 `'' | 'low' | 'medium' | 'high'`，空串（设置页显示「跟随模型默认」）时**请求体里不带 `reasoning_effort`**，只有选了档位才下发。OpenAI 兼容层对它支持不一致（不支持的模型或网关直接 400），所以默认不下发；档位对该服务的翻译、检查、润色与「授权并测试」都生效。

**权限**：固定厂商域名已写进 `public/manifest.json` 的 `host_permissions`，装好即可用；自定义 / 本地端点仍走 `optional_host_permissions` + 设置页点击「授权并测试」触发 `chrome.permissions.request()`（浏览器要求用户手势；模式里不能带端口）。

## 6. 需要凭证的机器翻译

### 6.1 百度翻译（`src/core/providers/mt/baidu.ts`）

- 端点：`POST https://fanyi-api.baidu.com/api/trans/vip/translate`，`application/x-www-form-urlencoded`。
- 参数：`q / from / to / appid / salt / sign`，`sign = md5(appid + q + salt + 密钥)` 32 位小写。
- **浏览器没有 MD5**（`crypto.subtle` 只有 SHA 系），所以自带一份纯 TS 实现 `src/core/providers/mt/md5.ts`，用已知向量与 Node `crypto` 对拍（`tests/services.test.ts`）。
- 语言码要转换（`src/core/providers/lang-map.ts`）：`zh-CN→zh`、`zh-TW→cht`、`ja→jp`、`ko→kor`、`fr→fra`、`es→spa`、`ar→ara`；`auto` 直传。
- 限制：单次 `q ≤ 6000` 字节（适配器按 5500 字节切分）；标准版 QPS = 1，适配器用 1 秒间隔串行排队，网页翻译一批 8 段会明显变慢。
- 多段：先把多段用换行拼成一条 `q`，按 `trans_result` 数组还原（待实测：官方是否稳定按行返回）；条数不符自动退回逐段请求。
- 单段内含换行（划词多行选区、弹窗粘贴多行）：百度会把它当多条 query 返回，不能按 1 段校验，走 `parseBaiduLines()` 把 `dst` 按行拼回 `\n`。
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
| `dict.youdao.com/jsonapi?q=hello` | 200；返回 `simple` / `ec` / `ee` / `wfs` / `blng_sents_part` / `phrs`；未收录的词只回 `input/meta` | ✅ 词典主通道 |
| `dict.youdao.com/dictvoice?audio=hello&type=1` | 200 `audio/mpeg`（约 11.5 KB） | ✅ 英式发音 |
| `dict.youdao.com/dictvoice?audio=hello&type=2` | 200 `audio/mpeg`（约 10.6 KB） | ✅ 美式发音 |
| `api.dictionaryapi.dev/api/v2/entries/en/hello` | 200；不存在的词 404 + `{"title":"No Definitions Found"}` | ✅ 英英词典 |

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
- 网页翻译的分批：8 段 / 1200 字符一批，content script 侧最多 2 批并发；批次先查主缓存（命中直接回），未命中时再按段查 `cache.segments.v1`、只把真正没译过的段发出去（部分命中时整批取回、不推流），所以同一页重翻基本零成本，改版页面里没变的段落、站内别处出现过的同一句也不用重翻。
- 缓存键包含引擎、修订、语言、上下文（只有 AI 引擎计入）、原文；上下文与原文都会归一空白、零宽字符、宽空格与换行符写法（段落结构保留）。修订对 AI 引擎是「提示词版本 + 模型」、对 MT 是固定值，所以换引擎、换模型或改 prompt 都不会错误复用；重复的句子第二次不再花钱。主缓存上限 1000 条、段缓存上限 3000 条，TTL 都是 7 天且**滑动过期**：命中会把条目刷到最新（同时用作 LRU 顺序），7 天没被访问才过期——常翻的句子不会因为「存满 7 天」突然重新花钱。
- 批量并发：AI 适配器内部按 16 段 / 2200 字符再分组、串行发送；网页翻译的并发在批次这一层。
- 划词翻译复用翻译面板的主引擎（`primaryTranslateEngine()`，即第一个勾选的引擎），不跑多引擎；AI 引擎的上下文（页面标题 + 网站 + 段落与结构上下文，随范围设置变化）会进入缓存键，所以同一个词在不同段落会各请求一次，这是刻意行为；MT 引擎不读上下文，同一句跨页面直接复用。邻段会跳过 nav / aside / footer / pre / code 等噪音与另一种语言的段落；选区超过 2000 字时只带标题与网站。
- 网页翻译刻意**不带** context（只带语言对）：一批 8 段本身已经提供局部连贯性，而按页面语境写缓存会让同一句话在每个网站各存一份，浪费空间与额度。段缓存同样不含上下文，所以同一句话跨页面、跨批次都能直接复用。
- 没有失败降级后，「省额度」只能靠缓存与手动切引擎；关掉的免费通道不会再被悄悄使用。
## 10. 词典接口

单词查词走独立于翻译引擎的一条链路：`src/core/providers/dict/` 下每个服务实现 `DictionaryProvider`，由 `src/core/dictionary/lookup.ts` 统一调用并做持久缓存（键 `服务:小写词`，TTL 24 小时滑动、命中刷新时间、上限 200 条，落盘在 `chrome.storage.local` 的 `dict.v1`；过期与坏条目读入即丢弃，SW 被回收后仍能命中）。

### 10.1 契约

```ts
interface DictionaryProvider {
  id: 'youdao' | 'freedict'
  label: string
  capabilities: DictionaryCapabilities
  lookup(word: string, signal?: AbortSignal): Promise<DictionaryEntry | null>
}
```

- 返回 `null` 表示**词典未收录**（不是错误），调用方回退翻译。
- 查询词分两个方向：`en-zh`（英文词查中文）与 `zh-en`（1–4 个汉字查英文）；`DictionaryEntry.direction` 标明结果方向，`supportsChinese` 标明服务能不能查中文词（Free Dictionary 不能，`lookupWord()` 对这种组合直接抛 `config`，调用方不显示「词典查询失败」）。
- 网络、HTTP、解析失败抛 `AppError`；调用方同样回退翻译并带 `notice`——查词是增强功能，这是唯一允许的降级。
- `DictionaryEntry` 的六个字段与 `settings.dictionary.sections` 一一对应：`phonetics / translations / definitions / forms / examples / phrases`。
- 展示开关只影响渲染；抓取始终取全量字段，切换开关不用重新请求。

### 10.2 有道词典（`src/core/providers/dict/youdao.ts`）

- 端点：`GET https://dict.youdao.com/jsonapi?q=<词>`，免 Key、无凭证。
- 字段映射（英→中 `en-zh`）：
  - 音标：`simple.word[0].ukphone / usphone`，缺了退回 `ec.word[0]` 同名字段。
  - 发音：`https://dict.youdao.com/dictvoice?audio=<词>&type=1|2`（1 英 2 美）。
  - 中文释义：`ec.word[0].trs[].tr[].l.i`，字符串自带词性前缀（`int. …` / `【名】…`），解析时拆成 `pos` + `text`。
  - 词形变化：`ec.word[0].wfs[].wf`（`{name, value}`，复数 / 过去式 / 现在分词等）。
  - 英英释义：优先 `collins_primary.gramcat[].senses[].definition`（柯林斯，例句在 `senses[].examples[].example`），没有再退回 `ee.word.trs[].tr[].l.i`（WordNet；`ee.source.name` 为 Wikipedia 时这条是百科句子，不适合当释义）。
  - 双语例句：`blng_sents_part['sentence-pair'][].sentence / sentence-translation`。
  - 词组：`phrs.phrs[].phr.headword.l.i` + `phr.trs[].tr.l.i`。
- 未收录判定：HTTP 仍是 200，响应只有 `input / meta / le / lang`（`meta.isHasSimpleDict === "0"`）。**判据是中文释义或英英释义非空**，不能只看状态码。
- 词条字段多、体积大（hello 约 48 KB，长词条可到几十 KB），所以只取需要的六类并各自截断（释义 8 条、例句 3 条、词组 6 条）。
- 中→英（`zh-en`）字段映射：
  - 英文对应词：`ce.word[].trs[].tr[].l`；单词藏在 `l.i` 的节点数组里（`{"#text":"hello"}`、`{"#text":"hi"}`，中间夹空格字符串），按顺序拼成文本；词性在 `l.pos`（如 `vi.`）；`l.#tran` 是这条英文词的中文解释，不用。
  - 拼音：`ce.word[].phone`，缺了退回 `simple.word[].phone` 或 `ce_new.word[].phone`（实测 `苹果` 只有 `ce_new` 有 `píng guǒ`）。
  - 发音：同样走 `dictvoice?audio=<中文词>&type=1`（实测 200 audio/mpeg）。
  - 例句：`blng_sents_part['sentence-pair']` 的 `sentence` 是中文原句、`sentence-translation` 是英文译文，仍按 `{source: 中文, target: 英文}` 存。
  - 没有 `ec` 的中文查询（如 `阿巴阿巴`）返回 `null`，调用方回退翻译。
- 性质：非官方公开接口，可能限流或改结构；解析失败按「查词失败」回退翻译。

### 10.3 免费英英词典（`src/core/providers/dict/freedict.ts`）

- 端点：`GET https://api.dictionaryapi.dev/api/v2/entries/en/<词>`，免 Key。
- 返回数组，每个元素含 `word / phonetic / phonetics[] / meanings[].definitions[]`；取 `phonetics[].text + audio`、`meanings[].partOfSpeech` 与 `definitions[].definition / example`。
- **404 = 未收录**：必须在 `ensureOk()` 之前判断，否则会被映射成 `config` 错误。
- 能力表：只有音标、英英释义、例句；没有中文释义、词形变化与词组，设置页会把对应开关置灰。`supportsChinese: false`，中文词不会走这家（界面侧 `dictionaryQueryFor()` 直接跳过，SW 侧 `lookupWord()` 兜底抛 `config`）。

### 10.4 新增词典服务三步

1. 在 `src/core/providers/dict/` 新建文件，导出解析函数与 `createXxxDictionary()`（实现 `supportsChinese`）。
2. 在 `src/storage/settings.ts` 的 `DictionaryServiceId` 里加 id（并补 `normalizeSettings()` 的合法值判定），在 `src/core/providers/dict/services.ts` 加服务定义（名称、标签、说明、测试词、能力表、`supportsChinese`），在 `registry.ts` 的工厂里接到新实现。
3. 设置页「词典」分类与 `src/core/dictionary/lookup.ts` 会自动带出它；记得把新域名加进 `public/manifest.json` 的 `host_permissions`，并补 `tests/dictionary.test.ts` 的解析用例。
