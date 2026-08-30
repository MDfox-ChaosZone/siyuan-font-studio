# 思源 v3.8.2 插件兼容性审查

> 调研日期：2026-08-30  
> 对象：SiYuan Font Studio v0.1.6  
> 基线：插件 `minAppVersion` 为 v3.8.0；上游最新稳定版为 v3.8.2。  
> 口径：仅使用思源官方 GitHub Release、issue、v3.8.2 源码与官方 `siyuan` npm 类型包。

## 结论

**需要做一轮小型兼容性适配，优先处理正文与等宽字体的 CSS 变量。** 思源 v3.8.2 原生支持多正文/等宽字体后，引入了 `--b3-font-family-editor`、`--b3-font-family-editor-code` 和 `--b3-font-weight-editor-code`，并让编辑器选择器直接使用这些变量。插件目前只读写旧的 `--b3-font-family-protyle` 与 `--b3-font-family-code`。当用户也在思源原生设置中配置了字体时，插件的正文或代码字体可能被原生变量抢占；未配置原生字体时，新的变量仍回退到旧变量，所以问题不会在所有用户环境中出现。

除此之外，没有发现会让插件在 v3.8.2 直接无法加载的破坏性变化。Mermaid 升级后，插件依赖的脚本 ID、`window.mermaid.initialize` 和 `ProtyleMethod.mermaidRender` 调用链仍存在；插件生命周期变得更严格且支持异步，需要更新本地类型并改善卸载清理，但现有同步钩子仍能运行。系统字体 API 增加了别名、间距类别和可变字体命名字重，现有解析对新增字段是向前兼容的，不过尚未利用这些数据。

建议优先级：

1. **P1：适配新的编辑器字体 CSS 变量，并补回归测试。**
2. **P2：升级官方 `siyuan` 类型依赖至 1.2.6，移除或同步过时的本地 shim。**
3. **P2：消费系统字体的 `aliases`，改善本地化名称搜索；`spacing` 可用于等宽字体筛选。**
4. **P3：按新生命周期契约让 `uninstall` 返回其清理 Promise，并防止超时后的旧异步任务重新应用样式。**
5. **P3：对 Mermaid 11.16.1 做一次渲染烟雾测试，无需预判式改代码。**

## 上游版本基线

