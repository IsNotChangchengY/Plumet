# 商店上架文案与素材

> Chrome Web Store 与 Microsoft Edge Add-ons 的提交手册：两店通用的文案、权限理由、隐私披露、审核测试说明、截图清单与提交流程。当前版本 **1.0.0**。商店后台的字段名、字数上限与勾选项会随控制台更新，最终以提交页面为准；本文件负责「填什么」与「为什么这样填」。

维护规则：功能变化改第 2 节；权限或内置服务商变化改第 3、4 节并同步[隐私政策页](privacy.html)；界面或品牌变化重做第 6 节素材。文档维护规则见 [docs/README.md](README.md)。

## 1. 速查

| 项目 | 值 |
|---|---|
| 名称 | 羽译（manifest 的 `name` 是 `__MSG_extName__`，实际文案在 `public/_locales/zh_CN/messages.json`；商店展示名不改） |
| 当前版本 | 1.0.0（`package.json` 与 `public/manifest.json` 两处必须一致） |
| 上传包 | `pnpm package` 生成的 `release/yuyi-1.0.0.zip`，zip 根目录下直接是 `manifest.json` |
| 定价 | 免费，无内购 |
| 隐私政策 URL | https://isnotchangchengy.github.io/Plumet/privacy.html |
| 源码 / 支持 | https://github.com/IsNotChangchengY/Plumet（问题反馈走 Issues） |
| 许可证 | Apache-2.0 |
| 浏览器要求 | Chromium 内核 ≥ 114（Edge / Chrome），Manifest V3 |
| Chrome 开发者账号 | 一次性注册费 5 美元（需信用卡与邮箱验证） |
| Edge 开发者账号 | 免费（Microsoft 账号 + Partner Center 注册） |
| 商店素材目录 | `assets/store/` |

## 2. 文案（可直接粘贴）

### 2.1 名称

```text
羽译
```

### 2.2 简短描述

```text
翻译、语法检查、润色与生词学习一体的浏览器翻译扩展
```

这一段与扩展包内 `_locales/zh_CN/messages.json` 的 `extDesc` 完全相同（manifest 的 `description` 是 `__MSG_extDesc__`；Chrome 上限 132 字符，当前 25 字符）。两店都保持与扩展包一致；改这里必须同时改 `public/_locales/zh_CN/messages.json`。

Edge 的 **Short description 不在后台手填**：Microsoft 文档写明它取自扩展包 manifest 的 `description`，改文案要改 `_locales` 后重新打包上传；所以 Edge 的 Store listings 里需要粘贴的只有 **Description（详细描述）**，见 2.3。

### 2.3 详细描述

Chrome 与 Edge 都按纯文本渲染，不支持 Markdown；下面的行与符号在后台直接粘贴即可。

字数要求（Edge，实测 2026-11-22）：**Description（详细描述）** 字段要求 **最少 250 字符、最多 10,000 字符**（Microsoft Learn《Publish a Microsoft Edge extension》的 store listing 字段表）。少于 250 时后台报 `The description does not meet the minimum character limit of 250.`——常见原因是把 25 字符的简短描述填进了这个框，或只粘了第一段。下面整段共 939 字符，整段粘贴即可；Chrome 后台的详细描述上限 16,000 字符，同样用这一段。

