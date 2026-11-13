# 羽译 UI 设计规范（v1 柔光 Soft Bloom）

> 这份文档是界面外观与组件的**唯一标准**：颜色、圆角、阴影、动效、三处界面的结构与尺寸都写在这里。
> 状态类信息（里程碑、命令、测试数）以根目录 `AGENTS.md` 为准；设计取舍的「为什么」以 [design.md](design.md) 为准。
> 本版方案来自 `AGENTS/ui-design/v1-soft.html`（设计对照板，不提交版本库），落地代码即 `src/ui/theme.css`、`src/popup/popup.css`、`src/content/theme.ts`。

## 1. 设计原则

1. **白纸优先**：界面主体是一只白卡片，层级靠柔和阴影与浅色底，不靠粗边框和重色块。
2. **主色只做主事**：`--brand` 只出现在品牌标记、主按钮、选区、激活态与关键图标上；一屏里主色面积越小越像工具。
3. **圆角自成一套**：外层大、内层小，内层圆角 = 外层 − 内衬（`calc(var(--radius-md) - 3px)` 这类几何减法），不做随手圆角。
4. **动效只表达状态**：入场、悬停、状态切换才动；常驻循环动画只有加载点、流式光标与「翻译中」圆点。
5. **深色是独立设计**：不是把浅色反相。深色降低饱和、主色提亮、输入框比卡片更暗（`--field`），主按钮改深字（`--on-brand`）。

## 2. 设计变量

全部定义在 `src/ui/theme.css`。浅色是 `:root` 默认值；深色有两处入口——系统深色（`@media (prefers-color-scheme: dark)` 且未显式设 `data-theme="light"`）与手动（`:root[data-theme="dark"]`）。扩展页面由 `applyTheme()` 写 `data-theme`，`auto` 时移除属性交给系统。

### 2.1 语义色

| 变量 | 浅色 | 深色 | 用途 |
|---|---|---|---|
| `--bg` | `#F7F8FC` | `#0F1118` | 页面底色 |
| `--surface` | `#FFFFFF` | `#171A23` | 卡片、弹窗、气泡底 |
| `--surface-2` | `#F2F4FA` | `#1D2130` | 次级底（设置条、结果空态、引文块） |
| `--surface-3` | `#E9EDF7` | `#262B3D` | 三级底（tag、进度轨、hover） |
| `--border` | `#E6EAF3` | `#2A3042` | 1px 边框、分割线 |
| `--text` | `#1A1D2B` | `#E9ECF5` | 正文与标题 |
| `--text-muted` | `#5F6779` | `#9AA4BB` | 次要文字、元信息 |
| `--text-faint` | `#98A0B3` | `#7A8399` | 占位、禁用、极弱信息 |
| `--brand` | `#4F6BF0` | `#7D8EFF` | 主色 |
| `--brand-strong` | `#3A54D8` | `#94A2FF` | 主色深一档（文字） |
| `--brand-soft` | `#EDF1FF` | `rgba(125,142,255,.15)` | 主色浅底（聚焦环、激活底） |
| `--danger` / `--danger-soft` | `#D93B32` / `#FDECEA` | `#FF8078` / `#331B1B` | 错误 |
| `--warn` / `--warn-soft` | `#A85A00` / `#FEF3E2` | `#E7A93C` / `#2C2413` | 警告 |
| `--ok` / `--ok-soft` | `#067A4D` / `#E7F6EE` | `#4ADE80` / `#12291C` | 成功、改法 |
| `--mark-error` / `--mark-warn` / `--mark-add` / `--mark-muted` | `#EF4444` / `#F59E0B` / `#16A34A` / `#98A2B3` | `#F87171` / `#FBBF24` / `#4ADE80` / `#8A93A8` | 荧光笔语义色 |

### 2.2 派生变量

