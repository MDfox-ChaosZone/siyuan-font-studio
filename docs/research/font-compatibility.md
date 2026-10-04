# 字体设置与最低思源版本

审计日期：2026-10-04。上游源码：`siyuan-note/siyuan`，当前提交 `40ea44d6cc`；历史版本使用对应 Git 标签核对。

## 安装门槛与功能门槛

`plugin.json` 的 `minAppVersion` 为 **3.8.0**，作为插件的最低支持版本。关系图字体从该版本开始生效；思维导图字体仍要求 v3.8.5 及以上，在 v3.8.0–v3.8.4 上跳过，不影响其他设置。

历史 API 审计显示，v2.9.0 已正式提供插件系统、`Plugin`、`Setting`、`Dialog`、`Menu`、`confirm`、`showMessage` 及插件存储接口。下表保留各接口的历史起点作为依据，不表示插件支持安装到 v3.8.0 之前的版本。

本插件只使用当前字体实现以及仍被消费的共享 CSS 变量。不存在旧脑图 ECharts 适配、旧关系图 Sigma 适配、旧系统字体字符串列表转换，也不为旧正文布局追加专用规则。缺少高版本接口时跳过操作，保留设置和其他功能。

## 各字体项目

| 项目 | 版本依据与边界 | 当前处理 |
| --- | --- | --- |
| 界面 | v2.9.0 已有 `--b3-font-family`，基础 DOM 和控件字体样式可用 | 共享变量与控件选择器；字号、字重仍只覆盖相应继承文本与组件 |
| 文档字体 | `--b3-font-family-protyle` 从 v2.10.13 起提供；v3.8.2 起有 `--b3-font-family-editor` 和编辑器多字体配置 | 写入当前使用的共享变量；较旧原生字体配置或主题可能优先，只能部分生效 |
| 文档字号 | `--b3-font-size-editor` 从 v3.1.21 起由正文和标题容器消费 | 只写变量；更早版本的固定正文样式不另做适配 |
| H1–H6 | v2.9.0 已有 `NodeHeading`、`data-subtype` 和对应标题结构；家族回退使用正文变量 | 使用现有窄选择器；家族受正文变量可用性影响，字重和字号按实际结构生效 |
| 代码 | v2.9.0 已有 `--b3-font-family-code`、`.hljs` 与行内代码结构；v3.8.2 提供新的 editor-code 变量 | 共享代码变量及现有选择器；不为旧渲染器增加分支 |
| 公式 | v2.9.0 已有 KaTeX、`--b3-font-family-math` 与行内/块公式结构 | 现有安全字形选择器；部分字形仍由 KaTeX 专用字体决定 |
| Emoji | v2.9.0 已有 `--b3-font-family-emoji` | 现有 Emoji 变量和受 Unicode 范围限制的字体；图片 Emoji 不属于字体替换 |
| Mermaid | v2.9.0 渲染流程已有 `mermaid.initialize` 和 `protyleMermaidScript`；公开 `ProtyleMethod.mermaidRender` 从 v3.5.1 起提供 | 同一初始化 hook；有公开重绘方法才主动重绘，缺少方法时不移除 `data-render`，待下一次渲染生效 |
| 关系图 | 新 Canvas 标签渲染器从 v3.8.0 起提供 | v3.8.0 起设置图字体变量、Canvas 字重并请求重绘；更早版本完全跳过，避免共享 graph 变量影响旧 Sigma 图 |
| 思维导图 | v3.8.5 正式版开始使用 DOM 列表脑图；v3.8.6 增加独立脑图块类型 | v3.8.5 起只针对 `.mindmap-view` 节点应用样式；公开脑图入口存在时请求布局刷新；不访问 ECharts |
| 系统字体列表 | v3.6.5 起返回 `{family, weight, displayName}` 对象；更早接口返回字符串列表 | 仅接受结构化字体对象；旧列表安全忽略，可继续导入字体、使用已有方案 |
| 导入字体与方案 | v2.9.0 已有文件读写接口与 `Plugin.loadData/saveData`；桌面 Electron 25 / Chromium 114 已支持所需浏览器功能 | 缺少 `appId` 时不发送 multipart 的 `app` 字段；状态及方案结构不按思源版本转换 |

## 主要证据

- [v2.9.0 发布说明](https://github.com/siyuan-note/siyuan/releases/tag/v2.9.0)：正式提供插件系统。该标签下的 `app/src/plugin/API.ts`、`index.ts` 和 `Setting.ts` 包含必要接口；`kernel/api/file.go` 接受文件及目录读写，尚不要求 `appId`。
- [`633f9af058`](https://github.com/siyuan-note/siyuan/commit/633f9af058)：正文家族变量；首个包含它的正式标签为 v2.10.13。
- [`698698eec1`](https://github.com/siyuan-note/siyuan/commit/698698eec1)：编辑器字号变量相关样式；核对 v3.1.21 的 `_typography.scss`、`_protyle.scss` 和 `assets.ts` 确认消费关系。
- [`bfe9f5cf72`](https://github.com/siyuan-note/siyuan/commit/bfe9f5cf72)：结构化系统字体接口；首个包含它的正式标签为 v3.6.5。
- [v3.8.0 `labelRenderer.ts`](https://github.com/siyuan-note/siyuan/blob/v3.8.0/app/src/layout/dock/graph/labelRenderer.ts)：新 Canvas 关系图标签。
- [v3.8.5 发布说明](https://github.com/siyuan-note/siyuan/releases/tag/v3.8.5)和该标签的 `mindmapRender.ts`：列表脑图及公开入口迁移。
- [v3.8.6 发布说明](https://github.com/siyuan-note/siyuan/releases/tag/v3.8.6)：独立脑图块及脑图项块。

## 验证边界

版本门槛来自官方历史源码与标签。自动测试覆盖旧系统字体响应、缺失版本信息，以及 2.9.0、3.7.9、3.8.0、3.8.4、3.8.5、3.8.6 下的字体规则降级。

历史基础 API 浏览器模拟通过 12 项检查：加载、设置界面、旧系统字体列表安全忽略、高版本设置保留、核心字体应用、旧关系图与旧脑图不变、Mermaid 标记保留、缺少 appId 时导入并加载字体、代码字体与字号、保存、卸载恢复。本机 v3.8.6 使用原生 `ProtyleMethod.mindmapRender` 渲染临时只读列表脑图，验证 Arial/700/24px 的实际计算样式、恢复 16px 默认字号后节点尺寸和位置重算、连线 Canvas 重绘及源列表保留；没有向工作空间写入测试文档。

并未实际安装运行每一个历史版本客户端。主题、第三方样式、图表类型和导出窗口仍可能影响字体结果。
