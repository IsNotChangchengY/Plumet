# 羽译（Plumet）

一个把「翻译 → 语法检查 → 润色 → 复习」串成一条线的浏览器翻译扩展。AI 负责语境与表达，传统机器翻译负责快与便宜。

![羽译图标](assets/icon-master.png)

## 现在能做什么（v0.1.0 / M1）

- 点工具栏图标打开**侧边栏翻译面板**，输入或粘贴文本翻译，AI 流式输出，免费通道兜底
- 引擎可选：OpenAI 兼容的 AI 服务（DeepSeek / 硅基流动 / OpenAI / 本地 Ollama…）+ 谷歌免费通道 + MyMemory
- 翻译历史（可回看、删除、清空）、译文缓存（7 天，少花钱）
- 设置页（新标签页）：主题、默认语言、四条链路的引擎、AI 服务增删改、授权并测试、数据清理

## 接下来

| 里程碑 | 内容 | 状态 |
|---|---|---|
| M2 | 语法检查与润色：红黄荧光笔标问题、绿底给修改，支持自定义润色方向（如「更诗意」） | 待做 |
| M3 | 划词翻译：气泡、带上下文理解、词典卡、快捷键 | 待做 |
| M4 | 网页翻译：双语对照 / 仅译文、动态内容、站点规则、进度与取消 | 待做 |
| M5 | 生词本 + 间隔重复复习 + 统计 + 打包 | 待做 |

## 快速开始

```powershell
pnpm install
pnpm build
```

Edge → `edge://extensions` → 打开「开发人员模式」→「加载解压缩的扩展」→ 选择 `dist` 目录 → 点工具栏「羽」图标。

详细步骤与排错见 `docs/guide/01-加载与调试.md`、`docs/guide/03-常见错误对照.md`。

## 脚本

| 命令 | 作用 |
|---|---|
| `pnpm dev` | 监听并自动重建 `dist/`（改完仍需在扩展页点刷新） |
| `pnpm build` | 构建到 `dist/` |
| `pnpm typecheck` | 类型检查 |
| `pnpm test` | 单元测试（29 个） |
| `pnpm verify` | 检查 `dist` 与 manifest 引用是否完整 |
| `pnpm check` | 类型 + 单测 + 构建 + verify，一次做完 |

真实网络冒烟测试（可选）：

```powershell
$env:NODE_OPTIONS='--use-system-ca'
$env:YUYI_LIVE='1'
pnpm vitest run tests/live.test.ts
```

## 技术栈

TypeScript 5.9 + Vite 8 + React 19 + 纯 CSS（设计变量）。运行时依赖只有 `react`、`react-dom`、`zod`、`diff`。
MV3 架构：Service Worker 负责联网，Content Script 负责页面 DOM，扩展页面负责界面。

## 目录

```
src/background/   Service Worker：联网、菜单、快捷键、任务
src/content/      Content Script：划词与网页翻译（M3/M4）
src/sidepanel/    侧边栏面板
src/options/      设置页
src/learning/     生词本（M5）
src/app/          共享 React 组件
src/core/         引擎、服务商、缓存、语言、消息协议
src/storage/      chrome.storage 封装
docs/             设计大纲、服务商规范、新手四篇
```

更细的代码地图见 `docs/guide/02-代码地图与数据流.md`，设计取舍见 `docs/design.md`。

## 隐私

翻译内容只会发送到**你自己选择的服务商**。API Key 保存在本机浏览器的 `chrome.storage.local`，不同步、不写日志、不收集任何遥测。设置页提供一键清空缓存、历史与全部配置。

## 开发说明

工程约定写在 `AGENTS.md`（该文件与本仓库的版本库分开管理）。界面语言目前只有中文。