| 变量 | 浅色 | 深色 | 说明 |
|---|---|---|---|
| `--brand-grad` | `linear-gradient(135deg,#5A78FF,#4F6BF0)` | `linear-gradient(135deg,#8C9BFF,#7D8EFF)` | 品牌标记与主按钮底 |
| `--on-brand` | `#FFFFFF` | `#10131C` | 主色底上的文字色（深色必须深字） |
| `--raised` | `#FFFFFF` | `#262B3D` | 「浮起来」的块：tab 指示器、语言胶囊、空态图标座 |
| `--field` | `#FFFFFF` | `#12141D` | 输入框底（深色比卡片更暗才像凹槽） |
| `--brand-glow` | `0 6px 16px -10px rgba(79,107,240,.75)` | 同结构、提亮 | 主按钮/品牌标记的彩影 |
| `--mark-error-bg` / `--mark-add-bg` / `--mark-warn-bg` | 13% / 13% / 18% 透明 | 18% / 16% / 20% | 荧光笔底色 |
| `--wash` | 左上角柔光径向渐变 | 同结构、低透明 | 页面/舞台的柔光背景，可选 |

### 2.3 几何与动效变量

| 变量 | 值 | 说明 |
|---|---|---|
| `--radius-sm` | `10px` | 按钮、输入框、chip、小图标座 |
| `--radius-md` | `14px` | 卡片、气泡、composer、分段控件 |
| `--radius-lg` | `20px` | 设置页卡片、设置条外框 |
| `--radius-xl` | `26px` | 预留（大展示块） |
| `--shadow-sm` | `0 1px 2px rgba(20,28,60,.06)` | 卡片默认 |
| `--shadow-md` | `0 14px 34px -14px rgba(43,60,140,.28)` | 悬停抬升、气泡、状态条 |
| `--ease` | `cubic-bezier(.22,1,.36,1)` | 默认缓动（快出慢停） |
| `--ease-pop` | `cubic-bezier(.34,1.5,.64,1)` | 仅气泡入场（唯一允许轻微回弹的地方） |
| `--dur-fast` | `240ms` | hover / color / background |
| `--dur-base` | `320ms` | 区块入场 |
| `--dur-pop` | `340ms` | 气泡弹入 |
| `--font` | `system-ui, "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif` | 全站字体 |
| `--mono` | `ui-monospace, "Cascadia Mono", Consolas, monospace` | 地址、Key、快捷键 |

**新增配色方案时**：不要改组件，只在 `theme.css` 里加一个 `:root[data-theme="xxx"]` 变量块（或一组 `prefers-color-scheme` 分支），把 §2.1–2.2 的变量全部重定义。组件只写 `var(...)`，从不写颜色字面量。

## 3. 排版

| 场景 | 字号 / 字重 | 行高 | 备注 |
|---|---|---|---|
| 设置页标题 | 21px / 700 | 1.3 | `.page-title` |
| 设置页副标题 | 12.5px / 400，`--text-muted` | 1.6 | `.page-subtitle` |
| 分区标题 | 13.5px / 650 | 1.4 | 前置 24px 图标座 `.card-ico` |
| 气泡单词 | 19px / 650 | 1.35 | 单词卡原文 |
| 气泡译文 | 14.5px / 400 | 1.62 | `.text` |
| 气泡元信息 | 10.5px，tabular-nums | 1.4 | `.meta` |
| 弹窗正文 | 13px / 400 | 1.55 | `.popup` 基准 |
| 结果正文 | 13.5px / 400 | 1.65 | `.result-text` |
| 弹窗元信息 | 11.5px，tabular-nums | 1.4 | `.result-meta` |
| 输入框文字 | 12.5–13px | 1.55 | 设置页 12.5、弹窗 composer 13 |
| 标签/胶囊 | 10.5px / 550 | 1 | `.tag`、`.pill` |
| 辅助说明 | 11–11.5px，`--text-muted` | 1.5–1.6 | `.hint` |

规则：
- 中英混排靠间距而不是空格字符；标题不额外加 `letter-spacing`。
- 数字（耗时、段数、版本、计数）一律 `font-variant-numeric: tabular-nums`，避免跳动。
- 中文标点用全角；代码、URL、Key 用 `--mono`。

## 4. 间距、圆角与阴影

- **间距只用 4 的倍数**：4 / 8 / 12 / 16 / 20 / 24。组件内部允许 6/7/9/10 这类紧凑值（340px 宽度与 600px 高度预算所限），但卡片、分区、栏与栏之间必须走 4 的倍数。
- **圆角几何减法**：外层 `--radius-md`（14）内衬 3px 时，内块圆角 = `calc(var(--radius-md) - 3px)`；`--radius-lg`（20）内衬 6px 时 = `calc(var(--radius-lg) - 6px)`。不要在同一个容器里混用两套内衬。
- **阴影只分两级**：静止卡片 `--shadow-sm`；悬停/浮层 `--shadow-md`。深色下阴影几乎不可见，靠 `--surface` 与 `--border` 的明度差建立层级，不要给深色加发光边框。
- 卡片内边距：设置页 `16px 20px 20px`；弹窗结果卡 `10px 11px 9px`；气泡 `8px 12px 8px`。

