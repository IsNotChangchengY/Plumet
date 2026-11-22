# 羽译（Plumet）项目约定

> 本文件是写给 AI 编码助手的操作手册，放在项目根目录，扩展开发会话会自动加载它。
>
> 与 `CONTRIBUTING.md` 的分工：本文是**机器手册**（操作事实、关键设计、陷阱、验证清单），`CONTRIBUTING.md` 是**人和机器的贡献入口**（环境、门禁、PR 礼仪、最小验收、发布）；两边不重复对方内容，操作事实以本文为准，贡献流程以 `CONTRIBUTING.md` 为准。

## 1. 项目是什么

浏览器翻译扩展「羽译」：翻译、语法检查、润色、生词学习一条线。AI 负责语境与表达，传统机器翻译负责快和便宜。
目标平台：Chromium MV3（本机装了 Edge 157 与 Chrome 158.0.8127.37，Edge 与 Chrome 都可加载验收；`public/manifest.json` 的 `minimum_chrome_version` 是 114，两家都满足）。

## 2. 技术栈（不要随意换）

- TypeScript **固定 5.9.3**（当前 latest 是 7.0.2，首期不冒新编译器的险）
- Vite 8 + React 19，纯 CSS（`src/ui/theme.css` 的设计变量），**没有 Tailwind、没有 UI 组件库、没有状态库**
- 运行时依赖只有 4 个：`react`、`react-dom`、`zod`、`diff`
- 包管理 pnpm；Node >= 22.12（本机 24.22）

## 3. 常用命令

```
pnpm install        安装依赖
pnpm build          构建到 dist/（三次 Vite 构建：页面 / background / content）
pnpm dev            监听构建（改完仍需在扩展页点刷新）
pnpm typecheck      tsc --noEmit
pnpm test           vitest 单元测试（372 个）
pnpm verify         检查 dist/manifest 与页面资源引用是否完整
pnpm package        把 dist/ 打成 release/yuyi-<版本>.zip（解压后可直接加载）
pnpm docs:check     检查 AGENTS.md / CONTRIBUTING.md / docs 里提到的路径与链接是否还存在
pnpm check          一次性跑：类型 + 单测 + 构建 + verify + docs:check
```

发布流水线：推 `v*.*.*` 标签会触发 `.github/workflows/release.yml`（ubuntu + Node 24 + pnpm 11），依次跑 `pnpm check` → `pnpm package` → 把产物复制成 `release/extension.zip` → 创建 GitHub Release 并附 `extension.zip` 与 `SHA256SUMS.txt`；标签版本必须与 `package.json`、`public/manifest.json` 一致，否则 workflow 直接失败。Release 正文只取 `.github/release-notes/<标签>.md`（如 `v1.0.0.md`）的内容，原样发布、不自动追加日期、提交、校验值等任何内容；没有这个文件时 workflow 直接失败，所以打标签前必须先写本次更新说明。重建 Release 时正文会被重写。发布步骤见 `CONTRIBUTING.md` 第 8 节。

真实网络冒烟测试（会联网）：

```
$env:NODE_OPTIONS='--use-system-ca'; $env:YUYI_LIVE='1'; pnpm vitest run tests/live.test.ts
```

## 4. 加载与调试

1. `pnpm build`
2. 加载（Edge 与 Chrome 流程相同，入口位置与按钮文案不同）：
   - Edge：打开 `edge://extensions` → 左下角「开发人员模式」→「加载解压缩的扩展」→ 选项目根下的 `dist/` 目录
   - Chrome：打开 `chrome://extensions` → 右上角「开发者模式」→「加载已解压的扩展程序」→ 选同一个 `dist/` 目录
3. 点工具栏的「羽 en」图标 → 图标下方弹出翻译窗口（`action.default_popup` → `src/popup/`）；图标没出现就点工具栏的拼图按钮固定
4. Service Worker 日志：扩展卡片上的「Service Worker」→ 点「检查」（Edge 与 Chrome 相同）
5. 改了代码：`pnpm build` → 回扩展页点该扩展的刷新按钮 → 打开的弹窗关掉重开；已打开的网页也要刷新（旧 content script 已失效）

## 5. 目录结构

```
src/background/    Service Worker：唯一联网的地方；右键菜单、快捷键、端口任务；page.ts 把弹窗的网页翻译命令转给标签页
src/content/       Content Script：划词气泡与网页翻译；page/ 下是网页翻译（text/collect/render/translate/pill），selection-hit.ts 统一读取选区（普通 Range / Shadow DOM / 输入框三种来源），scanSelectionText() 按 DOM 结构扫出选区文字并标出夹带的脚本/隐藏节点（划词守卫态用它），structure.ts 把选区周围结构（标题链 / 相邻段（评论区与聊天列表按对话顺序取上下各最多 2 条评论/消息） / 列表 / 表格；跳过站点框架）装配成有预算的上下文（读取文字时穿透 open shadowRoot，B 站评论卡这类 Web Components 也能取到相邻评论），ui-mark.ts 统一识别自己的 UI，theme.ts 是页面内 Shadow DOM 的主题变量镜像
src/popup/         工具栏弹窗（唯一界面，340×600）：翻译/历史 tab 在头部、设置条（含润色方向）、输入框内动作（检查/润色/翻译）与右上角 × 清空、翻译本页与页面显示切换菜单
src/options/       设置页（新标签页，顶栏 6 分类）：App.tsx 外壳与通用/翻译/词典/其它分区、DictSection 词典开关与展示项、EnginesSection 引擎槽位（翻译面板多选 + 拖动/键盘排序）、ServicesSection 服务列表与详情、ShortcutSection 快捷键录制与冲突校验、test.ts 连接测试与授权
src/learning/      生词本页面：App 统筹统计/列表/导入导出，ReviewSession 是复习台，CardList 是卡片列表，CardDictionary 是卡片内的富词条块，learning.css 是页面专用样式
src/app/           弹窗里用的 React 组件：TranslatePanel / EnginePicker 引擎多选与排序 / DictCard 词典卡 / CheckView / PolishView / marks/MarksView / LangBar / HistoryList / PageButton / SectionTitle / useJob 统一任务 hook（翻译任务按引擎分槽）
src/core/          与界面无关的逻辑：providers/ 引擎（services.ts 服务定义与就绪判定、labels.ts 引擎显示名（content 侧也用，不拖入 provider 实现）、ai/ 预设与 OpenAI 兼容适配、mt/ 谷歌、MyMemory、百度、微软、md5、lang-map、batch、dict/ 有道与 Free Dictionary 词典）、dictionary/ 词判断与查词缓存、收藏用的词条快照（snapshot.ts）、engine 路由、cache、lang、text、errors、messaging、check、marks、polish、shortcuts 快捷键绑定与录入规则
src/storage/       chrome.storage.local 封装：local / settings / history / learning（卡片与 SM-2 排程、统计、导入导出）
src/ui/            theme.css 设计变量与设置页组件、主题应用、页面跳转（openOptions 支持 hash 深链）
public/            manifest.json 与图标（原图在 assets/icon-master.png，矢量源在 assets/icon-master.svg）
scripts/           build.mjs（三次构建）、verify-dist.mjs（产物自检）、check-docs.mjs（文档路径自检）、package.mjs（打 zip，纯 Node 无依赖）
tests/             vitest 单测 + 可选真实网络测试
docs/              README.md 文档索引与维护规则、design.md 设计大纲、ui-design.md UI 设计规范、providers.md 服务商对接、guide/ 新手四篇
```

## 6. 关键设计（改代码前先理解）