```text
羽译（Plumet）：把「翻译 → 检查 → 润色 → 记住」串成一条线的浏览器扩展。

它不只是一个翻译按钮。选中网页上的句子，羽译会把页面标题、所在章节和相邻段落一起带上，让译文落在语境里；输入框里写完一段英文，可以直接检查语法与用词、按方向润色；遇到生词，词典卡给音标、释义与例句，收进生词本按记忆曲线复习，读过的词才留得下来。

• 划词即译：选中任意文字出现羽译图标，点开即译；气泡里可复制、朗读、收藏，也能展开查看本次实际发出的上下文。
• 整页翻译：按段落给出双语对照，一键切换「仅译文」，随时还原本页；代码块、输入框与已译段落自动跳过。
• 多引擎对照：AI 服务与传统机器翻译可同时勾选，同屏对照各自译文，顺序可拖拽调整；一张结果卡失败不影响另一张。
• 语法检查：拼写、语法、用词问题逐处标红或标黄，直接给出改法，可忽略误报，终稿一键复制。
• 润色：按「更自然 / 更正式 / 更有诗意」等方向重写，改动以 diff 呈现，纯净稿可复制。
• 词典与生词本：英文词与 1–4 个汉字直接查词典（音标、发音、中文释义、英英释义、词形、例句）；收藏后进入生词本，按简化 SM-2 排期复习，支持 JSON 导入导出。
• 快捷键：Alt+T 翻译选中内容，Alt+P 翻译当前页面，都可在设置里改键；右键菜单同样可用。

数据与隐私：羽译没有开发者服务器，不要求账号，不做遥测，不出售数据。历史、生词本、缓存与 API Key 只保存在本机浏览器存储中。翻译与查词需要联网：被处理的文字会发往你在设置里选择的翻译 / 词典服务（默认使用免 Key 的谷歌翻译与有道词典；也可配置百度、微软、MyMemory、OpenAI、Gemini、DeepSeek、智谱、通义等，或自定义 OpenAI 兼容端点）。完整说明见 https://isnotchangchengy.github.io/Plumet/privacy.html 。

要求：Chromium 内核浏览器 114 及以上（Microsoft Edge / Google Chrome）。翻译与查词装好即用；语法检查与润色需要你在 设置 → 服务 里添加一个 AI 服务的 API Key。
```

### 2.4 类别、语言与链接

- Chrome Web Store：类别选「生产工具 / Productivity」；语言「中文（简体）」（Chrome 的 listing 语言是后台独立下拉，与包内 `_locales` 无关）；隐私政策 URL 见第 1 节；支持 URL 用仓库地址。
- Microsoft Edge Add-ons：类别选「Productivity」；语言选「中文（简体）」（1.0.0 包已带 `_locales/zh_CN` 与 `default_locale: "zh_CN"`，Edge 按包内本地化识别 listing 语言，详见 8.2）；隐私政策 URL 同上；支持 URL 用仓库地址。

### 2.5 单一用途声明（两店必填）

```text
羽译是外语阅读与写作的辅助工具：在用户主动触发时翻译选中的文字或整页内容、检查与润色用户输入的外文，并把生词收藏到本机生词本供复习。所有功能都围绕「帮用户读和写外语」这一件事。
```

English（两店后台是英文界面，审核按英文读；控制台若接受中文就直接用上面那段）：

```text
YuYi (羽译) is an assistance tool for reading and writing foreign languages. At the user's explicit request it translates selected text or whole web pages, grammar-checks and polishes foreign-language text the user enters, and looks up words and saves them to an on-device vocabulary list for spaced review. All features serve this one purpose: helping the user read and write foreign languages. There is no account system, no ads, no telemetry, and no developer-operated server.
```

### 2.6 Edge 搜索词（最多 7 个）

```text
翻译、划词翻译、网页翻译、语法检查、英文润色、生词本、英语学习
```

（如果后台按单个词条计数，就逐条填这 7 个；不要加品牌竞品词。）

## 3. 权限用途

后台的「权限理由 / Permission justification」逐项填写。下面的中文与英文可各取一份；英文是给审核人员的版本，按两店控制台的字段语言选用。

### 3.1 汇总

| 权限 / 范围 | 用途 | 后台是否必须解释 |
|---|---|---|
| `storage` | 本机保存设置、历史、生词本与缓存 | 是 |
| `unlimitedStorage` | 缓存可能超过默认本机配额 | 是 |
| `contextMenus` | 右键菜单「翻译选中内容 / 翻译此页」 | 是 |
| `host_permissions`（16 个内置域名） | 内置翻译、AI 与词典服务 API | 是 |
| `optional_host_permissions` | 用户自定义 OpenAI 兼容端点（含 localhost） | 是 |
| 内容脚本 `<all_urls>` + `all_frames` | 划词翻译与整页翻译需要运行在用户浏览的网页 | 是（内容脚本匹配范围按主机权限解释） |