## 5. 动效规范

| 场景 | 参数 | 说明 |
|---|---|---|
| 卡片/区块入场 | `fade + translateY(10px→0)`，`--dur-base --ease` | 列表项错峰 40ms |
| 气泡弹入 | `scale(.96)+translateY(6px) → 1`，`--dur-pop --ease-pop` | 唯一回弹 |
| tab 指示器 | `translateX` 切换，260ms `--ease` | `--ti` 变量控制位置 |
| 交互反馈 | hover `translateY(-1px)`，active `scale(.97)`，`--dur-fast` | 按钮、图标按钮、历史卡 |
| 主色聚焦 | `box-shadow: 0 0 0 3px var(--brand-soft)` + 边框转主色 | 输入框、设置条、引擎条 |
| 流式光标 | `steps(1,end)` 1s 闪烁 | 只出现在流式译文末尾 |
| 加载点 | 5px 圆点三点呼吸，1.2s，错峰 160ms | loading 态 |
| 「翻译中」圆点 | `pulse` 1.4s（缩放+透明） | 状态行与页内状态条 |

约束：
- 不给常驻元素做位移循环，不做 `>400ms` 的常驻动画。
- `prefers-reduced-motion: reduce` 时：关闭弹入位移、三点/光标/圆点动画、hover 位移；只保留颜色过渡（`transition-duration: 150ms`）。
- 动效不承载唯一信息（状态必须同时有文字或图标）。

## 6. 组件规范

### 6.1 按钮

插件里的 class 与设计板的叫法对应关系如下（**这是最容易踩错的一处**）：

| class | 外观 | 用在哪 |
|---|---|---|
| `.btn`（默认） | 1px `--border` 边框 + `--field` 底 + 深字 | 设置页数据操作、AI 测试、检查/润色动作、`翻译本页` 以外的次级按钮 |
| `.btn.primary` | `--brand-grad` 渐变底 + `--on-brand` 字 + `--brand-glow` | 每个界面**只有一个**主操作：弹窗「翻译」「翻译本页」、设置页「添加 AI 服务」、检查「复制终稿」 |
| `.btn.ghost` | 无边框无底，`--text-muted` 字，hover 出 `--surface-2` | 结果卡「复制/清空」、历史「删除/清空」、错误「去设置」、润色「修改清单」 |
| `.btn.danger` | `--danger-soft` 底 + `--danger` 字 | 清空历史、恢复默认、删除 AI 服务 |
| `.btn.small` / `.btn.xs` | 26px/22px 高，12/11.5px 字 | 紧凑动作区 |

态：hover 抬 1px（ghost 不抬）、active 缩到 .97、disabled 半透明且不响应。主按钮不做抬升以外的变形。

### 6.2 图标按钮 `.ibtn`

28×28，圆角 `--radius-sm`，默认 `--text-muted`，hover 底 `--surface-2` + 字变深 + 抬 1px。图标统一 17px、内联 SVG、`stroke-width: 1.7`、圆头圆角连接。**不用 emoji 当图标**。

### 6.3 分段控件（tab / 视图切换）

- 弹窗主 tab `.tabs > .tab`：外层 3px 内衬、底 `--surface-2`、容器圆角 14；`.tab-ind` 是 24px 高的白色（`--raised`）指示器，`transform: translateX(calc(var(--ti) * 100%))` 滑动 260ms；`.tab.active` 只负责文字变深，不负责底色。
- 检查/润色的三视图 `.view-tabs > .view-tab`：同构，高度 24、字号 11.5；激活项 `--raised` + `--shadow-sm`。

### 6.4 标签与胶囊

`.tag`：高 19px、左右 7px、圆角 10、10.5px/550。变体 `brand`/`ok`/`warn`/`error`/`sev-*`。
`.tag` 只放短词（缓存命中、0.8s、2 处、错误），不放句子。

### 6.5 输入类