- **四个运行环境**：Service Worker（联网）、Content Script（读写页面 DOM）、扩展页面（弹窗/设置/生词本）、页面本身。扩展页面可以直接用 `chrome.storage`，不需要经过 SW。
- **入口**：只有 `action.default_popup`（`src/popup/`，340×600，点到别处就关）；manifest 里没有 `side_panel`，右键菜单只有「翻译选中内容 / 翻译此页」。设置页与生词本是独立标签页，页翻译命令由弹窗底部的 `PageButton` 发出：它是一枚通栏分体按钮，左段是「翻译本页 / 取消 N/M / 重译本页」主动作，右段 30px 箭头按钮向上弹出「网页翻译设置」菜单——「页面显示」里的「双语显示 / 覆盖原文」按当前页面所选实时切换（不重新请求），有译文时下面还有「还原本页」；点菜单外即关闭。输入框右上角的 × 与旧底栏「清空」等价（清输入、结果与收藏态并聚焦回输入框）。弹窗一打开就聚焦输入框（`TranslatePanel` 挂载时 focus），从「历史」tab 切回「翻译」也会重新聚焦。
- **Content Script 不能跨域 fetch**：MV3 里它的 fetch 受页面 CORS 约束。所有翻译请求必须走 SW（`chrome.runtime.connect({name:'yuyi'})` 的 Port 协议，见 `src/core/messaging.ts`）。
- **流式**：SW 收到 `translate` 任务后边收边 `port.postMessage({kind:'delta'})`；结束发 `done`，失败发 `error`。请求 ID 由界面生成，用 `requestId` 对齐。
- **引擎路由**：翻译面板存有序数组 `translateEngines`（至少一个，排在第一位的是主引擎 `primaryTranslateEngine()`；`EnginePicker` 支持拖动把手或聚焦后按 ↑ / ↓ 排序，顺序即结果卡顺序，弹窗与设置页共用），网页翻译 / 检查 / 润色三个槽位（`pageEngine` / `checkEngine` / `polishEngine`）各存一个引擎 id（`ai:<providerId>`、`mt:baidu`、`mt:microsoft`、`mt:google-free`、`mt:mymemory`）→ `resolveEngine()`。翻译面板勾多个时，`jobs.ts` 按 `TranslateJobRequest.engineIds` 并发调用每个引擎，`delta` 带 `engineId`、每个引擎回一条 `engineDone`（成功带译文，失败带 code/message），`done` 取第一个成功结果且历史只记一条；划词把整个 `translateEngines` 当 `engineIds` 传下去，网页翻译不传、只跑主引擎。content 侧算引擎名走 `providers/labels.ts` 的 `engineLabelOf()`，别 import `registry.ts`——它会把 provider 实现一起拖进 content bundle。**没有失败降级**：没配置或运行失败都直接报 `config` / 原始错误（多引擎里只影响那一张卡），是否可用由 `services.ts` 的 `missingMtFields()` / `aiProviderMissing()` 统一判定，UI 与运行时共用。
- **语言方向（智能目标语言）**：`settings.targetLang` 可以是 `smart`（默认值）：其他语言译成中文、中文译成英文，判据是 `src/core/lang.ts` 的 `detectLang()`（按书写系统占比，假名优先、韩文比例优先于汉字，所以日语韩语不会被当成中文）。解析一律在客户端做：弹窗与划词在发请求前解析，网页翻译**整页只解析一次**（前 12 段拼样本）后用同一个值做跳过判断、分批与 `span[lang]`；`jobs.ts` 只做兜底。
- **服务配置（settings v2）**：`settings.services` 存四家 MT 服务的开关与凭证（百度 appId/secret、微软 key/region/endpoint），`settings.aiProviders` 存 AI 服务实例（含 `reasoningEffort` 思考强度：`''` 跟随模型默认、`low`/`medium`/`high`；空串时请求体不带 `reasoning_effort`），`settings.translateEngines` 存翻译面板与划词共用的有序引擎数组（第一位即主引擎）；旧版 `mtEnabled` 与单个 `translateEngine` 读入即迁移，载荷 `version: 2`。划词上下文的长度与范围分别由 `settings.selectionContextChars`（前后字符数，默认 600）与 `settings.selectionContextScope`（`segment` / `section` / `page`，默认 `section`）控制。
- **缓存**：`src/core/cache.ts` 有主缓存 `cache.v1`（最多 1000 条）与段缓存 `cache.segments.v1`（最多 3000 条）两份，都落盘 `chrome.storage.local`、SW 内再放内存 Map 加速；TTL 7 天且**滑动过期**（命中会把 `at` 刷新到现在，7 天没有被用过才失效）。主缓存键 = 引擎 + 修订（AI 引擎为 `PROMPT_VERSION` + 模型，MT 引擎固定值 2）+ 语言 + 上下文（只有 AI 引擎计入；MT 不读上下文，同一句跨页面复用）+ 原文；段缓存键 = 引擎 + 修订 + 语言 + 单段原文（不含上下文与批内顺序）。原文与上下文进键前都会归一空白、零宽字符、宽空格与换行符写法（段落结构保留）。网页翻译的请求带 `cacheSegments: true`：批次命中直接回；否则逐段查 `cache.segments.v1`，只把没命中的段发给引擎（部分命中时整批回包、不推流），拼好后回写段缓存与批次缓存，所以不同批次里重复出现的句子（改版页面没变的段落、站内同一句话）也能复用。改 prompt 或换模型后旧译文自动失效，不需要手动清缓存。设置页「清空译文与词典缓存」会同时清掉主缓存、段缓存与 `dict.v1`。
- **词典链路**：输入/选区是**单个词**——1–40 个拉丁字母（可带撇号/连字符）或 1–4 个汉字，两端标点会先裁掉；`parseDictionaryQuery()` 给出 `en-zh` / `zh-en` 方向，`dictionaryQueryFor(settings, text)` 再叠加开关与服务能力（Free Dictionary 不能查中文词，遇到中文直接走翻译），弹窗与气泡据此改发 `{kind:'dict'}` 任务（`messaging.ts`），由 `jobs.ts` 调 `core/dictionary/lookup.ts` 查 `src/core/providers/dict/` 的服务：有道 `jsonapi`（`ec` 英→中：音标 + 英美发音、中文释义、英英释义、词形变化、双语例句、词组；`ce` 中→英：拼音 + 发音、英文对应词、中文例句的英文译文）或 Free Dictionary API（英英释义、音标、例句，仅英→中）。结果以 `dictDone` 事件回界面，`src/app/DictCard.tsx`（弹窗）与 `bubble.ts` 的 `buildDictionaryCard()`（气泡）按 `settings.dictionary.sections` 的六项开关裁剪（词典卡固定用默认宽度 340，不跟短选区一起收窄）。词典未收录（`entry === null`）或请求失败时**刻意回退**到翻译：`DictJobRequest` 带 `engineIds` 时跑全部已勾选引擎（顺序即结果卡顺序），没带时退回主引擎（`primaryTranslateEngine()`）；弹窗 `useJob` 与气泡 `requestWordLookup` 都消费 `engineDone` / `done` 的多引擎结果，`JobResult.notice` 里说明「词典未收录/查询失败，已改用翻译」；命中词典仍只回 `dictDone` 一张卡——这是唯一允许的降级，只作用于查词；查词缓存落盘在 `chrome.storage.local` 的 `dict.v1`（键 `服务:小写词`，TTL 24 小时滑动：命中刷新时间、上限 200 条；过期与坏条目在读入时丢弃，SW 被回收后照样命中）。发音用 `dictvoice?audio=<词>&type=1|2`，失败退回 `speechSynthesis`。
- **划词链路**：`selection-hit.ts` 统一读取选区，三种来源按顺序尝试——① 输入框/文本域的 `selectionStart/End`（截 `value`，`password` 与数字/日期类不参与）② `window.getSelection()` 的 Range ③ 拖动过程中从 `pointerdown / pointermove / mouseup` 的 `composedPath` 里累计到的 open `ShadowRoot`（不是只看 mouseup 那一个事件），用 `getComposedRanges()` 重建 Range，重建不出文字时用 `selection.toString()` 兜底 + 鼠标点定位。触发端也汇合到一处：`mouseup`（立即）、`selectionchange`（140ms 防抖，键盘/触摸选区靠它）、`pointerdown` 收尾（指针按住期间不响应）；拿到文字与语境（页面标题 + 网站 + 所在块前后 N 字符 + 按「上下文范围」装配的章节标题链 / 相邻段 / 列表 / 表格，整页范围再加页面大纲与首段，总预算 2000 字；所在块取选区最近的块级祖先（`pickBlock`），跨块选区取起点块到终点块之间的窗口；邻段跳过 nav / aside / footer / pre / code 等标签噪音、无 ARIA 的站点框架（`isChrome`：header/menu 类标签、landmark role、id/class 黑名单）与链接/按钮文本占比 ≥0.5 的导航块，评论区与聊天界面因此按对话顺序取上下各最多 2 条相邻评论/消息（上文远→近、下文近→远），与源语言不同的段落同样跳过；选区在块里定位不到时不带段落窗口；超过 2000 字的选区照常翻译，但只带标题与网站）。输入框的语境按 `aria-labelledby` → `aria-label` → `label[for]` → 包裹 `<label>` → `placeholder` → `fieldset legend` 的顺序取；iframe 里 `pageContext()` 在同源时改用顶层窗口的标题与域名。随后光标右下角（无光标时用选区末端）出现 28px 的插件图标（`assets/icon-master.svg` 以 `?raw` 内联进 Shadow DOM），点它经同一条 Port 协议发翻译任务 → 气泡（Shadow DOM）贴在选区下方显示，宽度取选区矩形宽加卡片内边距（`BUBBLE_WIDTH_EXTRA = 56`，正文比选区宽约 8px；下限 240、上限视口宽的二分之一且不超过 `视口 - 24`，视口窄到半宽不足 240 时保留下限；拿不到宽度时 340；词典卡固定 340），按住头部可拖动（拖动后固定位置，不再跟随滚动）。打开气泡前先按 DOM 结构扫一遍选区（`scanSelectionText()`）：文本里夹到 `<script>` / `<style>` / `<noscript>` / `<template>`，或元素被 `display:none` / `visibility:hidden|collapse` / `content-visibility:hidden` 隐藏时进入 guard 态——正文只放这次原文的模糊预览（最多 240 字），盖一层黄色提示「选中了隐藏内容，请重新选择或继续翻译」、一句后果说明（继续翻译会跳过隐藏内容，整段都不可见时按原文发送、译文可能是一段代码）与「继续翻译」按钮，不发请求、底栏收起；点「继续翻译」只把扫出来的可见文本发出去（可见文本为空才退回原文），关气泡或换选区即清空。请求带 `engineIds`（整个 `translateEngines`）。**所有句子翻译（单引擎也一样）都渲染成 `.engine-result` 结果卡**：卡头是服务名、状态点与右侧四枚 22px 纯图标动作（朗读 / 复制 / 收藏，AI 卡在完成态多一枚「扩上下文」，用途只靠 `title` / `aria-label`），下面是译文；每张卡的复制、收藏、朗读只作用于自己那份译文，失败的卡只红自己。整句完成时不再有底部动作组，底栏只留「上下文预览」（有语境时点开显示本次实际发出的上下文，没有语境就整条收起）；加载态文案是「正在用 N 个引擎翻译」（单引擎为「正在翻译」）。「扩上下文」只在范围不是整页、有块元素且选区不超过 2000 字时出现，点了用整页结构重译一次。图标与气泡挂载点会避开全屏：`document.fullscreenElement` 存在时挂进全屏元素。素材：选区文本保留换行（行内空白压成单空格，最多留一个空行），译文因此与原文分段对齐；气泡里的译文能直接拖选复制，选中高亮是气泡自带的一条（不依赖宿主页）。流式渲染只往下追加文本节点，不重建 `<pre>`，所以边生成边选也不会被打断。`Esc` 或右上角 `×` 关闭。
- **网页翻译链路**：弹窗底部「翻译本页」/右键/`Alt+P` → SW `page.ts` 用 `tabs.sendMessage` 转给 content script → `page/collect.ts` 从 `document.body` 挑「不含块级子元素的块级元素」当单元（跳过代码/输入框/隐藏/已译/已是目标语言）→ `page/text.ts` 按 8 段 / 1200 字符分批 → 每批走同一条 Port（`silent:true` 不写历史，`cacheSegments:true` 让批次只发没命中过的段）→ `page/render.ts` 把译文写成 `span[data-yuyi="trans"]` 追加在原文块末尾；仅译文模式把原有子节点搬进 `span[data-yuyi="orig"]` 隐藏 → `page/pill.ts` 在页面右下角显示进度/取消/重试/还原 → `MutationObserver`（500ms 防抖）只扫新增节点，过滤 `[data-yuyi]` 自己的节点；`location.href` 变化触发整页重扫。呈现方式实时切换走 `PageCommandName 'mode'`（`PageCommand.mode`）→ `translate.ts` 的 `applyPageMode()` → `render.ts` 的 `switchPageMode()`：在已译单元上就地搬移 `[data-yuyi="orig"]`，不重发请求，同时把 `settings.pageMode` 写回。
- **快捷键（可编辑）**：`settings.shortcuts` 存 `selection` / `page` 两个绑定（`{code, alt, ctrl, shift, meta}`）或 `null`（未设置）。`src/core/shortcuts.ts` 负责事件→绑定、校验与文案：组合里必须带 Ctrl 或 Alt，Win / Command 键和浏览器保留组合直接拒绝，`normalizeShortcuts()` 读入时把非法值回退默认、两个动作撞键时优先保 `selection`。**MV3 的 `chrome.commands` 只有 `getAll()`，没有 `update()`**（update 仅 Firefox），所以 manifest 里的原生命令固定是 Alt+T / Alt+P：SW 收到 `onCommand` 后先 `loadSettings()`，只有该动作的绑定仍等于默认值才转发给标签页；用户改过的动作由 content script 在页面里监听 `keydown`（capture）执行。两条路径可能同时触发，content 用 200ms 的 `lastAction` / `lastActionAt` 去重；自定义键只在网页有焦点时生效，`page` 只认顶层帧，站内脚本的 `preventDefault` 或更早的 capture 监听可能抢走按键。设置页的 `ShortcutSection` 负责录制：按 `Backspace` / `Delete` 清除、`Esc` 取消、非法与重复组合就地报错。
- **服务商契约**：实现 `TranslateProvider`（`id` / `label` / `kind` / `translate()`），单段可流式、多段走批量 JSON。新增 MT 服务三步：写 `src/core/providers/mt/*.ts` → 在 `services.ts` 加服务定义（凭证字段 / 就绪判定 / 工厂）→ `registry.ts` 与设置页自动出现。新增 AI 服务只需在 `ai/presets.ts` 加一条预设（OpenAI 兼容协议）。
- **检查链路**：`splitForCheck()` 按 1400 字符切段（保留原文 offset）→ 每段一次 AI 调用 → `parseIssues()`（zod 宽松枚举 + JSON 抽取）→ `locateIssues()` 用 quote 三级定位（精确 → 忽略大小写 → 忽略空白）→ `mergeIssues()` 按位置去重 → `applyIssues()` 得终稿。定位失败的条数计入 `dropped`，UI 会明说，不假装定位成功。
- **润色链路**：AI 只输出润色后的全文（流式），**diff 全部由前端计算**（`diffArrays` + `Intl.Segmenter` 分词），修改清单也从 diff 生成，不让模型给偏移量或理由。
- **Mark 模型**：`{ kind: 'equal'|'del'|'ins'|'warn', severity?, state?, issueId? }`。检查默认就是「原文划掉（红/黄按严重度）+ 绿色改法」；点「忽略」变成灰色虚线的 warn；润色是 git diff 风格。颜色语义：红=错误、黄=警告、绿=修改后、灰=已忽略。
- **检查/润色的引擎槽**：`settings.checkEngine` / `polishEngine`，留空 = 自动（按翻译面板的引擎顺序找第一个可用 AI，否则用第一个可用 AI 服务）。只能用 AI，没有 AI 时错误码是 `config`，UI 给「去设置」。
- **AI JSON 容错**：`extractJsonObject()` 剥掉代码块/前后缀 → zod 校验 → 失败一次修复重试（把上次输出回灌）→ 仍失败报 `parse`，绝不猜。
- **收藏链路**：气泡结果卡「收藏」（单词/词典卡在底栏；`selection.ts` 调 `saveCard`，带原文/译文/页面标题/URL/语言对；卡片已无 `context` 字段，旧数据读入即丢弃；单词把词典服务返回的 `DictionaryEntry` 存成 `dictionary` 快照，句子取译文）与弹窗结果卡「收藏」（`TranslatePanel`，只有译文结果可收藏）。快照由 `src/core/dictionary/snapshot.ts` 收敛：音标/释义/英英释义/词形/例句/词组六类，条数与长度都有上限，坏数据丢弃。同一 `text + targetLang` 视为同一张卡（同一个词句换译入语言算另一张卡）：重复收藏直接返回已有卡、不再写入，按钮显示「已收藏」，**不新增卡片、不改动已存内容与 SRS 进度**。
- **学习链路**：`src/storage/learning.ts` 存 `learning.v1`（`{version, cards, days, correct}`）→ 卡片字段含 `dictionary`（词典快照，旧卡为 `null`）/ `ease / interval / dueAt / reps / lapses`，`schedule()` 是简化 SM-2（again 10 分钟后重来并重置 reps、hard 间隔 ×1.2、good 首次 1 天/第二次 3 天后按 `interval × ease`、easy 在 good 基础上 ×1.3 且 ease +0.15，区间 1.3–2.8）→ `dueCards()` 按到期时间升序取前 20 张给复习台 → `gradeCard()` 同时累加 `days[今日]` 与 `correct`（只有 again 算错）→ `bookStats()` 派生今日新增/待复习/连续天数/正确率。导入只并卡片、不并统计；导出是 `{version, exportedAt, cards}` 的 JSON。生词本列表有快照时渲染音标（可点发音）、释义、英英释义、词形与例句的富卡片，没有快照退回 `translation` 纯文本；复习台答案仍只用 `translation`。
- **打包**：`scripts/package.mjs` 用纯 Node（`zlib.deflateRawSync` + 手写 ZIP 结构，零依赖）把 `dist/` 打成 `release/yuyi-<manifest.version>.zip`；`release/` 已在 `.gitignore` 里。