### 3.2 可粘贴的理由

`storage`

```text
中文：保存用户设置、翻译历史、生词本卡片与译文 / 词典缓存到本机 chrome.storage.local；这些数据不会上传到开发者服务器。

English: Stores settings, translation history, vocabulary cards, and translation/dictionary cache in the browser's local extension storage (chrome.storage.local). No data is sent to a developer server.
```

`unlimitedStorage`

```text
中文：译文缓存与词典缓存可能超过本地存储默认配额（约 10 MB），申请更大本机空间以避免重复请求同一个服务、减少用户费用；只影响本机存储容量，不涉及额外数据收集。

English: The translation and dictionary caches can exceed the default local storage quota (~10 MB). More local space avoids repeating identical requests to paid services. This permission only increases local storage capacity and does not involve extra data collection.
```

`contextMenus`

```text
中文：在右键菜单增加「翻译选中内容」与「翻译此页」两项，只在用户点击时执行。

English: Adds the context menu items "Translate selection" and "Translate this page". They run only when the user clicks them.
```

`host_permissions`（16 个域名）

```text
中文：这些域名是扩展内置的翻译、AI 与词典服务 API 端点——
clients5.google.com、translate.googleapis.com、api.mymemory.translated.net 是免费翻译通道；
fanyi-api.baidu.com、api.cognitive.microsofttranslator.com、*.cognitiveservices.azure.com 是百度与微软翻译；
api.openai.com、generativelanguage.googleapis.com、api.x.ai、api.deepseek.com、api.siliconflow.cn、api.moonshot.cn、open.bigmodel.cn、dashscope.aliyuncs.com 是内置 AI 服务；
dict.youdao.com、api.dictionaryapi.dev 是词典。
请求只在用户主动翻译、检查、润色或查词时发出，且只发往用户在设置里选择的那个服务。

English: These origins are the built-in translation, AI, and dictionary service API endpoints. Requests are made only when the user explicitly triggers translation, grammar check, polish, or dictionary lookup, and only to the service the user selected in Settings. The extension has no developer-operated server.
```

`optional_host_permissions`（`https://*/*`、`http://localhost/*`、`http://127.0.0.1/*`）

```text
中文：用于用户自定义的 OpenAI 兼容端点，包括在本机运行的模型服务。该权限不默认授予：只有用户在设置页点击「添加 / 授权并测试」时，扩展才通过 chrome.permissions.request() 向浏览器申请对应域名；用户可随时在扩展详情页撤销。

English: Used for user-defined OpenAI-compatible endpoints, including local model servers (localhost / 127.0.0.1). Not granted by default: the extension calls chrome.permissions.request() only after the user clicks "Add / Authorize and test" in Settings, and the user can revoke the grant anytime in the browser's extension settings.
```

内容脚本（`<all_urls>`，`all_frames: true`）

```text
中文：划词翻译与整页翻译必须在用户当前阅读的任意网页上工作。脚本不会主动读取或上传页面内容：只有用户划选文字或点击「翻译本页」后，才读取对应选区 / 段落，并只把需要翻译的文字（外加少量上下文）发往用户选择的翻译服务。iframe 也需要注入，因为文章正文常嵌在 iframe 中。浏览器内部页面、扩展页面与新标签页不会注入。

English: Selection and full-page translation must work on any page the user is reading. The content script does not read or upload page content on its own: it reads the selection or paragraphs only after the user selects text or clicks "Translate this page", and sends only the text to be translated (plus a small context window) to the selected translation service. Frames are included because article text is often embedded in iframes. Browser-internal pages, extension pages, and the new tab page are never injected.
```

主机权限合并说明（Edge 的隐私页只有一个 Host permission justification 框，Chrome 只有一个主机权限框时也用它）：下面这版 975 字符，覆盖内置域名、内容脚本 `<all_urls>` 与可选主机权限，可直接粘贴。