- `.input` / `.select`：高 36、圆角 10、`--field` 底、1px 边框；聚焦边框转主色 + 3px `--brand-soft` 环。
- `.select` 用内联 SVG 背景画下拉箭头（12px，`right 10px center`），不依赖系统箭头。
- **原生下拉列表（`<option>` 弹出层）不吃 CSS 变量**：它的深浅皮肤跟随 `color-scheme`，底色取控件自身背景。因此：① 深色分支必须声明 `color-scheme: dark`（否则变量是深色、UA 仍按浅色画弹层）；② **select 的背景不能是 `transparent`**，必须给不透明底色（`.sb-eval` 用 `var(--surface)`，`.select` 用 `var(--field)`），透明底会让弹层回落到浅色；③ 在 `theme.css` 里给 `select option` 显式补 `background-color: var(--field)` 与 `color: var(--text)` 兜底。
- 弹窗内的语言胶囊 `.sb-chip` 是 **原生 select 伪装成胶囊**：无边框、居中文字、`--raised` 底、`--shadow-sm`；引擎行 `.sb-engine` 是「label + select + 箭头」的一整行，整行 hover 才出现主色环。
- `.textarea` 只用于设置页以外的长文本场景；弹窗输入框用 `.composer` 容器 + 无边框 `.composer-input`，聚焦环画在容器上。

### 6.6 开关

`.switch` 是 label 包三段：`input[type=checkbox]`（视觉隐藏）+ `.sw` 轨道 + 文案。轨道 44×24、圆角 10、关闭 `--surface-3`、开启 `--brand`；滑块 16×16、圆角 6、白色、`translateX(20px)` 切换，260ms。键盘聚焦时轨道出现 3px 主色环。

### 6.7 卡片

- 设置页 `.card`：圆角 20、1px 边框、`--shadow-sm`、内边距 16/20/20；分区之间间距 16。
- 弹窗结果卡 `.result-card`：圆角 14、1px 边框、`--shadow-sm`、内部滚动、底部分隔线（`.result-actions`）。
- 内嵌服务卡 `.provider-card`：`--surface-2` 底 + 边框 + 圆角 14 + 内边距 16；里面的输入框改回 `--surface` 底以形成层次。
- 空态 `.empty`：在结果卡里是 `--surface-2` 圆角块，居中图标座（38×38 `--raised` + 主色图标）+ 标题 + 一句提示。

### 6.8 荧光笔标记

语义固定：红 = 错误、黄 = 警告/建议、绿 = 改法、灰 = 已忽略。

| class | 视觉 |
|---|---|
| `.mark-del` | 底色 `--mark-error-bg`、文字 `--text`、删除线（1.5px，颜色 `--mark-error`） |
| `.mark-del.sev-warning` | 底/线换 `--mark-warn` |
| `.mark-ins` | 底 `--mark-add-bg`、文字 `--ok`、600 字重（不加下划线） |
| `.mark-warn` | 底 `--mark-warn-bg` + 波浪下划线 `--mark-warn` |
| `.mark-warn.ignored` | 去掉底色，灰色虚线删除线 |
| `.active` | `outline: 2px solid var(--brand)`，用于「点击卡片定位高亮」 |

`.issue-item` 对应问题卡：`--surface-2` 底、左侧 3px 语义色竖条（`::before`，上下各留 6px）、圆角 14、激活时 `--surface-3` + 2px 主色环。

## 7. 界面规格

### 7.1 划词触发图标

- 28×28、圆角 10、`--surface` 底、1px 边框、`--brand` 字（700/13px，内容「译」）、`--shadow-md`；hover 抬 2px 并加深阴影。
- 挂在 `document.documentElement` 下的 Shadow DOM 宿主里，位置由选区矩形计算（右上优先，越界翻到下方，四周留 6px）。
- 主题：宿主上 `data-theme` 由设置决定；`auto` 时移除属性，走 `prefers-color-scheme`。

### 7.2 划词气泡