## 7. 代码约定

1. **代码内不写注释**（用命名和文档说明意图）。
2. TypeScript strict + `noUnusedLocals` + `noUnusedParameters`；不要用 `any` 绕过。
3. UI 文案中文直接写在组件里；错误文案集中在 `src/core/errors.ts` 的类型与各 provider 里。
4. 跨模块通信必须走 `src/core/messaging.ts` 的类型化协议，不要裸字符串。
5. 新增依赖前先问自己：能否用现有 4 个运行时依赖 + 浏览器 API 做到？不能才加，并说明理由。
6. 每完成一块，交付要写清：改了哪些文件、怎么验证的、还剩什么没做/有什么风险。

## 8. 文档自迭代（每次改动必须同步）

**改代码的同时改文档，不允许「先写代码，下次补文档」。** 完整规则、文档地图和检查清单见 `docs/README.md`。

| 本次改了什么 | 必须同步更新 |
|---|---|
| 新增 / 删除 / 重命名源文件 | 本文档的目录结构；`docs/guide/02-代码地图与数据流.md` |
| 新增命令、脚本、依赖 | 本文档的常用命令；用户可见的能力变化写进 `README.md` |
| 新踩到的坑、新的实测结论 | 本文档的已知陷阱；服务商相关的同时进 `docs/providers.md` |
| 接入新服务商、改错误码 | `docs/providers.md` |
| 设计取舍变化（数据流、呈现方式、交互语义） | `docs/design.md` 对应章节 |
| 改样式、设计变量、界面结构、新增 UI 组件 | `docs/ui-design.md` 对应章节；同时改 `src/ui/theme.css` 与 `src/content/theme.ts` 两处变量 |
| 用户可见功能变化 | `README.md` 功能章节（只写现在能做什么） |
| 里程碑推进 | `docs/design.md` 里程碑表（本文档 §11 只留摘要） |
| 测试数量变化 | 本文档常用命令里的数量 |
| 新增文档 | `docs/README.md` 的文档地图 |