```text
Two scopes. (1) Built-in API endpoints for the translation, AI and dictionary services the extension ships with: Google (clients5.google.com, translate.googleapis.com), MyMemory, Baidu, Microsoft Azure Translator, OpenAI, Gemini, xAI, DeepSeek, SiliconFlow, Moonshot, Zhipu, Alibaba DashScope, Youdao Dictionary, and Free Dictionary API. Requests are made only when the user explicitly translates, checks, polishes or looks up a word, and only to the service selected in Settings. (2) The content script matches <all_urls> with all_frames: selection and full-page translation must work on any page the user reads, including article text inside iframes. It never reads or uploads page content on its own; only the selection or paragraphs are read after the user selects text or clicks "Translate this page". Optional https://*/*, localhost and 127.0.0.1 are used only for user-defined OpenAI-compatible endpoints, granted after a user click and revocable. No developer server.
```

### 3.3 明确没有申请的权限

`tabs`、`activeTab`、`scripting`、`webRequest`、`cookies`、`history`、`bookmarks`、`downloads`、`identity`、`notifications` 都没有申请：

- 弹窗里的「翻译本页」靠 `chrome.tabs.query` + `chrome.tabs.sendMessage` 与已注入的内容脚本通信，不需要 `tabs` 或 `activeTab`；`scripting` 与 `activeTab` 已删除并在验证清单里回归过（见 AGENTS.md §9 权限条目）。
- 扩展只在内容脚本里处理页面，不拦截网络请求、不读 Cookie、不读浏览历史。

审核备注里可以直接写这句：The extension does not request tabs, activeTab, scripting, webRequest, cookies, history, bookmarks, downloads, identity, or notifications.

## 4. 隐私实践与数据披露

统一口径（三句，任何后台字段都按它回答）：

1. 开发者不收集、不存储、不出售用户数据，没有账号系统，也没有自建服务器。
2. 只有用户主动触发翻译 / 检查 / 润色 / 查词时，待处理的文字才通过 HTTPS 发往用户自己配置的第三方服务；默认是免 Key 的谷歌翻译与有道词典。
3. 设置、API Key、翻译历史、生词本、译文与词典缓存只写入本机 `chrome.storage.local`，不同步、不上传，卸载扩展即删除。

### 4.1 Chrome Web Store 的「隐私」页

- 单一用途：填 2.5 的文本。
- 远程代码：选 **No, I am not using remote code**。全部代码都在扩展安装包内，不使用远程加载的脚本，也没有 `eval` / `new Function`；Justification 框可填：`All code is bundled in the extension package: no remote scripts, no eval / new Function, no external module loading.`
- 数据使用：按上面的口径，勾选「网站内容 / Website content」——待译文字会发往用户选择的第三方服务。其余类别（个人身份信息、健康、金融、身份验证信息、个人通信、位置、网络历史、用户活动）都不勾：开发者拿不到这些数据，扩展也不向第三方发送这些数据。
- 三项认证勾选（不售卖数据、不用于与单一用途无关的用途、不用于信用评估）：本项目全部符合，如实勾选。
- 隐私政策 URL：填第 1 节的地址。

注意：如果控制台把历史记录算进「用户活动」，先按最保守的口径勾选并在测试说明里解释「历史只在本机，不上传、不发送」；同时把这节与 [隐私政策页](privacy.html) 改成同一口径，两边不能互相矛盾。

### 4.2 Microsoft Edge Add-ons

Edge 的「Privacy」页逐项对应（页面是英文，粘贴英文版）：