- 宽度 `min(340px, 100vw - 24px)`，最大高度 `min(60vh, 420px)`，内部滚动；圆角 14、1px 边框、`--shadow-md`。
- 结构：头部（13×13 渐变羽毛点 +「羽译 · 划词翻译」+ 22×22 关闭按钮）→ 正文 → 底栏（10.5px 元信息 + 动作组）。
- 底栏动作：`朗读`「复制」（流式/加载时不出现）、`重试`（仅错误）、`关闭`；均为 24px 高、10.5px 的文本按钮，hover 出 `--surface-3`。
- 状态：
  1. **加载**：三点呼吸 +「正在翻译」+ 两条骨架线（100% / 72%）。
  2. **流式**：`pre.text` 逐字输出，末尾 2px 主色光标闪烁，元信息「生成中…」。流式态**不显示原文引用**，避免跳动。
  3. **完成（整句）**：译文 14.5px；元信息「引擎 · 1.4s」；显示朗读/复制。
  4. **完成（单词卡）**：`word-line`（19px/650 原文）→ 10px 间距 → 14px 译文；底部元信息与整句一致。**单词卡不显示音标与词性**——服务商不返回这两项，设计板里的 `adj.`/音标只是排版参考。
  5. **错误**：`--danger-soft` 圆角图标座 + 12.5px 文案；底栏只留「重试 / 关闭」，底栏背景改透明。
- 入场：`--ease-pop` + `--dur-pop` 弹入；主题变化不重播。

### 7.3 工具栏弹窗（340 × 600）

高度预算（固定，不整体滚动）：

| 区域 | 高度 | 内容 |
|---|---|---|
| 头部 `.popup-header` | 40 | 品牌（24px 标记 + 羽译）+ 胶囊 tab（翻译/历史，滑动指示器）+ 生词本/设置两个图标按钮 |
| 主体 `.popup-body` | 508 | 内边距 `0 12px 12px`，纵向 stack，间距 8 |
| 底部 `.popup-footer` | 52 | 1px 上边框 + 主按钮「翻译本页 / 重译本页」占满剩余宽度 + 版本号（11px `--text-faint`） |

主体自上而下：设置条 `.setbar`（语言两枚胶囊 + 交换 + 引擎行）→ 输入卡 `.composer`（输入区 + 右下动作：检查 / 润色 / 翻译）→ 折叠项 `.polish-config`（28px 高的「润色方向」条）→ 结果卡 `.result-card`（`flex: 1`、内部滚动）。

- 结果卡状态行 `.result-meta` 只放状态与元信息；可用动作（复制/清空）沉到卡片底部 `.result-actions`，用 1px 分隔线与正文分开。
- 检查结果：状态行（处数/保留/忽略/引擎/耗时 + 三视图切换）→ 高亮块（`.card.flat` + `.marks-view`）→ 问题卡列表（`.issue-item`）。列表可滚动，不压缩行高。
- 历史 tab：`最近 N 条` + 清空 → 卡片列表（原文一行 + 译文一行 + 类型标签 17×17 + 时间 + 引擎 + 删除）。
- 弹窗只有 340px 宽，润色的「并排」视图始终不可用（需要 560px 以上），这是既有约束，不在本次改动范围内。

### 7.4 设置页

- 单列居中，`max-width: 880px`，`padding: 32px 24px 56px`，卡片间距 16。
- 页头 `.opts-head`：左标题（21px）+ 副标题（12.5px）；右侧保存状态胶囊 `.save`（`--ok-soft` 底、勾选图标、tabular-nums）。
- 分区顺序固定：通用 → 划词翻译 → 网页翻译 → 翻译引擎 → AI 服务 → 数据与隐私 → 关于；每个分区标题带 24px 图标座。
- 字段两列 `.grid-2`（间距 `16px 24px`），窄屏退化为单列；字段 = 标签 11.5px + 控件。
- AI 服务卡：头部（名称 + preset 标签 + 删除）→ 名称/模型 → Base URL 全宽 → Key/温度 → 「授权并测试」+ 结果条（成功 `banner ok`、失败 `banner error`）。
- 危险操作只放在「数据与隐私」，用 `.btn.danger`，且保留 `window.confirm`。

### 7.5 页内状态条（pill）

- 右下角固定 16px；`max-width: min(460px, 100vw - 32px)`；高约 40；圆角 14、`--surface` 底、`--shadow-md`。
- 圆点语义：进行中 `--brand`（带 pulse）、完成 `--ok`、失败 `--danger`、已停止 `--text-faint`。
- 按钮 24px 高、11.5px：进行中显示「取消」；有失败显示「重试失败」；有译文显示「还原本页」；始终有 `×`。
- 主题同样走 `data-theme` + `prefers-color-scheme`。

## 8. 主题与深浅色

