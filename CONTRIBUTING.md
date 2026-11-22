# 贡献指南（Contributing to 羽译）

羽译是一个范围克制的 Chromium MV3 扩展：把翻译、语法检查、润色、生词学习串成一条线；四个运行环境、无后端、运行时依赖只有 4 个。本文件是**人和机器的贡献入口**——环境、门禁、PR 流程、验收与发布都在这里。

操作事实与架构不变量不在本文件重复：命令、加载调试、目录、关键设计、已知陷阱与完整验证清单都在 [AGENTS.md](AGENTS.md)（会话自动加载给 AI 的机器手册），本文件按节链接过去。分工一句话：**照 AGENTS.md 写代码，照本文件把改动合进来。**

## 0. 先读什么

| 你想…… | 先读 |
|---|---|
| 安装、使用、配置服务 | [README.md](README.md) |
| 命令、目录、关键设计、陷阱、完整验证清单（机器手册） | [AGENTS.md](AGENTS.md) |
| 理解扩展怎么跑起来（四个运行环境） | [docs/guide/00-扩展是怎么跑的.md](docs/guide/00-扩展是怎么跑的.md) |
| 找某个功能在哪个文件 | [docs/guide/02-代码地图与数据流.md](docs/guide/02-代码地图与数据流.md) |
| 接新的翻译 / 词典服务商 | [docs/providers.md](docs/providers.md) |
| 改界面、加组件、调主题 | [docs/ui-design.md](docs/ui-design.md)（第 10 节是一致性验收清单） |
| 报错对不上号 | [docs/guide/03-常见错误对照.md](docs/guide/03-常见错误对照.md) |
| 看设计取舍与里程碑状态 | [docs/design.md](docs/design.md) |
| 维护规则本身 | [docs/README.md](docs/README.md) |

## 1. 环境

- Node.js >= 22.12，用 pnpm（仓库有 `pnpm-lock.yaml`）。
- Chromium >= 114；维护者在 Edge 157 上验收，Chrome 可直接复用，Firefox / Safari 未适配。
- 不需要后端：扩展只调用你自己配置的服务商（含免 Key 的免费通道）。
- 本机 PowerShell 5.1 读写 UTF-8 中文文件默认走 GBK，会乱码甚至损坏：改 `.md` / `.ts` 用编辑器或 Node，不要用 `Get-Content -Raw` + `Set-Content` 整篇重写（更多实测见 AGENTS.md 第 9 节）。

## 2. 本地跑起来

```powershell
pnpm install
pnpm build
```

装载、刷新与 Service Worker 日志的完整步骤在 [AGENTS.md](AGENTS.md) 第 4 节；更细的调试流程见 [docs/guide/01-加载与调试.md](docs/guide/01-加载与调试.md)。加载目录选项目根下的 `dist/`，不是项目根目录。

## 3. 提交前的门禁

一条命令：

```powershell
pnpm check
```

它等于 `tsc --noEmit` → `vitest run` → 三次 Vite 构建 → `dist/` 产物自检 → 文档路径与链接检查。任何一项失败都不要提 PR。纯逻辑改动（解析、缓存键、消息协议、SM-2 排程、快捷键、错误映射等）必须带单测。联网测试默认跳过；完整玩法（`--use-system-ca`、`YUYI_LIVE=1`）见 AGENTS.md 第 3 节。不要提交 `dist/`、`release/`、`node_modules/`、任何密钥；截图与测试一律用假值。仓库暂未配置 CI，合入前由维护者本地跑 `pnpm check`——欢迎帮忙接 CI（见第 6 节）。

## 4. 改代码前的硬约束

完整清单与原因见 AGENTS.md 第 6、7 节；动手前记住这几条：