- **Single purpose description**：粘 2.5 的 English 段落。
- **storage / unlimitedStorage / contextMenus justification**：分别粘 3.2 对应条目的 English 段。
- **Host permission justification**：粘 3.2 末尾的「主机权限合并说明」段落（已覆盖内置域名、`<all_urls>` 内容脚本与可选主机权限）。
- **Are you using remote code?**：选 **No, I am not using remote code**；Justification 可留空或粘 4.1 那句英文。
- **Data usage**：只勾 **Website content（网站内容）**；其余（PII、健康、金融、身份验证、个人通信、位置、网络历史、用户活动）都不勾，因为开发者拿不到这些数据，扩展也不向第三方发送这些数据。若审核把「本地翻译历史」理解成 user activity，按最保守口径解释：历史只在本机 `chrome.storage.local`，从不上传，因此不属于收集。
- **Privacy policy URL**：同上（https://isnotchangchengy.github.io/Plumet/privacy.html）。
- **三项认证**（不出售/不转交、不用于单一用途之外、不用于信用评估）：全部勾选，项目如实符合。
- 审核备注与测试说明见第 5 节；Edge 的 Notes for certification 只在提交页选 Yes（需要给测试者提供账号/信息）时可填，选 No 时字段置灰、直接跳过。

## 5. 审核测试说明（Test instructions / Notes for certification）

两店都不需要账号或测试密钥。中文版与英文版各取一份粘贴。Edge 的 Notes for certification 字段只在提交页问「是否需要给测试者提供账号/信息」选 **Yes** 时才可填写；选 **No** 后字段置灰、不需要填（实测 2026-11-22）。该字段上限 **2,000 字符**，完整英文版 2,065 字符超限；需要填时用 5 节末尾的精简英文版（1793 字符）。

```text
无需账号、无需测试密钥，安装后即可验证核心功能。默认使用免 Key 的谷歌翻译与有道词典；语法检查与润色需要用户自备 AI API Key，属可选功能，不影响其余功能验收。

测试步骤：
1. 安装扩展，打开任意英文网页（例如 https://example.com 或一篇英文新闻）。
2. 点工具栏的「羽 en」图标，在输入框输入一句英文，按 Enter。应出现中文译文。
3. 在网页上选中一句英文，选区旁会出现羽译图标；点击后弹出气泡并给出译文。展开「上下文预览」能看到随请求发送的页面标题、章节与相邻段落。
4. 再次打开弹窗，点底部「翻译本页」；页面按段落出现译文，右下角状态条可切换「仅译文 / 双语显示」并「还原本页」。
5. 在弹窗输入单个英文单词（如 hello）后按 Enter，出现词典卡（音标、中文释义、英英释义）。
6. 右键菜单的「翻译选中内容」、快捷键 Alt+T / Alt+P 同样可以触发；设置页可从弹窗右上角齿轮图标打开。
7. 可选：在 设置 → 服务 添加任一 AI 服务并填入 Key 后，弹窗的「检查」与「润色」即可验证。

网络说明：默认翻译通道需要访问 clients5.google.com 与 dict.youdao.com。若审核环境无法访问这些域名，可在 设置 → 引擎 把 MyMemory 加入翻译引擎，或在 设置 → 服务 配置百度 / 微软翻译后再验证；扩展的界面、设置与本地数据功能不依赖网络。

数据说明：无账号、无遥测；历史、生词本与缓存只存在本机。隐私政策：https://isnotchangchengy.github.io/Plumet/privacy.html 。
```

```text
No account or test credentials are required. The extension works out of the box with the default free translation channel (Google Translate, no API key) and the built-in dictionary (Youdao, no key). Grammar check and polish are optional features that require the user to add an AI service API key; they are not needed to verify the rest of the extension.

How to test:
1. Install the extension and open any English article, for example https://example.com or an English news page.
2. Click the YuYi toolbar icon, type an English sentence in the input box and press Enter. A Chinese translation should appear.
3. Select an English sentence on the page. A small YuYi icon appears next to the selection; click it to open the translation bubble. Expand the context preview to see the page title, section headings, and adjacent paragraphs that were sent with the request.
4. Open the popup again and click "Translate this page" at the bottom. Paragraphs are translated into Chinese; the status pill in the bottom-right corner switches between bilingual mode, translation-only mode, and restore.
5. Type a single English word such as "hello" in the popup and press Enter: a dictionary card appears (phonetics, Chinese definitions, English definitions).
6. The context menu items "Translate selection" and "Translate this page", and the Alt+T / Alt+P shortcuts, trigger the same features. Settings open from the gear icon in the popup.
7. Optional: add an AI service and its API key in Settings → Services to test grammar check and polish.

Network note: the default free channel uses clients5.google.com and dict.youdao.com. If those domains are unreachable in the review environment, add MyMemory as a translation engine in Settings → Engines, or configure Baidu / Microsoft Translator in Settings → Services. The UI, settings, and local data features work offline.

Privacy: no account, no analytics, no developer server. History, vocabulary cards, and caches stay in the browser's local storage. Privacy policy: https://isnotchangchengy.github.io/Plumet/privacy.html .
```