| 运行环境 | 主题来源 | 实现 |
|---|---|---|
| 弹窗 / 设置页 / 生词本（扩展页面） | `settings.theme`（auto/light/dark） | `applyTheme()` 写 `<html data-theme>`；auto 时移除属性，交给 `prefers-color-scheme` |
| 划词气泡 / 触发图标 / 状态条（页面内 Shadow DOM） | 同上，读取 `settings.theme` | `applyHostTheme()` 写宿主 `data-theme`；`auto` 时移除，样式内 `@media (prefers-color-scheme: dark)` 生效 |
| 网页译文 span | 跟随网页 | 只继承 `color`/`font`/`line-height`，不写死主题色 |

Shadow DOM 的限制：页面里的 `:root` 变量不会自动带进来，所以 `src/content/theme.ts` 的 `CONTENT_THEME_CSS` 在 `:host` 上重新声明了同一套变量。**新增或修改颜色时，`theme.css` 与 `content/theme.ts` 两处必须一起改**，否则气泡与弹窗会不一致。

## 9. 代码映射

| 内容 | 位置 |
|---|---|
| 设计变量、通用组件、荧光笔、开关、卡片 | `src/ui/theme.css` |
| 弹窗尺寸与内部区块 | `src/popup/popup.css` |
| 弹窗头部与 tab 指示器 | `src/popup/App.tsx` |
| 设置条、输入卡、结果卡结构 | `src/app/TranslatePanel.tsx`、`src/app/LangBar.tsx` |
| 分区标题图标 | `src/app/SectionTitle.tsx` |
| 设置页布局与页头 | `src/options/App.tsx`、`src/options/AiProvidersSection.tsx` |
| 气泡（样式字符串） | `src/content/bubble.ts` |
| 触发图标 | `src/content/selection.ts` |
| 页内状态条 | `src/content/page/pill.ts` |
| 页面内共享主题变量 | `src/content/theme.ts` |
| 设计对照板与截图 | `AGENTS/ui-design/`（不提交） |

## 10. 一致性验收清单

改完界面后逐条过：

1. 浅色与深色都看一遍（弹窗、设置页、气泡、状态条各一次）；**展开一次原生下拉列表**，确认弹层与选项文字对比正常。
2. 主色只出现在主操作、品牌标记、选区与激活态；一屏没有两处竞争的主按钮。
3. 圆角只有 10/14/20/26 四档，且内层 = 外层 − 内衬。
4. 间距不出现 5/7/11/13 这类随机值（组件内部紧凑值除外）。
5. 文字对比度：正文 ≥ 4.5:1，大字/图标 ≥ 3:1；深色下主按钮用 `--on-brand` 深字。
6. 动效时长 150–380ms，`prefers-reduced-motion` 下不丢信息。
7. 340px 弹窗内无横向溢出、无按钮文字竖排、结果卡可滚动。
8. 图标全部内联 SVG（`stroke-width: 1.7`），没有 emoji 混排。
9. 新颜色进变量，两处主题文件同步。
10. `pnpm check` 全绿。

## 11. 变更流程

1. 想改外观：先改 `src/ui/theme.css` 的变量或组件样式，**不要**在业务组件里写内联颜色。
2. 需要新的视觉方案时，在 `AGENTS/ui-design/` 用设计板对比，选定后再落到变量。
3. 改了变量或结构：同步本文件对应章节，并在 `docs/design.md` 的「UI/UX」里更新取舍。
4. 用真实 CSS 快速回归：`AGENTS/ui-design/_verify/` 里是渲染弹窗/设置页/气泡/状态条的静态夹具，
   先跑 `node AGENTS/ui-design/_verify/build-bubble-css.mjs` 生成 Shadow DOM 样式，再用 Edge 无头截图对比。

## 12. 已知取舍

- 设计板里的单词卡画了音标与词性，但服务商不返回这两项，插件里单词卡只有「原文 + 译文」；排版沿用 `word-line → 10px → word-def` 的节奏。
- 弹窗检查态的示例文案按「2 个错误 + 1 个警告」标注（`borrow` 不标红），与高亮和计数自洽；v2/v3 设计板用的是 3 错误版本，只影响对照板。
- 本机只有 SimSun 可用作衬线；本版（v1）全站无衬线，不受影响。
- `src/ui/theme.css` 的变量是唯一真源；`src/content/theme.ts` 是 Shadow DOM 的镜像副本，属于有意重复。