GitHub 的 latest stable Release 是 [SiYuan v3.8.2](https://github.com/siyuan-note/siyuan/releases/tag/v3.8.2)，发布时间为 2026-08-30。插件清单当前声明 `minAppVersion: 3.8.0`，因此本次关注 v3.8.0 到 v3.8.2 的变化，而不是更早的 3.7 系列迁移。

官方 `siyuan` npm 类型包当前版本为 1.2.6；其 [CHANGELOG](https://github.com/siyuan-note/petal/blob/master/CHANGELOG.md) 将 v1.2.6 对应到异步插件生命周期、多编辑器字体配置、编辑器字号 API、Dock 可见性等 v3.8.2 能力。本仓库仍依赖 `siyuan ^1.2.4`，并通过 `tsconfig.json` 将 `siyuan` 映射到自维护的 `src/siyuan-shim.d.ts`，因此官方类型升级不会自动进入编译检查。

## P1：新的正文与等宽字体变量会与当前覆盖冲突

v3.8.2 的官方实现读取 `config.editor.fontFamilies` 和 `codeFontFamilies`，生成：

- `--b3-font-family-editor`
- `--b3-font-family-editor-code`
- `--b3-font-weight-editor-code`

正文选择器在原生字体非空时直接使用 `var(--b3-font-family-editor)`，行内代码直接使用 `var(--b3-font-family-editor-code)`；代码块文本框也已使用 editor-code 变量。参见官方 [v3.8.2 `assets.ts`](https://github.com/siyuan-note/siyuan/blob/v3.8.2/app/src/util/assets.ts#L283-L385) 和 [代码块文本框实现](https://github.com/siyuan-note/siyuan/blob/v3.8.2/app/src/protyle/toolbar/index.ts#L1266-L1266)。这来自 v3.8.2 的“[支持配置多个编辑器字体](https://github.com/siyuan-note/siyuan/issues/16923)”与“[支持配置等宽字体](https://github.com/siyuan-note/siyuan/issues/18968)”。

本插件的 `StyleManager` 当前：

- 只保存/恢复 `--b3-font-family-protyle` 与 `--b3-font-family-code`；
- 正文基线只读取 `--b3-font-family-protyle`；
- 等宽基线只读取 `--b3-font-family-code`；
- 应用设置时也只覆盖这两个旧变量。

具体位置见 [`src/style-manager.ts`](../../src/style-manager.ts)。

因此有两种状态：

| 思源原生字体设置 | 当前插件表现 |
| --- | --- |
| 正文/等宽字体为空 | 新变量回退到旧变量，插件通常继续生效 |
| 正文或等宽字体非空 | 新变量持有独立字体栈，插件只改旧变量，正文/代码可能仍显示思源原生字体 |

建议适配：

- 将三个新变量纳入原值保存与恢复；
- 正文基线优先读取 `--b3-font-family-editor`，空值再回退 `--b3-font-family-protyle`；
- 等宽基线优先读取 `--b3-font-family-editor-code`，空值再回退 `--b3-font-family-code`；
- 插件指定正文/等宽字体时同步覆盖新旧变量；
- 插件指定等宽字重时同步覆盖 `--b3-font-weight-editor-code`；
- 增加“思源原生正文/等宽字体已配置”和“未配置”两组回归测试，覆盖行内代码、代码块和正文。

如果实现保留旧变量回退，`minAppVersion` 可以继续保持 3.8.0，不必仅因这次适配提升到 3.8.2。

## P2：系统字体 API 是增量增强，现有代码可运行但没有完整利用

v3.8.2 的 `/api/system/getSysFonts` 返回结构仍包含插件已使用的 `family`、`weight`、`displayName`，同时新增或稳定提供：

- `aliases`：本地化名称、内部名称等搜索别名；
- `spacing`：`proportional`、`dual`、`monospace`、`character-cell`；
- 可变字体 `fvar` 命名实例会展开为同一 family 下的多个 weight。

证据见官方 [v3.8.2 `Font` 结构与字体解析](https://github.com/siyuan-note/siyuan/blob/v3.8.2/kernel/util/font.go#L62-L74)、[可变字体命名实例解析](https://github.com/siyuan-note/siyuan/blob/v3.8.2/kernel/util/font.go#L199-L274) 以及 [`getSysFonts` 端点](https://github.com/siyuan-note/siyuan/blob/v3.8.2/kernel/api/system.go#L1013-L1020)。相关修复来自 [#18808 系统字体枚举与本地化名称匹配](https://github.com/siyuan-note/siyuan/issues/18808) 和 [#18400 可变字体命名实例](https://github.com/siyuan-note/siyuan/issues/18400)。

本插件 `SystemFont` 只声明前三个字段，JSON 的额外字段不会造成运行时错误；同 family/weight 去重和按 family 分组也能接住命名实例。因此**没有强制迁移**。不过当前 `groupSystemFonts` 的搜索串只包含 family 与 displayName，没有包含 `aliases`，仍可能漏掉另一个语言或 PostScript 名称。建议把 `aliases?: string[]`、`spacing?: string` 加到类型并将 aliases 纳入搜索索引；spacing 则可用于等宽字体菜单的排序或筛选。

## P2/P3：插件生命周期契约变化

v3.8.2 将 `onload`、`onLayoutReady`、`onDataChanged`、`onunload`、`uninstall` 统一为 `Promise<void> | void`，同一插件的生命周期严格串行；禁用、重载、卸载的拆除流程共享 5 秒等待预算。关闭窗口或退出应用不再调用前端卸载钩子。官方设计与兼容影响见 [#18979](https://github.com/siyuan-note/siyuan/issues/18979)，实现类型见 [v3.8.2 Plugin 类](https://github.com/siyuan-note/siyuan/blob/v3.8.2/app/src/plugin/index.ts#L147-L163)。

对本插件的具体影响：

- 当前 `onLayoutReady` 和 `onunload` 是同步函数，仍符合新契约；没有必改项。
- 当前 `uninstall` 使用 `void deletePluginStorage().catch(...)`，对宿主返回 `void`，宿主无法等待真实删除完成。建议直接返回/await 该 Promise，以利用新契约。
- `onload` 会读取并解析所有已存字体。若极端情况下超过拆除预算，官方说明超时 Promise 仍可能继续运行；本插件随后还会 `applySettings()`。建议增加 disposed/generation 标记，使已经卸载的旧实例不会在 Promise 恢复后重新写样式。
- 本地 shim 仍把 `onLayoutReady`、`onunload`、`uninstall` 声明为仅 `void`，已经落后于官方类型，未来会掩盖兼容问题。

## P3：Mermaid 11.16.1 暂未发现接口断裂

v3.8.2 将 Mermaid 从 11.13.0 升级至 11.16.1，目的是修复安全问题，见官方 [#18858](https://github.com/siyuan-note/siyuan/issues/18858)。官方 v3.8.2 渲染代码仍：

- 以 `protyleMermaidScript` 作为脚本 ID；
- 调用 `window.mermaid.initialize(config)`；
- 通过 `Protyle.mermaidRender`/`ProtyleMethod.mermaidRender` 渲染。

参见官方 [v3.8.2 `mermaidRender.ts`](https://github.com/siyuan-note/siyuan/blob/v3.8.2/app/src/protyle/render/mermaidRender.ts#L42-L113)。这些正是插件当前拦截初始化配置、触发重新渲染所依赖的接缝，所以静态检查未发现必须修改之处。

仍建议在 v3.8.2 做烟雾测试：普通 flowchart、sequence、含中文的节点、深浅主题切换、字体/字号动态切换、ZenUML 与 tidy-tree 各一次。这里属于依赖升级后的回归验证，不应在没有失败证据时改写 Mermaid 适配层。

## 其他上游变化

- v3.8.2 改进插件 EventBus 的按需订阅与卸载清理，但目标是保持现有 `on/off/once/emit` 调用方式不变，见官方 [#18762](https://github.com/siyuan-note/siyuan/issues/18762)。本插件当前没有使用 EventBus，不受影响。
- `/api/network/forwardProxy` 的非 UTF-8 原始字节问题在 v3.8.2 开发项中被修正/讨论，见官方 [#18978](https://github.com/siyuan-note/siyuan/issues/18978)。插件只用它下载 GitHub ZIP，响应是二进制且当前路径已有容器校验；建议做一次示例方案下载回归，但未发现请求参数需要迁移。
- v3.8.2 增加 `addTopBar` 的可选 `id` 与 `removeTopBar`。现有调用仍合法；新生命周期已解决重复挂载的宿主问题，不需要为了兼容立即传 id。

## 建议验证矩阵

| 场景 | v3.8.0 | v3.8.2 | 重点 |
| --- | --- | --- | --- |
| 思源原生正文/等宽字体为空 | 必测 | 必测 | 旧变量回退不能退化 |
| 思源原生正文/等宽字体非空 | 可选 | 必测 | 插件设置应明确覆盖原生设置 |
| 系统字体中文名/英文别名搜索 | 必测 | 必测 | aliases 与 displayName |
| 多字重与可变字体命名实例 | 必测 | 必测 | 分组、选择、持久化 |
| 行内代码与代码块分设 | 必测 | 必测 | editor-code 新变量 |
| Mermaid 字体/字号与主题切换 | 抽测 | 必测 | Mermaid 11.16.1 |
| 启用、禁用、重载、卸载 | 抽测 | 必测 | 生命周期串行与清理 |

## 术语

这个过程通常叫 **上游版本兼容性审查**（upstream compatibility review）或 **版本升级影响评估**（upgrade impact assessment）。如果接着修改代码，叫 **兼容性适配**；修改完成后在新旧版本上验证，叫 **回归测试**或更具体的**兼容性回归测试**。本次工作完整表述可以是：“对思源 v3.8.2 做上游版本兼容性审查，并据此进行兼容性适配与回归测试。”