- strict TypeScript，不允许 `any`、`@ts-ignore`；`noUnusedLocals` / `noUnusedParameters` 全开。
- 跨模块通信只走 `src/core/messaging.ts` 的类型化协议；错误码与错误文案集中在 `src/core/errors.ts`。
- 运行时依赖只有 `react`、`react-dom`、`zod`、`diff`。新增依赖先证明「现有依赖 + 浏览器 API 做不到」，并在 PR 说明理由；不引入 UI 库、状态库、Tailwind。
- content 侧有体积红线：不引 React、不引 `src/core/providers/registry.ts`（会把适配器一起拖进去）；产物必须是 IIFE。主题变量在 `src/ui/theme.css` 与 `src/content/theme.ts` 两处同步。
- MV3 约束：content script 不能跨域 fetch（联网走 SW 的 Port）；SW 约 30 秒空闲会被回收，状态要落 `chrome.storage`。
- 代码内不写注释（用命名与文档表达意图）；界面文案中文直接写在组件里。

## 5. 改这块之前先读

| 你要改 | 先读 |
|---|---|
| 新服务商（MT / AI / 词典） | `docs/providers.md` |
| 弹窗 / 设置页 / 生词本界面 | `docs/ui-design.md` |
| 划词 / 网页翻译 | `docs/guide/00-扩展是怎么跑的.md`、`docs/guide/02-代码地图与数据流.md`、`docs/design.md` |
| 消息协议 / 设置字段 / 缓存键 / 快捷键 / 构建脚本 | AGENTS.md 第 6 节的对应链路 |

需要同步哪些文档由 [docs/README.md](docs/README.md) 的「改了什么 → 同步哪份」决定，本文件不再重复那张表。

## 6. 提交与 PR

- 一个 PR 只做一件事。提交信息格式 `<type>: <中文摘要>`，type 参考历史：`feat` / `fix` / `style` / `docs`。
- PR 描述写三段：**改了什么**（文件级）、**怎么验证的**（命令 + 手工路径或截图）、**没做 / 风险**。
- 文档和代码在同一次改动里完成，不允许「下次补文档」。
- 以下改动请先开 Issue 讨论，避免白做：大规模重构或文件重排、换技术栈 / 构建工具、新增运行时依赖、大改视觉或交互语义。单维护者项目里，范围克制是特性不是缺点。
- 想找切入点：CI、主题一致性测试、UI / 编排层测试补盲区是低风险高价值方向；大重构先讨论。

## 7. 人工验收（最低集）

没有自动化 E2E；合 PR 前在 Edge 上过一遍。完整清单（含边界场景与已知陷阱）是 AGENTS.md 第 10 节，AI 贡献按那里跑，人工只需这遍：

- 弹窗：英文 → 中文、中文 → 英文（默认目标语言「智能」）；输入单词出词典卡；复制 / 收藏 / 清空；「历史」切回「翻译」后焦点回到输入框。
- 划词：普通页面、输入框、contenteditable、Shadow DOM（如 B 站新版评论）、iframe 里都能出图标并翻译；勾两个引擎出两张结果卡；选中隐藏内容时先出守卫态。
- 网页翻译：翻译本页 → 双语 / 仅译文切换（不重新请求）→ 还原；取消与「重试失败」可用。
- 设置页：主题、目标语言生效；快捷键录制与冲突报错；服务添加 / 测试 / 删除。
- 生词本：收藏 → 复习四种评分 → 导入 / 导出。
- 深浅色各过一遍弹窗、划词气泡、页内状态条、设置页。

## 8. 发布（维护者）

1. 同步升级 `package.json` 与 `public/manifest.json` 里的版本号（两处必须一致）。
2. `pnpm check` 全绿。
3. `pnpm package` → 生成 `release/yuyi-<版本>.zip`；解压后用「加载解压缩的扩展」再跑一遍第 7 节。
4. 打 tag `v<版本>`，在 GitHub Release 附上 zip（同时给出 sha256）。

## 9. 许可与沟通

- 项目以 Apache-2.0 发布，完整条款见 [LICENSE](LICENSE)。提交 PR 即表示同意你的贡献按同一许可分发，无需 CLA。
- 讨论以中文为主；对事不对人，不人身攻击、不歧视、不骚扰。
- 安全漏洞不要公开贴出可复制利用的细节；先通过 GitHub 仓库所有者（@IsNotChangchengY）私下联系。
- AI 辅助写代码可以，但你要理解并能解释改动、通过同样的门禁；不允许「让 AI 自动加依赖 / 改架构」。