Edge 提交页若需要填 Notes for certification（提交页选 Yes 时），用下面这版（1793 字符，< 2,000；只压缩措辞，保留全部测试步骤与网络 / 隐私说明）：

```text
No account or test credentials are required. The extension works out of the box with the default free translation channel (Google Translate, no API key) and the built-in dictionary (Youdao, no key). Grammar check and polish are optional features that require the user to add an AI service API key; they are not needed to verify the rest of the extension.

How to test:
1. Install the extension and open any English article, for example https://example.com.
2. Click the YuYi toolbar icon, type an English sentence and press Enter. A Chinese translation should appear.
3. Select an English sentence on a page. A small YuYi icon appears next to the selection; click it to open the translation bubble. Expand the context preview to see the page title, headings and adjacent paragraphs sent with the request.
4. Open the popup again and click "Translate this page". Paragraphs get Chinese translations; the bottom-right status pill switches between bilingual, translation-only and restore.
5. Type a single word such as "hello" in the popup: a dictionary card appears (phonetics, Chinese and English definitions).
6. The context menu entries and Alt+T / Alt+P shortcuts trigger the same features; the gear icon opens Settings.
7. Optional: add an AI service and API key in Settings → Services to test grammar check and polish.

Network note: the default free channel uses clients5.google.com and dict.youdao.com. If unreachable in the review environment, add MyMemory as an engine in Settings → Engines, or configure Baidu / Microsoft Translator in Settings → Services. UI, settings and local data work offline.

Privacy: no account, analytics or developer server; history, vocabulary and caches stay in browser local storage. Privacy policy: https://isnotchangchengy.github.io/Plumet/privacy.html
```

## 6. 商店素材

| 文件 | 尺寸 | 画面 | 用途 |
|---|---|---|---|
| [01-selection-translate.png](../assets/store/screenshots/01-selection-translate.png) | 1280×800 | 划词气泡 + 上下文预览（example.com 演示文章） | 两店截图第 1 张（最能说明产品） |
| [02-page-translate.png](../assets/store/screenshots/02-page-translate.png) | 1280×800 | 整页双语 + 状态条 | 两店截图第 2 张 |
| [03-multi-engine.png](../assets/store/screenshots/03-multi-engine.png) | 1280×800 | 多引擎弹窗（DeepSeek + 谷歌两张结果卡） | 两店截图第 3 张 |
| [04-check-polish.png](../assets/store/screenshots/04-check-polish.png) | 1280×800 | 检查与润色两枚弹窗并排 | 两店截图第 4 张 |
| [05-dictionary-learning.png](../assets/store/screenshots/05-dictionary-learning.png) | 1280×800 | 有道词典卡 + 生词本 | 两店截图第 5 张 |
| [promo-440x280.png](../assets/store/promo-440x280.png) | 440×280 | 品牌 + 标语宣传图 | Chrome 小型宣传图（可选） |
| [icon-300.png](../assets/store/icon-300.png) | 300×300 | 圆角蓝底羽翼图标 | Edge 商店 logo |
| `public/icons/128.png` | 128×128 | 扩展图标 | Chrome 商店图标（manifest `icons.128`） |