约定：

1. **删旧留新**：过时内容直接改掉或删掉，不要在旧说法后面追加新段落。
2. **只改涉及段落**，不做整篇重排。
3. **路径、命令、数量必须与代码一致**：`pnpm docs:check` 会校验 `AGENTS.md`、`CONTRIBUTING.md`、`docs/design.md`、`docs/providers.md` 里用反引号写出的路径是否存在，以及所有文档里的相对链接；它报错通常意味着你改了文件名却漏了文档。
4. **未经实测的结论标注 `（待验证）`**，不要写成既成事实。
5. 状态类信息（测试数、命令）以本文档为准，里程碑状态以 `docs/design.md` 里程碑表为准；设计理由以 `docs/design.md` 为准；冲突时先改本文档，再回填设计文档。
6. 教程类文档（`docs/guide/`）可以提到尚未实现的目标文件；带事实路径的四份文档不写不存在的路径。

## 9. 已知陷阱（都是实测）

- **content script 必须 IIFE**：`scripts/build.mjs` 里单独用 `formats:['iife']` 打包成 `dist/content.js`；写 ESM import 会加载失败。
- **SW 约 30 秒空闲会被回收**：长流式请求期间 Port 会保活；界面重开后靠 `history.v1` 恢复，不依赖 SW 内存。
- **Vite 8（Rolldown）的 `manualChunks` 只接受函数**，对象写法会构建失败。
- **本地网络是 MITM 代理**：Node 直接 fetch 谷歌等域名会报 `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`；跑联网测试要 `NODE_OPTIONS=--use-system-ca`（浏览器用 Windows 证书库，不受影响）。偶发 502/504 重试即可。
- **happy-dom 会做 CORS 拦截**：联网测试必须 `// @vitest-environment node`。
- **免费通道现状**（详见 `docs/providers.md`）：谷歌 `clients5.google.com/translate_a/t?client=dict-chrome-ex` 可用（支持多 `q`、1200 字符实测正常）；`translate.googleapis.com/gtx` 会 429；微软 `edge.microsoft.com/translate/auth` 已 404；有道旧接口下线；腾讯 transmart 需鉴权。
- **正式版 Chrome 137+ 不再支持命令行 `--load-extension`**：用带该参数的 Chrome 158 启动不会加载未打包扩展（CDP 实测只有 Google Hangouts / Gemini in Chrome / Google Network Speech 三个组件扩展），验收只能在 `chrome://extensions` 手动加载；要自动化 E2E 得用 Chrome for Testing（158 可下载，约 215 MB）或 Chromium。另注意内置「Gemini in Chrome」也跑 `background.js`，别按 Service Worker 是否存在判断扩展是否加载。
- **权限**：`<all_urls>` 内容脚本会带来「读取所有网站数据」安装警告；内置服务商（谷歌、MyMemory、百度、Azure、OpenAI、Gemini、xAI、DeepSeek、硅基流动、Moonshot、智谱、通义）的固定域名已写进 `host_permissions`，装好即可用；自定义 / 本地端点仍走 `optional_host_permissions` + `chrome.permissions.request()`（必须在用户点击里调用，所以放在「添加 / 授权并测试」按钮）。
- **有道词典接口不是官方公开 API**：`GET https://dict.youdao.com/jsonapi?q=<词>` 免 Key 可用，字段是嵌套对象——`simple.word[0]` 给英美音标，`ec.word[0]` 给中文释义（`trs`）与词形（`wfs`），`ee.word.trs` 给 WordNet 英英释义（例句在 `tr[].exam.i.f.l[].i`），但 `ee.source.name` 可能是 Wikipedia（hello 这类词返回的是百科句子），所以解析器优先取 `collins_primary.gramcat[].senses[].definition`，没有柯林斯时才退回 `ee`，`blng_sents_part['sentence-pair']` 给双语例句，`phrs.phrs` 给词组。**未收录的词不报错**：返回 200 且只有 `input/meta/le/lang`（`meta.isHasSimpleDict === "0"`），所以判「找到」的标准是中文释义或英英释义非空，不能只看 HTTP 状态。发音走 `dict.youdao.com/dictvoice?audio=<词>&type=1|2`（1 英 2 美，实测 200 audio/mpeg 约 10 KB）。接口可能限流或改结构，解析失败按「查词失败」回退翻译。
- **有道中文词的字段在 `ce` 里**：中→英不是 `ec`，而是 `ce.word[].trs[].tr[].l`——英文对应词藏在 `l.i` 的节点数组里（`{"#text":"hello"}`，中间还夹空格字符串，要按顺序拼起来），词性在 `l.pos`，中文解释在 `l.#tran`（不用）；拼音优先 `ce.word[].phone`，没有就退回 `simple.word[].phone` 或 `ce_new.word[].phone`（苹果只有 `ce_new` 有拼音）；中文发音同样走 `dictvoice?audio=<词>&type=1`（实测 200 audio/mpeg）。`阿巴阿巴` 这类不是词的查询没有 `ce`，解析器返回 `null` 退回翻译。
- **Free Dictionary API 用 404 表示未收录**：`GET https://api.dictionaryapi.dev/api/v2/entries/en/<词>`，不存在的词返回 404 + `{"title":"No Definitions Found"}`，适配器必须在 `ensureOk()` 之前把 404 当「未收录」而不是 `config` 错误；它只有英英释义/音标/例句，没有中文释义与词形变化，也不能查中文词（`supportsChinese: false`，`lookupWord()` 对这种组合直接报 `config`，`runDict` 不会因此显示「词典查询失败」）；设置页按服务 `capabilities` 禁用不支持的展示项。
- **查词回退是有意为之的例外**：翻译引擎仍然「没有失败降级」，但词典是增强功能——未收录、超时、解析失败都静默改走翻译并在结果里带 `notice`，否则人名与新词会直接报错。回退要多引擎就必须整条链路都带 `engineIds`：`DictJobRequest` → `runDict()` 的 `translateAndReport` → `translate-client.requestWordLookup` → 弹窗 `useJob` 的 dict 分支，缺一处都会退回单引擎；命中词典时仍然只发 `dictDone` 一张卡。
- **页面内播放发音可能被站点 CSP 拦截**：气泡里的音标按钮用 `new Audio(url)` 播有道/Free Dictionary 的音频，宿主页若写了 `media-src` 白名单会拒播（弹窗是扩展页面不受影响）；`playPronunciation()` 捕获失败后退回 `speechSynthesis`（待验证：具体站点表现）。
- **没有失败降级**：`translateWithFallback()`、`fallbackEngineIds()`、`usedFallback` 已删除，`translateText()` 只用传入的那一个引擎；未就绪按 `config` 直接抛，运行时失败也直接抛。旧文档或旧代码里出现这些名字都是过时说法。
- **百度签名要 MD5，浏览器没有**：`crypto.subtle` 只有 SHA 系，自带 `src/core/providers/mt/md5.ts`；改签名必须跑 `tests/services.test.ts` 里与 Node `crypto` 的对拍。
- **百度标准版 QPS = 1**：适配器用模块级 1 秒时间片串行（`waitForSlot()`），网页翻译一批 8 段会排队；别在批内加并发，否则 54003。
- **百度单次 q ≤ 6000 字节**：按 UTF-8 字节切分（`chunkByBytes()`），不是按字符；多段先用换行拼成一条再按 `trans_result` 还原，条数不符自动退回逐段。
- **必应 = 微软，同一条 Azure v3**：免 Key 的 `www.bing.com/ttranslatev3` 需要页面 IG/IID、返回空体，已弃用；界面里两者合并为「微软 / 必应」。
- **Azure 区域头**：区域资源必须带 `Ocp-Apim-Subscription-Region`，全球资源可不带；403 多半是区域不匹配或 Key 无效。
- **Gemini 走 OpenAI 兼容层**：Base URL 是 `https://generativelanguage.googleapis.com/v1beta/openai`（不是 `/v1beta/models`），这样直接复用 OpenAI 适配器；模型 ID 变动快，预设里的只是建议，可手改。
- **settings v2 迁移**：`settings.v1` 载荷 `version` 升到 2，旧 `mtEnabled` 读入即合并进 `services`，单个 `translateEngine` 迁移成单元素 `translateEngines`，随后两个旧字段都删除；不要再写 `mtEnabled` 或 `translateEngine`。`normalizeSettings()` 对所有凭证字段做字符串收敛。
- **设置页深链**：`openOptions('services:baidu')` → `options.html#services:baidu`；`chrome.runtime.openOptionsPage()` 不能带 hash，所以改用 `chrome.tabs.create`。设置页按 hash 决定分类与详情。
- **设置页本地截图夹具**：`AGENTS/ui-design/_verify/make-verify-pages.mjs` 生成注入了假 `chrome.storage` 的验证页，配合 `serve-dist.mjs` 起静态服务（127.0.0.1:4399）再用无头 Chromium 截图（本机是 Edge）；`pnpm build` 会清空 `dist/`，每次重建后先跑一遍生成脚本。
- **可选主机权限不支持端口**：`originPattern()` 只拼协议+主机名，端口不写进模式。
- **划词 UI 全在 Shadow DOM 里**：气泡与图标挂在 `document.documentElement` 下、样式用字符串注入；content script 不引 React。加入页面内 UI 的样式后 `content.js` 约 82 KB（gzip 26 KB），其中大半是三套 Shadow DOM 的样式字符串（含词典卡）；界面侧只许 import `core/dictionary/{word,query,format,audio}.ts` 这类轻模块，`lookup.ts` / `providers/dict/*` 会通过 `registry.ts` 把解析器与 http 层一起拖进 content bundle（实测 +8 KB）。
- **自己的 UI 不能触发划词**：监听里要用 `event.composedPath()` 判断是否含自己的宿主，否则点气泡按钮会被当成新的选择。
- **Shadow DOM 里的选区用 `window.getSelection()` 读不到**：Chromium 把 shadow root 内的选区端点顶到宿主上，`getRangeAt(0).toString()` 为空（[issue 41112024](https://issues.chromium.org/issues/41112024)，官方视为预期）。B 站新版评论区（`bili-comment-thread-renderer` 等 Web Components）就是这种。做法：把 `composedPath` 里出现的 open `ShadowRoot` 都收起来传给 `selection.getComposedRanges({ shadowRoots })`，拿静态范围后再 `document.createRange()` 重建（跨根边界会抛，退到 `shadowRoot.getSelection()`）。
- **划过最后一个字后 mouseup 的 `composedPath` 里没有内层 shadow root**：拖到文字外（评论卡片的 padding / 按钮区）松手时，事件目标落在外层 shadow 或文档上，path 里只剩外层 root，于是「内层 root 缺失 → `getComposedRanges` 只拿到被夹到宿主上的空范围 → 不出图标」。实测（Edge 157 无头 + 真实鼠标事件）：`shadow-inside` 出图标、`shadow-past-end` 不出。修法是把 `pointerdown / pointermove / mouseup` 里出现过（去重、上限 32、剔掉自己的 UI 与 `isConnected === false` 的）root 都记住，检查时整组传进去。
- **shadow 选区的 Selection 对象有三个假象**：`selection.isCollapsed === true`（其实有选）、`getRangeAt(0)` 是塌缩在文档级祖先（实测是 `#nested` 那个 `SECTION`）上的空 Range、`anchorNode / focusNode` 也被重定向到文档级节点；**只有 `selection.toString()` 有字**。所以判空不能只看 `isCollapsed`，跨根选区（起点在一个 shadow、终点在另一个）重建出来的 Range 也可能是空串，需要 `toString()` 兜底并用鼠标点定位。
- **`Range.toString()` 会把隐藏文本一起带出来**：跨段落拖选时浏览器会跳过 `<script>`，但选区覆盖整个容器（整块选中、三击、从反馈条拖到卡片底）时脚本文本会被拼进来——Bing Copilot 答案卡底部「喜欢/不喜欢」加紧随的 Feedback 内联脚本就这样被当成原文发了出去（Edge 157 实测 `range.selectNodeContents(container)` 得到 `BOX_TEXT_BEFOREvar leak2="BOX_SCRIPT_TEXT";BOX_TEXT_AFTER`）。`display:none` / `visibility:hidden` / `content-visibility:hidden` 的节点同理。修法按 DOM 结构判断（遍历时跳过 script/style/noscript/template 与隐藏元素），**不要按文本特征过滤**（`//<![CDATA[`、`function(` 这类会把教程里真正想翻译的代码拦掉）；可见文本为空时才退回 `range.toString()`，不要让用户「选上了却没反应」。
- **输入框里的选区不进 Selection API**：`<input>` / `<textarea>` 只能用 `selectionStart / selectionEnd` 截 `value`，没有 Range，所以图标位置退化成控件矩形或鼠标点；`type=password` 以及 number/date/range 这类没有可译选区，按 type 白名单放行（`password` 永不上送）。
- **`all_frames: true` 后网页翻译必须显式 `frameId: 0`**：`tabs.sendMessage` 不带 frameId 会发给所有帧，iframes 里也会各开一份页翻译（重复请求 + 多份状态条）。页翻译命令一律 `{ frameId: 0 }`，右键菜单的划词用 `info.frameId` 只发给点击的那一帧，`Alt+T` 不带 frameId（让每帧自己判断有没有选区）。
- **content script 里的 `crypto.randomUUID` 在 http 页面可能不存在**：请求 ID 必须有 fallback（`translate-client.ts` 里已处理）。
- **无头截图验样式**：Edge headless 有最小窗口宽度（约 500px），直接 `--window-size=380` 会被拉伸/裁切；把内容放进固定 360px 宽的容器再截图才准确。
- **无头截图会截在入场动画首帧、并跟随系统深浅色**：带 `body.play` 之类入场动画的页面，普通 `--screenshot` 会拍到元素透明的第一帧，要加 `--virtual-time-budget=6000`；不显式设 `data-theme` 时 headless 跟随系统（本机是深色），验浅色必须传 `?theme=light` 或设置 `data-theme`。
- **页面内 UI 的主题变量是镜像**：`src/ui/theme.css` 的变量不会进入网页里的 Shadow DOM，`src/content/theme.ts` 的 `CONTENT_THEME_CSS` 在 `:host` 上重声明了一套；改色必须两处同步，否则弹窗与气泡/状态条不一致。宿主主题用 `applyHostTheme()` 写 `data-theme`，`auto` 时移除属性走 `prefers-color-scheme`。
- **`.btn` 与 `.btn.ghost` 的语义和设计板不同名**：插件里 `.btn` 默认是「有边框次级按钮」，`.btn.ghost` 是「无边框安静按钮」，主操作只给 `.btn.primary`。加新按钮时先看 `docs/ui-design.md` §6.1，别一屏放两个主按钮。
- **原生 select 的弹出列表不跟 CSS 变量**：`<option>` 弹层由 UA 画，底色取 select 自身背景、深浅皮肤跟随 `color-scheme`。深色主题下漏掉任一条就会「白底浅字」：① `:root[data-theme="dark"]` 与 `@media` 深色分支都要有 `color-scheme: dark`；② select 背景不能 `transparent`（用不透明底色，如 `var(--field)`）；③ `theme.css` 给 `select option` 显式补 `background-color` 与 `color`。实测踩到：设置页的引擎下拉在暗色下弹层是浅底、文字继承浅色 `--text`，看不清（弹窗引擎已改成自绘多选菜单，不受这条影响）。
- **引擎排序的落点只能按已选行算**：`EnginePicker` 的拖动落点要用只含 `[data-selected="1"]` 行的 rect 列表算（`dropEngineIndex` 返回 0..n 的插入槽位），再按 `slot > from` 扣掉被拖走的自己，否则向下拖会少一格；把手上用 Pointer Events + `setPointerCapture`，别用 HTML5 `dragstart`（弹窗里没有可靠拖影，`details` 菜单还会先收起）。`render` 这类会重置节点状态的逻辑不要碰排序数组，顺序只由 `translateEngines` 决定。
- **`diffArrays` 空 token 会被丢**：`tokenize('')` 返回 `[]`，`diffMarks` 里要跳过空文本的 part，否则会生成空 span。
- **网页翻译写入的节点会触发自己的观察器**：译文 span 也带 `data-yuyi`，`pickScanRoots()` 必须先过滤它们，否则「写入 → 观察到变化 → 再采集」会无限循环。
- **读单元文本不能用 `textContent`**：`Hello<br>world` 会被粘成 `Helloworld`，`readUnitText()` 按节点遍历并把 `<br>` 补成空格。
- **只译文模式不能改 `innerHTML`**：把原有子节点整体搬进 `span[data-yuyi="orig"]` 隐藏、还原时再搬回原位，页面节点引用才不会断；还原逻辑要跳过已被页面删除（`isConnected === false`）的节点。
- **隔离世界里给 `history.pushState` 打补丁看不到页面的调用**：SPA 换页只能靠 `location.href` 比对来触发整页重扫。
- **Shadow DOM 宿主的 `display` 别写成内联样式**：内联 `display:none` 会压住 shadow 里的 `:host([data-open])`，状态条永远不显示（M4 实测踩到，改成只用 shadow `:host`）。
- **`hidden` 属性压不住作者写的 `display`**：UA 的 `[hidden] { display: none }` 优先级低于任何作者规则，`.foot { display: flex }` 会让 `hidden` 完全失效；要显式补 `.foot[hidden] { display: none }`（气泡底栏「没有内容就收起」靠这条）。
- **气泡的「被拖走」状态不能在滚动跟随里被重置**：`selection.ts` 的 scroll / resize 也调 `bubble.showAt()`，所以 `pinned` 只在气泡处于关闭态时才清；否则拖到别处的气泡会被下一次滚动弹回选区。
- **气泡按钮要点到 svg 里的 path 也管用**：`event.target` 会是 `<path>` 而不是 `<button>`，判断动作必须用 `closest('[data-action]')` / `closest('.close')`，不能拿 `target === button` 或 `getAttribute` 直接比。
- **网页翻译要带 `silent: true`**：否则翻一页会往 `history.v1` 灌 5–10 条记录，把历史冲掉。
- **`pnpm` 脚本里跑 `vitest` 的中文断言按 UTF-8 走**；但本机 `powershell` 是 5.1 + GBK，写带中文的 `.ps1` 必须带 BOM，或干脆让脚本只含 ASCII（M4 生成截图夹具时踩到，中文变乱码导致脚本语法错误）。
- **别用 PowerShell 5.1 批量改中文文档**：`Get-Content -Raw` 默认按 GBK 解码 UTF-8，再被 `Set-Content -Encoding utf8` 写回（还带 BOM）会二次损坏，GBK 里无映射的字节变 `?`、部分换行还会被吞掉，且不可逆。改 `.md` 一律用编辑工具或 `[System.IO.File]::WriteAllText($path, $text, [System.Text.UTF8Encoding]::new($false))`；真写坏了，已跟踪文件 `git checkout -- <路径>` 能救回，未跟踪文件只能凭原文重建。
- **设了 `action.default_popup` 后 `chrome.action.onClicked` 不再触发**：点图标只会弹 popup，「点图标开侧栏」这条路彻底没了；本项目已删掉 `side_panel` 声明与 `sidePanel` 权限。
- **弹窗最大约 800×600，且点到别处就关**：所以弹窗取 340×600、内容靠内部滚动（结果卡片 `overflow:auto`）装下检查三视图与润色 diff；关掉后 SW 里的任务**不会中止**（`jobs.ts` 的 `removePort()` 只把 port 从任务里摘掉，不 abort），结果照旧写进 `history.v1`，只是看不到流式过程。弹窗只有 340px，`PolishView` 的「并排对照」要 560px 以上，永远打不开。
- **页翻译按钮只能放弹窗**：`background/page.ts` 用 `tabs.query({active:true,currentWindow:true})` 找目标标签，弹窗不是标签页所以能拿到网页；若哪天把它做成标签页，按钮会指向自己。
- **手写 ZIP 时 EOCD 的「注释长度」在偏移 20，不是 18**：写错会把「中央目录偏移」的高 2 字节清零，zip 文件大小看着正常，`.NET ZipFile` 与解压工具却读到 0 个条目（M5 打包实测踩到）。EOCD 布局：4 签名 + 2 磁盘号 + 2 目录磁盘号 + 2 本盘条目 + 2 总条目 + 4 目录大小 + 4 目录偏移 + 2 注释长度。
- **复习队列要拍快照**：`ReviewSession` 进入时拿的是 `dueCards()` 的一份拷贝，评分后 `book` 刷新不能让队列重排，否则 `index` 会跳过卡片或越界；复习完再回列表时重新算一次队列。
- **收藏去重按 `text + targetLang`，重复收藏直接跳过**：`saveCard` 命中已有卡就原样返回（`created: false`）且不写存储，所以译文、来源与 `ease / interval / dueAt / reps` 都不会被覆盖；想换内容先删卡再收，导入也按 `text + targetLang` 去重。卡片也不存上下文引文：`normalizeCard()` 把旧数据里的 `context` 丢掉，下次 `saveBook()` 写入时清掉。词典快照只在收藏时写一次：旧卡与外部导入的卡没有结构化字段，无法回填；去重命中时已有快照也不会被覆盖。
- **`targetLang: 'smart'` 不能下发到 provider**：它只是设置里的取值，请求发出前必须解析成具体语言，否则谷歌 `tl=smart`、百度/微软的语言码映射都会报错。弹窗、划词、网页翻译各自解析一次，`jobs.ts` 再兜底一次，别依赖兜底。
- **`user-select` 会被宿主页的 `none` 继承进来**：`:host { all: initial }` 只把 `user-select` 还原成 `auto`，而 `auto` 会取宿主页算完的值——遇到 `html / body { user-select: none }` 的站点（编辑器、聊天壳），气泡里的译文一个字都选不中，`Ctrl+C` 也就无从复制。必须显式 `.panel { user-select: text }`（实测：同一份 CSS 在 `html{user-select:none}` 下拖选长度为 0，补上后正常）。头部要拖动，所以 `.head` 仍保持 `none`。
- **Shadow DOM 里的滚动条要自己画，内层滚动容器也不继承**：宿主页/UA 给的是 17px 系统滚动条，深色气泡里是一条浅色条，跟主题完全不搭；`scrollbar-color` 只换轨道与滑块，两端的箭头按钮仍是浅色（实测深色下依旧扎眼）。改用 `.panel::-webkit-scrollbar` 自绘 8px、滑块 `--surface-3`、轨道透明、hover 变 `--text-faint`，白/黑皮肤都跟主题走。**`.ctx-text` 这类 `overflow: auto` 的内层容器不会继承 `.panel` 的滚动条规则**（伪元素按元素各算一遍），漏写就是一条系统浅色条；它铺在 `--surface-2` 上，滑块要单独用 `color-mix(in srgb, var(--text-faint) 55%, transparent)` 才看得见。
- **百度把单段里的换行当多 query**：一段文本内含 `\n` 时，百度返回的是多条 `trans_result`，按 1 段校验会报「返回了 N 段」。`parseBaidu()` 保持严格（多段对齐要用），单段多行走 `parseBaiduLines()` 把行拼回 `\n`——划词多行选区与弹窗粘贴多行都走这条路。
- **`::selection` 会从宿主页漏进 Shadow DOM**：这条是最坑的——页面写一句 `::selection { background: transparent; color: inherit }`（编辑器、深色皮肤、假高亮实现都爱写），气泡里的选区就**完全看不见**：字其实已经选上了，`Ctrl+C` 也有内容，但一点高亮都没有，看起来像没选中。实测页面侧再加 `!important` 也压不过气泡内的 `.panel ::selection`，所以气泡自带一条（`color-mix(in srgb, var(--brand) 40%, transparent)` + `var(--text)`）就够。**不要靠 UA 默认高亮**。
- **窄气泡的底栏文字动作要收成纯文字**：单词/词典/错误态的底栏最宽时是四颗「图标 + 文字」按钮，240px 下限下约需 236px，减去左右内边距只剩 218px，必然换行。`applyWidth()` 按最终宽度给 `.panel` 挂 `compact` 类（小于 300px 时隐藏 `.act svg`、收紧内边距），四颗纯文字按钮约 164px 就能排一行；整句翻译的动作已经搬到卡头纯图标，不受这条影响。`render()` 每次都会 `panel.className = 'panel'` 重置类名，所以 `applyWidth()` 必须在 render 末尾再调一次；只靠 `schedulePosition()` 不行，`pinned` 时 `position()` 会提前返回。
- **流式渲染不能重建节点**：`renderStreaming` 原来每个 delta 都 `body.innerHTML=''` 再新建 `<pre>`，正在拖选的文字会被整段换掉，高亮闪一下就没了。现在「新文本以旧文本为前缀」时只往光标前追加一个文本节点（`insertBefore(createTextNode(added), cursor)`），前缀对不上才整块重建。
- **宿主页可能在 document 上清选区或取消选择**：气泡在 shadow 根上以 capture 拦掉 `mousedown` / `mouseup` / `selectstart` 的冒泡（`stopPropagation`），页面的冒泡阶段监听就收不到，无法 `removeAllRanges()` 或 `preventDefault()`。注意 `document` 的 capture 监听比 shadow 根更早，拦不住那一层；拖动的 `pointerdown` 是另一个事件类型，不受影响。
- **无空格不等于单词**：`looksLikeWord()` 原来只排除空白并允许 1–24 个字母，15 个汉字的中文短句也会命中，气泡于是走单词卡，只显示主引擎结果、也不给「扩上下文」。含汉字时只认 1–4 个连续汉字；另外气泡完成态只有 `view.word && latestRuns.length <= 1` 才画单词卡，多引擎必须走结果卡，否则会重新退化成只显示第一家。回归测试要同时覆盖中文短句 `looksLikeWord() === false` 与 `word: true` + 两条 runs 的卡片渲染。
- **结果卡动作是纯图标，保存还是异步的**：卡头四枚 `.engine-act` 没有文字，必须同时给 `title` 与 `aria-label`，否则功能不可发现；收藏按钮不能点了立刻变「已收藏」——`BubbleHandlers.onSave` 返回 `Promise<boolean>`，只有 `true` 才换对勾并禁用，`false` 要保持可点让用户重试。单引擎也必须走 `renderRuns()`（`cardMode` 会合成一条 run），别在这种调用上退化成裸 `pre.text`，否则单/多引擎两套渲染会漂移。
- **气泡多引擎流式要按引擎各存一份前缀**：`renderStreaming` 的那套「新文本以旧文本为前缀就只追加文本节点」不能只用一个 `streamedText`——多引擎时每个引擎各自流式，共用一个值会让对不上的卡整块重建、拖选被打断。气泡里是 `runShown: Map<engineId, string>`，逐卡比较；内容结构或引擎数量变化时才清空。
- **气泡译文区铺底色会吃掉骨架条**：`.skel i` 原来用 `--surface-2`，铺上 `--brand-soft` 后浅色下两色几乎相同，骨架直接看不见；骨架条改用 `color-mix(in srgb, var(--brand) 22%, transparent)`（实测 340px 浅色截图确认）。
- **标题与大纲不要用 innerText**：`headingChain` / `pageOutline` / `pageIntro` 原来每次划词都对最多 480 个标题调 `innerText`，强制 layout，长文档单次几十毫秒；现在统一走 `headingText()`（`textContent` + WeakMap 缓存，超长截断加省略号）。
- **邻段要过滤噪音与外语**：nav / aside / footer / pre / code / script / style / 表单控件等命中就不进上下文；另外一侧 CJK 占比 ≥0.6、另一侧 ≤0.2 视为跨语言（双语对照页不把译文当上/下文），触发阈值是邻段 20 字、选区 12 字。
- **会话条目识别是启发式的**：`isConversationItem()` 用 tag/id/class 里的 comment/message/chat/reply/thread 判断评论或聊天条目，并排除 body/content/header/action 等部件；识别到才按同方向取 2 条（自定义元素与 `li` 只收同标签兄弟，避免把评论卡里的作者信息、操作栏当成邻条），识别不到退回单邻段。短于 12 字的条目、把每条评论包在额外 wrapper 里的站点可能只拿到一条或为空，遇到真实 DOM 再补规则。
- **选区所在的块只取最近的块级祖先**：`pickBlock()` 原来按 `maxChars` 向外扩张，评论/聊天页会把整块评论列表当成「所在块」，上文/下文于是变成站内导航与侧栏（B 站实测）。现在遇到第一个有文字的块级祖先就停；Shadow DOM 选区直接以宿主为块（`root.host`），不再要求宿主是块级。
- **Shadow DOM 里的文字不在宿主 `textContent` 里**：B 站新版评论卡（`bili-comment-thread-renderer`）的文字全在 shadow root 内，`element.textContent` 读到的是空串，`textOf()` 于是把相邻评论判成「没文字」，气泡里只剩页面大纲/首段。`structure.ts` 的 `collectText()` 递归穿透 open shadowRoot（深度上限 8），`textOf()` 再统一收口；`edgeUnit()` 靠 `parentAcrossShadow()` 上爬，能从 shadow root 跳到宿主再找兄弟节点，所以嵌套 shadow（评论卡里再包一层评论卡）也能取到另一条评论；`collectText()` 还跳过 `style` / `script` 等不可见文本，否则 B 站 rich-text 组件里的整段 CSS 会混进「段落上下文」；`pickBlock()` 对 shadow 选区直接返回宿主，段窗口与邻段都用宿主文字。
- **Shadow DOM 选区不要求宿主是块级**：B 站评论组件是自定义元素，`display` 不保证是 block；`pickBlock()` 先看选区起点的根是不是 ShadowRoot，是就直接返回宿主，避免一路爬到整个评论列表容器。
- **没有语义标签的站点框架要靠交互密度识别**：B 站/YouTube/Discord 的导航、侧栏、工具栏大量是裸 `div`，`NOISE_TAGS` 抓不到；`isChrome()` 看自身及 ≤6 层祖先的 header/nav/aside/footer/menu 标签、landmark role 与 id/class 黑名单，`interactiveDensity()` 把链接/按钮文本占比 ≥0.5 的块判为导航；下钻候选只走块级子元素，否则聊天消息头会只取到时间戳。
- **跨块选区取不到段落窗口**：`buildContextWindow` 用 `indexOf` 定位，选区跨 `p` / `li` 时必然失败；窗口改由 `buildContextWindowForRange` 用 range 的起点块与终点块各取 head / tail，两块之间的文字按选区原文补齐。
- **超过 2000 字的选区不再被拒**：现在照常翻译，但上下文只剩页面标题与网站（避免 2000 字预算与大请求叠加），底栏也不给「扩上下文」。
- **iframe 里的页面标题要问同源顶层窗口**：iframe 自己的 `document.title` 常为空、`location.hostname` 是内嵌内容的域名；`pageContext()` 在同源且 `top !== window` 时改用顶层标题与域名，跨域才回落本帧。
- **思考强度默认不下发**：`reasoningEffort` 默认空串（「跟随模型默认」），`postChat` 只在非空时才把 `reasoning_effort` 塞进请求体。OpenAI 兼容层对这个字段的接受度不一致（不支持的老模型或网关直接 400），默认带上等于把本来能用的服务打挂。设置页的档位只对这一家的翻译 / 检查 / 润色生效，报错就改回默认。
- **MV3 的 `chrome.commands` 没有 `update()`**：扩展只能 `getAll()` 读，不能改原生快捷键（`update` 只有 Firefox 有）。所以 manifest 里的 `Alt+T` / `Alt+P` 永远是这两个键，改键只能靠 content script 捕获 `keydown`；SW 收到 `onCommand` 后必须先 `loadSettings()`，只有该动作仍是默认绑定才转发，否则自定义键会变成「旧键 + 新键」都能用。两套路径同时命中时靠 content 的 200ms `lastAction` 去重，别去掉。
- **页面内快捷键会被焦点和站点抢占**：自定义键只在网页有焦点时生效（地址栏、开发者工具、扩展弹窗里都不触发）；页面自己更早的 capture 监听或 `preventDefault` 会把按键吞掉；`page` 动作只认顶层帧，iframe 里按无效；用户在 `edge://extensions/shortcuts`（Chrome 为 `chrome://extensions/shortcuts`）改的原生键设置页看不到，浏览器里显示的仍是 manifest 的值（待验证具体表现）。

## 10. 每次改动后的验证清单

完整清单由机器执行；人类贡献者的最小冒烟集见 `CONTRIBUTING.md` 第 7 节，两边冲突时以本清单为准。

1. `pnpm check` 全绿（类型 + 单测 + 构建 + verify + docs:check）
2. 在 Edge 或 Chrome 里重新加载扩展
3. 弹窗：点图标 → 光标已在输入框 → 输入一句英文 → `Enter` → 出中文；再输入一句中文 → `Enter` → 出英文（默认目标语言「智能」）；在引擎多选里勾两个引擎（结果卡按勾选顺序排列；拖动第一位的把手或聚焦后按 ↑ / ↓ 换序，重开菜单顺序与「主引擎」标记都还在，再翻同一句时结果卡顺序跟着变，查一个单词仍只出词典卡）；点「历史」再切回「翻译」，光标回到输入框；点到别处关掉弹窗再打开，切到「历史」tab 能找回刚才的结果；再输入一个单词（如 `hello`）→ 结果显示词典卡（音标与发音、中文释义、英英释义、词形变化），点音节按钮能出声；翻译后点「复制」→ 按钮短暂显示「已复制」；点输入框右上角 × → 输入、结果与收藏/复制态一起清空并回到空态；点页脚分体按钮右侧箭头 → 向上弹出「网页翻译设置」菜单，点「覆盖原文」后菜单关闭、勾选改到「覆盖原文」，再点菜单外空白处关闭；输入一个中文词（如 `苹果`）→ 词典卡标题变「英文释义」、拼音可点发音、正文是 apple；输入一个词典没有的人名或自造词 → 自动改用翻译并在结果里标「词典未收录，已改用翻译」（勾两个引擎时应同时出两张结果卡）
4. 检查：弹窗输入框粘一段有拼写/语法错误的英文 → 点框内右下角「检查」→ 错误处红底划掉、黄色表示警告、绿色给改法；点「忽略」变灰；「终稿」里的替换正确
5. 润色：在引擎选择下的设置条里展开「润色方向」勾「更诗意」并写一句自定义要求 → 点「润色」→ 合并视图里删除是红色划线、新增是绿底；「纯净稿」可复制；「再来一版」能重跑
6. 设置页骨架：顶栏 6 个分类（多一个「词典」）都能切（浅色与深色各一遍），刷新后停在原来那个分类；「引擎」徽标数 = 不可用槽位数；改主题/目标语言 → 回弹窗看到生效；「其它 → 快捷键」点「修改」后按下组合键（如 Alt+Shift+Y）→ chip 换成新键、刷新页面后仍在 → 回网页按新键能翻译、旧默认键 `Alt+T` 不再触发；录一个浏览器保留组合（如 `Ctrl+T`）或另一动作已用的键 → 就地报错且不保存；按 `Backspace` 清除 → 显示「未设置」且网页里不再触发；非默认时右侧出现「恢复默认」→ 点回 `Alt+T` 后网页里恢复生效；录制中按 `Esc` → 取消且原值不变
7. 引擎页：翻译面板是多选菜单（已选项置顶、第一行标「主引擎」，勾选多个后可拖动六点把手或聚焦把手按 ↑ / ↓ 重排，落点有品牌色线）、其余三个槽位是下拉，只列可用服务；多选里部分不可用时标「部分不可用」；把「网页翻译」选到一个没配置的服务（或清掉它的凭证）→ 状态变「不可用」+ 出现「去配置」，点它能跳到对应服务详情
8. 服务页：免费通道开关能停用（引擎列表里随即消失）；百度填 AppID/密钥后「测试连接」有结果；微软只填 Key 也能测；添加一个 AI 服务（预设或自定义）→ 「授权并测试」有结果；改完回列表状态点跟着变；删除 AI 服务后引擎列表不再出现它；AI 详情里「思考强度」默认是「跟随模型默认」（此时请求体不带 `reasoning_effort`），改成「高」再测一次能正常返回（不支持该参数的服务会报错，改回默认即可）
9. 历史 tab：弹窗里能回看、能删除，检查/润色条目前有类型标签
10. 划词：在普通网页选中一段英文 → 光标右下角（键盘选区用选区末端）出现插件图标（蓝底白羽，悬停抬 2px）；只勾一个引擎时也出现一张结果卡（卡头服务名+状态点，右上角朗读/复制/收藏三枚纯图标，悬停显示用途；AI 卡多一枚扩上下文），句式排版见下方；引擎勾两个时气泡里出现两张并列卡、各自边生成边显示、每张卡单独复制/收藏/朗读，其中一家失败只标红那张；窄选区（触到 240 下限）时服务名可被截断、四枚图标不溢出、译文仍排得下（单词/词典卡底栏的四颗文字动作收成纯文字、图标隐藏）→ 点开气泡贴在选区下方（不挡原文）、宽度比选中文字多出卡片内边距（正文宽约多 8px；超过视口一半时按一半截断）、译文区有品牌淡色底（与头部/底栏分层）、每张卡上直接看到译文与图标动作；在气泡里拖选译文能选中并 `Ctrl+C` 复制（`user-select: none` 的站点也要能选，如编辑器/聊天壳）；**把页面的 `::selection` 改成透明或深色后，气泡里的选中仍有明显的淡蓝高亮**（淡蓝=品牌色 40%）；多段选区（如提交信息）译文保留原文的换行与空行；流式生成过程中拖选不被打断；滚动条是 8px 深色细条而不是浅色系统条；按住气泡头部能拖走，松手后滚动页面不弹回；关闭只有右上角一个 ×；整句完成态没有底部动作，底栏只有「上下文预览」一行（没有语境时整条收起），点它展开本次实际发出的上下文（预览区滚动条也是 8px 主题色细条，不是系统浅色条）；**在 B 站/YouTube 评论区或 Discord 聊天里划选一条消息，展开的上下文里上文/下文应是相邻的评论或消息、各最多 2 条且按对话顺序排列（没有就为空），不能是站内导航与侧栏**；点 AI 卡右上角「扩上下文」→ 回到加载态「正在带上整页结构重译」并重新出译文（范围已是整页、没有块元素或选区超过 2000 字时该按钮不出现）；**在搜索栏 / 输入框里选中文字、contenteditable 编辑器里选中、B 站新版评论区这类 Shadow DOM 里选中、iframe 里选中，都要出图标并能翻译**；用 `Shift+方向键` 做键盘选区也要出图标；划选一个单词 → 气泡里出现词典卡（音标、释义、词形），点音标播放发音；划选一个词典未收录的短词 → 自动改用翻译，勾两个引擎时应出现两张结果卡；点底栏「复制」→ 按钮短暂显示「已复制」；划选 1–4 个汉字（如 `你好`）→ 气泡显示英文释义卡；把选区扩到把答案卡底部的脚本或 `display:none` 节点也包进去（如整块选中 Bing 的 Copilot 答案）→ 气泡先出守卫态（原文模糊 + 黄色提示 + 后果说明 + 「继续翻译」），此时不发请求、底栏收起，点「继续翻译」只翻可见文字；Esc 关闭；Alt+T 与右键菜单同样能弹（右键在 iframe 里只作用于点击的那一帧）
11. 网页翻译：英文页面点弹窗底部「翻译本页」→ 弹窗自动关闭，段落下方出现中文，代码块/输入框不动，布局不塌，右下角状态条显示「已译 N 段」；回到弹窗点页脚分体按钮右侧箭头 → 菜单里选「覆盖原文」→ 已译页面立刻只剩译文（不重新请求），再选「双语显示」→ 原文回来、译文仍在；菜单里的「还原本页」→ 页面回原样，DOM 里没有残留 `data-yuyi` 节点
12. 网页翻译的取消与补译：长页面翻译中途点「取消」→ 不再发新批次、已译保留；滚动出懒加载内容 → 半秒后自动出现译文；重翻同一页 → 命中批次缓存很快，换一个包含相同句子的页面也只请求新句子（段缓存）
13. 失败路径（已无降级）：断网或把 Key 改错 → 弹窗/状态条直接显示错误文案与「去设置」，**不会**换成免费通道；失败段落带虚线框，点「重试失败」只重发那几批
14. 外观：浅色与深色各过一遍弹窗、划词气泡、页内状态条、设置页，逐条对照 `docs/ui-design.md` 第 10 节的验收清单（主色只做主事、圆角四档、动效可降级）
15. 生词本：网页划词划到一个单词 → 气泡显示词典卡 → 点底栏「收藏」→ 弹窗头部书本图标打开生词本 → 卡片列表出现富词典卡（默认收起，只显示词句与到期标签，点标题行展开后才看到音标可点发音、中文释义、英英释义、词形变化、双语例句、词组），卡片不带上下文引文；划一句话收藏则是纯译文卡；再点一次「收藏」不会新增卡片，按钮直接显示「已收藏」（换目标语言再收会得到另一张卡）；弹窗里翻译一段再点「收藏」也进列表；点「开始复习」→ 显示原文 →「显示答案」出译文 → 四种评分各点一次（again 的卡 10 分钟后回到待复习）→ 统计里的今日新增/待复习/正确率跟着变；「导出 JSON」能下载、「导入 JSON」回来提示新增/跳过、「清空」需要确认
16. 打包：`pnpm package` → `release/yuyi-<版本>.zip` 解压到任意目录 → 扩展页（`edge://extensions` / `chrome://extensions`）用「加载解压缩的扩展」/「加载已解压的扩展程序」指向解压目录 → 弹窗、生词本、划词都正常

## 11. 路线图状态

已完成：M0–M7（骨架、服务商层 + 设置页、检查 / 润色、划词、网页翻译、学习 + 打包、多服务 + 设置页重设计、词典接口）、工具栏弹窗、UI v1「柔光」、快捷键编辑。各里程碑的范围与验收、后续计划见 `docs/design.md` 的「里程碑与状态」表（本文只留这份摘要）。