- 两店都接受 1280×800 的截图（Chrome 另接受 640×400，Edge 另接受 640×480），同一组 5 张按 01→05 顺序上传即可；上传顺序就是商店里的展示顺序，第一张放划词。
- 截图是「真实 UI 截图 + 品牌排版」的合成图：UI 来自本地截图夹具，演示页面内容与数据为构造的示例，不含真实个人信息；整页图带一条示例浏览器地址栏。若审核要求纯 UI 截图，用 `assets/screenshots/` 里的真实截图重新导出 1280×800 底板（去掉宣传文案）即可。
- Chrome 的大型宣传图（1400×560）未制作，非必需；需要时按同一视觉语言补一张。
- 换主题、改弹窗结构或改品牌色后，第 6 节素材必须重拍，不能沿用旧图。

## 7. 提交前检查清单

- [ ] `package.json` 与 `public/manifest.json` 的版本一致，且与要提交的包名一致（当前 1.0.0）。
- [ ] `pnpm check` 全绿（类型 + 单测 + 构建 + verify + docs:check）。
- [ ] `pnpm package` 生成 `release/yuyi-1.0.0.zip`；解压后 zip 根目录直接是 `manifest.json`。
- [ ] 解压包里 `_locales/zh_CN/messages.json` 存在，且 `manifest.json` 的 `name` / `description` 是 `__MSG_extName__` / `__MSG_extDesc__`。
- [ ] 本地手动加载解压包过一遍 AGENTS.md 第 10 节的冒烟清单（权限瘦身后尤其要过划词与网页翻译）。
- [ ] 隐私政策 URL 返回 200（https://isnotchangchengy.github.io/Plumet/privacy.html）。
- [ ] 5 张截图、300×300 logo、128×128 图标都已按尺寸准备好。
- [ ] Chrome：单一用途、权限理由、远程代码=否、数据使用、三项认证都已填写。
- [ ] Edge：搜索词、隐私政策 URL、权限理由都已填写；**Notes for certification** 只在 tester credentials 选 Yes 时需要（选 No 时字段置灰）。
- [ ] Edge：**Description（详细描述）** 已整段粘贴 2.3 的内容（939 字符，≥ 250）；不要把 25 字符的简短描述填进这个框（会报 minimum character limit of 250）；Short description 由包内 manifest 的 `description` 决定，不在后台手填。
- [ ] Edge：提交页的 tester credentials 问题已选 **No**，此时 Notes 字段不可填也不需要填；若改为 Yes 则粘第 5 节末尾精简英文版（1793 字符，< 2,000）。
- [ ] 开发者账号已注册并完成发布者验证；支持邮箱可收信。
- [ ] 上架地区与可见性已确认（默认全部地区、公开）。

## 8. 提交流程

### 8.1 Chrome Web Store

1. 注册开发者账号并支付 5 美元一次性费用（Chrome Web Store Developer Dashboard），完成邮箱与发布者验证。
2. 「新增项目」上传 `release/yuyi-1.0.0.zip`。
3. 填写商店信息：名称、简短描述、详细描述、类别、语言、5 张截图、图标、可选宣传图、隐私政策 URL、支持 URL。
4. 填写「隐私」页：单一用途、逐项权限理由、远程代码、数据使用与三项认证（见第 3、4 节）。
5. 填写测试说明（见第 5 节），提交审核。审核通常数个工作日；期间不要重复提交同一版本。

### 8.2 Microsoft Edge Add-ons

1. 用 Microsoft 账号注册 Partner Center 的 Microsoft Edge 程序（免费）。
2. 新建扩展，上传同一个 `release/yuyi-1.0.0.zip`。
3. 填写商店信息：名称、简短 / 详细描述、类别、语言、搜索词、5 张 1280×800 截图、300×300 store logo、隐私政策 URL、支持 URL。
4. **listing 语言（实测 2026-11-22）**：Edge 按扩展包内实际存在的 `_locales` 识别可用的 listing 语言。1.0.0 之前的包没有本地化，后台只识别出 **English (United States)** 一条、**Add a language 下拉无选项**；现在包内已加 `_locales/zh_CN/messages.json` 与 `default_locale: "zh_CN"`，重新上传后应识别出 **中文（简体）**，在 Edit details 里把中文文案填在这条 listing 上。（待核实：Edge 后台对新包的语言识别结果；若仍只显示 English (United States)，直接在那条里填中文即可——单一 listing 会作为所有语言用户的回退展示，照样过审。）
5. 填写权限理由（见第 3 节）。提交页询问 **Does a tester need credentials, accounts, or any other info to test your extension?** 时选 **No**：扩展不需要账号与测试密钥，装好即用；AI 检查与润色属可选能力（需用户自备 Key），不必提供任何密钥。选 No 后 **Notes for certification** 字段会置灰、不可填写，直接点提交即可（实测 2026-11-22；页面上那句通用 warning 不适用于这种情况）。认证通常 1–7 个工作日。

### 8.3 后续版本更新

1. 同步升级 `package.json`、`public/manifest.json` 的版本号（两处一致），并更新 README 顶部的版本徽章。
2. 写 `.github/release-notes/v<版本>.md`；推 `v<版本>` 标签触发 GitHub Release（流程见 CONTRIBUTING.md 第 8 节）。
3. 在两个商店后台各上传新版本的 `release/yuyi-<版本>.zip`，填写本次更新说明并重新提交审核。
4. 若功能、权限、服务商或数据处理方式有变化，先更新第 2–4 节与隐私政策页，再上传包。

## 9. 风险与待确认

- 内容脚本覆盖 `<all_urls>` 会带来「读取所有网站数据」的安装警告，这是划词翻译的固有代价；用第 3 节的理由解释。若审核持续质疑，可评估改为「用户手势后按需注入」，但需要重新引入 `scripting` 权限并重做划词链路的冒烟，回归成本高，暂不做。
- 免费通道（谷歌 `clients5.google.com`、MyMemory）是非官方公开端点，可能限流或失效（实测记录见 [docs/providers.md](providers.md)）；商店文案不承诺长期可用，审核环境访问不到时用第 5 节的替代路径说明。
- 语法检查与润色必须由用户自备 AI Key，审核人员无法完整验证；文案与测试说明都把它标为可选能力，避免被判定为「功能不完整」。
- 商店后台字段名、字数上限、数据类别名称会变化；本文件标注的 132 字符、16000 字符、7 个搜索词等按当前控制台口径写，提交时以页面为准（已有依据的：Edge Description 为 250–10,000 字符，来自 Microsoft Learn 的 store listing 字段表，实测 2026-11-22；其余待核对）。
- 商店图是宣传合成图，若被要求换成纯 UI 截图，按第 6 节回退。
- 开发者账号、发布者名称、支持邮箱、上架地区由维护者决定，属于人工操作，脚本与 AI 不能代填。
- **Edge listing 语言（实测 2026-11-22，已处理）**：旧包没有 `_locales` / `default_locale`，Edge 只识别 English (United States)、Add a language 无可选项。1.0.0 包已加 `_locales/zh_CN/messages.json`，并把 manifest 的 name/description 改为 `__MSG_extName__` / `__MSG_extDesc__`、声明 `default_locale: "zh_CN"`；重新上传后 Edge 应把语言识别为中文（简体）。即便后台仍只给 en-US，在唯一 listing 填中文文案也能过审并对中文用户展示（待核实：Edge 后台语言列表）。

## 10. 维护对照

| 改了什么 | 同步哪里 |
|---|---|
| 新增 / 删除功能 | 第 2 节文案、第 6 节截图 |
| 改扩展名 / 简短描述 | `public/_locales/zh_CN/messages.json` 的 `extName` / `extDesc`（manifest 里是 `__MSG_*` 占位），同步第 2.1、2.2 节 |
| 权限、主机权限、内置服务商变化 | 第 3 节理由、第 4 节数据披露、[隐私政策页](privacy.html) |
| 界面或品牌变化 | 第 6 节素材重拍 |
| 发布流程或版本号规则变化 | 第 7、8 节与 CONTRIBUTING.md 第 8 节 |
