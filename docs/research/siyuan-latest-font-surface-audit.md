# 思源最新版字体可调面审计

> 调研日期：2026-09-01  
> 上游基线：SiYuan **v3.8.2**（2026-08-30 发布，提交 `44a6c21`）  
> 证据口径：只使用思源官方 GitHub Release 与 `siyuan-note/siyuan` v3.8.2 源码。  
> “可调”指插件或代码片段能稳定改变字体家族、字号或字重；不等于思源设置界面原生暴露了该选项。

## 结论

截至 2026-09-01，GitHub 标记的最新稳定版是 [SiYuan v3.8.2](https://github.com/siyuan-note/siyuan/releases/tag/v3.8.2)。该版本原生增加了多编辑器字体与等宽字体配置；Release 明列“Support configuring multiple editor fonts”和“Support configuring monospace fonts”。

对字体插件而言，最值得作为一级目标暴露的是：

1. **界面字体**：菜单、面板、设置、文档树、搜索结果列表等；以 `--b3-font-family` 为稳定入口。
2. **编辑器正文（连同文档标题和绝大多数数据库内容）**：以思源新变量 `--b3-font-family-editor` 和 `--b3-font-size-editor` 为主。
3. **等宽文字**：行内代码、代码块、行号和代码块编辑框；使用 `--b3-font-family-editor-code` 与 `--b3-font-weight-editor-code`。
4. **关系图标签**：有官方主题变量 `--b3-font-family-graph`，但只有字体家族适合调整。
5. **高级独立项**：标题字重、文档标题字重、键盘按键字体、Emoji、数学公式、Mermaid。它们的实现边界各不相同，不能统称为“正文字体”。

不建议插件尝试统一覆盖 PDF 页面内容、iframe/挂件/HTML 块、ECharts/思维导图画布、PlantUML 图片或 KaTeX 全部字形。这些内容或处于隔离文档/Canvas/图片中，或依赖专用字形，CSS 全局覆盖不稳定且容易破坏布局。

## 四类可调面

### A. 有官方 CSS 变量，适合作为稳定功能

| 可调面 | 官方入口 | 实际覆盖 | 建议 |
| --- | --- | --- | --- |
| 界面字体家族 | `--b3-font-family` | `body`、按钮、输入框、下拉框、文本域及绝大多数继承界面 | 一级功能 |
| 编辑器基础字号 | `--b3-font-size-editor` | 正文、标题的基准字号；标题级别继续使用 `em` 倍率 | 优先服从思源原生设置 |
| 编辑器正文家族 | `--b3-font-family-editor`（回退到 `--b3-font-family-protyle`） | `.protyle-wysiwyg`、非默认 `.b3-typography`、`.protyle-title` | 一级功能；v3.8.2 必须适配新变量 |
| 编辑器正文基础字重 | 由 `fontFamilies[0].weight` 生成选择器规则 | 正文容器及文档标题容器，内部标题/粗体仍有自己的字重 | 一级或高级功能 |
| 编辑器等宽字体 | `--b3-font-family-editor-code`（回退到 `--b3-font-family-code`） | 行内代码、代码块、行号、代码编辑文本框 | 一级功能 |
| 编辑器等宽字重 | `--b3-font-weight-editor-code` | 同上 | 一级功能 |
| 关系图标签家族 | `--b3-font-family-graph` | Canvas 关系图标签 | 高级功能，只调家族 |
| 键盘按键字体 | `--b3-font-family-kbd` | 编辑内容中的 `kbd`、菜单快捷键、搜索提示等 | 高级功能 |
| Emoji 字体 | `--b3-font-family-emoji` | 文档图标、Emoji 面板、部分数据库/菜单 Emoji | 高级、专用字体功能 |
| 数学普通字母字体 | `--b3-font-family-math` | KaTeX 中 `.mathnormal` 部分 | 必须标为“部分生效” |

Daylight 与 Midnight 主题在根作用域共同定义了 `--b3-font-family`、`-protyle`、`-code`、`-graph`、`-emoji`、`-math`、`-kbd` 和 `--b3-font-size`，说明这些是官方主题接缝，而不是依赖偶然 DOM 的私有 hack：见 [Daylight 变量定义](https://github.com/siyuan-note/siyuan/blob/v3.8.2/app/appearance/themes/daylight/theme.css#L27-L34) 与 [Midnight 变量定义](https://github.com/siyuan-note/siyuan/blob/v3.8.2/app/appearance/themes/midnight/theme.css#L26-L33)。

界面根节点和表单控件明确使用 `--b3-font-family`，见 [`_reset.scss` 的 body 与表单规则](https://github.com/siyuan-note/siyuan/blob/v3.8.2/app/src/assets/scss/util/_reset.scss#L21-L36) 以及 [按钮/输入/选择/文本域规则](https://github.com/siyuan-note/siyuan/blob/v3.8.2/app/src/assets/scss/util/_reset.scss#L286-L295)。因此改该变量比罗列文档树、设置面板、菜单等选择器稳定。

v3.8.2 原生配置会把 `editor.fontFamilies`、`codeFontFamilies` 与字号编译成 `--b3-font-family-editor`、`--b3-font-family-editor-code`、`--b3-font-weight-editor-code`、`--b3-font-size-editor`，并对正文、文档标题和行内代码生成规则，见 [官方 `setInlineStyle`](https://github.com/siyuan-note/siyuan/blob/v3.8.2/app/src/util/assets.ts#L282-L385)。对应配置类型包含字体 `family`、`weight`、可变轴及字号，见 [官方配置类型](https://github.com/siyuan-note/siyuan/blob/v3.8.2/app/src/types/config.d.ts#L673-L689)。

代码块 `.hljs` 和行号使用 editor-code 家族与字重变量，见 [`_typography.scss`](https://github.com/siyuan-note/siyuan/blob/v3.8.2/app/src/assets/scss/component/_typography.scss#L505-L514) 和 [行号规则](https://github.com/siyuan-note/siyuan/blob/v3.8.2/app/src/assets/scss/component/_typography.scss#L823-L851)；代码块编辑框也显式使用相同变量，见 [`toolbar/index.ts`](https://github.com/siyuan-note/siyuan/blob/v3.8.2/app/src/protyle/toolbar/index.ts#L1266)。所以“等宽字体”是一个边界完整、非常值得独立调节的目标。

关系图是 Canvas 渲染，但渲染器会读取 `--b3-font-family-graph` 后写入 `context.font`，见 [关系图 `labelRenderer.ts`](https://github.com/siyuan-note/siyuan/blob/v3.8.2/app/src/layout/dock/graph/labelRenderer.ts#L56-L105)。字号由缩放与优先级算法决定，`context.font` 也没有字重项；插件应只提供家族，不应声称能用 CSS 变量调整图标签字号或字重。

### B. 能用选择器覆盖，也有使用价值

#### 1. 正文标题 H1–H6

标题继承编辑器字体家族，但官方固定为 `font-weight: 600`，字号为 `1.75/1.55/1.38/1.25/1.13/1em`。证据见 [标题规则](https://github.com/siyuan-note/siyuan/blob/v3.8.2/app/src/assets/scss/component/_typography.scss#L259-L311)。

这意味着：

- 调正文家族会自然覆盖标题，无需单独功能；
- **标题字重**值得作为高级覆盖项，尤其当所选正文字体缺少 600 时；
- 不建议默认重写六级字号比例，会牵动折叠、编号测量、文档导出与既有主题排版；
- 若提供标题字重，应保持 H1–H6 共用一档，并预留“跟随思源 600”。

#### 2. 文档标题

`.protyle-title` 继承编辑器家族和基准字号；实际输入标题 `.protyle-title__input` 为 `2em`、`bold`，见 [`_protyle.scss`](https://github.com/siyuan-note/siyuan/blob/v3.8.2/app/src/assets/scss/protyle/_protyle.scss#L683-L688) 与 [标题输入规则](https://github.com/siyuan-note/siyuan/blob/v3.8.2/app/src/assets/scss/protyle/_protyle.scss#L722-L742)。

单独调家族通常没有价值（应随正文），但“文档标题字重”有价值：缺少 700 的字体可能发生合成粗体。插件可允许跟随、600、700，但要避免把标题降到与正文同级。

#### 3. 块引用、Callout、粗体、斜体与上下标

这些都继承正文家族。块引用只改颜色/背景/边线，没有自己的字体；Callout 标题为 500/114%，普通粗体为 `bold`，斜体为 `italic`，上下标为正文的 75%。见 [块引用规则](https://github.com/siyuan-note/siyuan/blob/v3.8.2/app/src/assets/scss/component/_typography.scss#L128-L150)、[Callout 标题](https://github.com/siyuan-note/siyuan/blob/v3.8.2/app/src/assets/scss/component/_typography.scss#L228-L256) 和 [行级语义样式](https://github.com/siyuan-note/siyuan/blob/v3.8.2/app/src/assets/scss/component/_typography.scss#L37-L70)。

因此它们**不是独立字体家族目标**。可以让正文设置自然覆盖；不应统一强制相同字重，否则会抹掉强调层级。更重要的是提示用户：所选字体最好包含 italic、500/600/700，否则 Chromium 可能合成。

#### 4. 数据库（属性视图）

编辑器内表格、画廊、看板和数据库单元格位于 `.protyle-wysiwyg` 中，字体家族自然继承正文；其内部大量字号采用 `inherit`、`1em`、`85%`、`87.5%`，并对表头等设置独立字重。官方数据库样式可见 [`_av.scss`](https://github.com/siyuan-note/siyuan/blob/v3.8.2/app/src/assets/scss/business/_av.scss)。数据库列宽测量会读取单元格计算样式，把 font style/weight/size/family 传给 Canvas，见 [`columnWidth.ts`](https://github.com/siyuan-note/siyuan/blob/v3.8.2/app/src/protyle/render/av/columnWidth.ts#L18-L25)。

结论：

- **数据库内容应跟随正文字体**，无需默认独立家族；
- 如提供“紧凑数据库字号”，必须在修改后触发/验证列宽重算；
- 数据库弹窗、筛选器等浮层可能移到 `body` 下，因而跟随界面字体，而非正文字体；这是正确的“内容/控件”边界。

#### 5. 搜索结果与搜索预览

搜索结果列表、输入框和筛选控件是界面元素，跟随 `--b3-font-family`；右侧 `.search__preview` 承载 Protyle 内容，因此预览正文跟随编辑器字体。搜索样式明确区分 `.search__list` 与 `.search__preview`，见 [`_search.scss`](https://github.com/siyuan-note/siyuan/blob/v3.8.2/app/src/assets/scss/business/_search.scss#L4-L140)。

这两个区域不应做成第三套“搜索字体”：列表归界面，预览归正文，才能与其他位置一致。

### C. 只能部分调节，需明确限制

#### 数学公式（KaTeX）

官方变量 `--b3-font-family-math` 只应用到 `.katex .mathnormal`，见 [KaTeX 规则](https://github.com/siyuan-note/siyuan/blob/v3.8.2/app/src/assets/scss/component/_typography.scss#L557-L566)。KaTeX 的运算符、符号、扩展字形等仍依赖 KaTeX 自带专用字体和类。

因此插件可以叫“数学普通字母字体”，不能叫“公式字体”。不建议覆盖 `.katex *`：普通文本字体通常缺少数学字形、基线和尺寸参数，会造成上下标、根号、分数线和定界符错位。字重也不应全局强制。

#### Emoji

思源有专用 `--b3-font-family-emoji`，文档图标和 Emoji 面板明确使用它，见 [文档图标规则](https://github.com/siyuan-note/siyuan/blob/v3.8.2/app/src/assets/scss/protyle/_protyle.scss#L628-L647) 与 [Emoji 面板规则](https://github.com/siyuan-note/siyuan/blob/v3.8.2/app/src/assets/scss/business/_emojis.scss#L46-L57)。但思源还按平台动态注册 `Emojis Additional`、`Emojis Reset` 和 `Emojis`，并用 `unicode-range`、`size-adjust` 修复各平台缺字与尺寸，见 [`assets.ts`](https://github.com/siyuan-note/siyuan/blob/v3.8.2/app/src/util/assets.ts#L297-L372)。

所以 Emoji 只适合高级用户选择**真正的彩色 Emoji 字体**；不要让普通正文字体覆盖该变量，也不要对它套用正文 `font-weight`。否则可能退化为黑白符号、缺字方框或尺寸不一致。

#### 全局界面字号与字重

主题有 `--b3-font-size: 14px`，但它只被菜单、对话框、Snackbar 和部分 Agent UI 等组件消费；桌面主容器另有固定 `14px`，许多组件也直接使用固定 px。见 [主题变量](https://github.com/siyuan-note/siyuan/blob/v3.8.2/app/appearance/themes/daylight/theme.css#L34) 和 [`body > .fn__flex-1` 固定字号](https://github.com/siyuan-note/siyuan/blob/v3.8.2/app/src/assets/scss/util/_reset.scss#L34-L37)。

界面字重同样没有统一变量；在 `body` 上设置只影响可继承且未声明自身字重的文本。因此：

- `--b3-font-size` 可作为实验性“组件字号”，不能宣称是完整界面缩放；
- 界面字体家族稳定，界面字号和字重只能算部分覆盖；
- 不应使用 `* { font-size/font-weight: ... !important }`，这会破坏标题、提示、角标、按钮和可访问性层级。

#### Mermaid

v3.8.2 将 Mermaid 初始化配置中的 `fontFamily` 和 `altFontFamily` 都硬编码为 `sans-serif`，见 [`mermaidRender.ts`](https://github.com/siyuan-note/siyuan/blob/v3.8.2/app/src/protyle/render/mermaidRender.ts#L42-L81)。生成物是 SVG，部分图使用 SVG `text`，部分通过 `foreignObject` 生成 HTML 标签。

可行方案按稳定性排序：

1. 在 Mermaid 初始化/重渲染流程中改配置；
2. 渲染后同时覆盖 SVG `text` 和 `foreignObject` 内容；
3. 只改外层正文变量——通常无效，因为 Mermaid 已指定 `sans-serif`。

它值得成为“图表字体（实验性）”，但不是普通 CSS 变量功能。修改后必须重新渲染已有图，并测试 flowchart、sequence、mindmap/ZenUML、深浅主题和导出。

#### 导出 PDF / HTML / Word / 图片

思源的导出 HTML 会加载主题，注入 `setInlineStyle(false)`、插件样式和代码片段，然后用 `.protyle-wysiwyg`/`.b3-typography` 渲染正文；还会重新运行 KaTeX、Mermaid、ECharts 等渲染器。见 [导出 HTML 模板](https://github.com/siyuan-note/siyuan/blob/v3.8.2/app/src/protyle/export/index.ts#L1026-L1081)。PDF 预览窗口本身也以 `--b3-font-family` 为 UI 字体，见 [PDF 预览模板](https://github.com/siyuan-note/siyuan/blob/v3.8.2/app/src/protyle/export/index.ts#L197-L245)。

结论：

- 思源原生正文/代码设置会通过 `setInlineStyle(false)` 进入导出；打包在插件清单中的静态 CSS 会通过 `getPluginStyle()` 进入导出，但当前页面临时插入的 `<style>` 和根元素 inline 变量**不会因此自动复制**；
- 本插件目前用动态 `<style id="siyuan-font-studio-overrides">` 和 `documentElement.style` 应用设置，不能假设这些设置已进入导出窗口，需单独验证并大概率补导出适配；
- 字体文件还必须在导出页面中可访问并正确嵌入/加载，否则只保存 family 名不够；
- Mermaid、图表、iframe 等仍遵循各自渲染边界；
- “当前打开的 PDF 文件页面”与“把思源文档导出为 PDF”是两回事。

### D. 不建议或不能由全局 CSS 覆盖

| 元素 | 原因 | 正确处理 |
| --- | --- | --- |
| PDF 阅读器中的 PDF 页面文字 | PDF.js 用 PDF 内嵌字体绘制 Canvas/TextLayer；替换 CSS 字体会破坏选择层与画布对齐，且不会改变真实页面 | 只让阅读器工具栏跟随界面字体；不要改页面文字 |
| ECharts 代码块 | 用户传入的 ECharts option 决定字体，最终多为 Canvas 绘制 | 让用户在图表 option 的 `textStyle`/各组件设置；插件不强制 |
| 内置思维导图 | ECharts Canvas 渲染，字体随生成 option/库默认值，不是正文 DOM | 如要支持，需改渲染配置并重绘，列为独立实验项 |
| Graphviz / Flowchart SVG | 字体信息由渲染器写进 SVG；不同语法和输出结构不统一 | 只做渲染器级配置，不做全局选择器承诺 |
| PlantUML | 可能是服务返回的 SVG/位图，字体已在服务端渲染 | 在 PlantUML 源码/服务器配置中设字体 |
| ABC 乐谱 | 音符与标记依赖专用绘制/字形 | 不与正文或 Emoji 字体合并 |
| iframe、挂件、HTML 块 | 独立文档/隔离上下文，宿主 CSS 不能可靠穿透 | 由内容自身 CSS 控制；同源场景也应显式 opt-in |
| SVG 图标 | 思源界面主要用 SVG，不是字体图标 | 不应用字体设置 |

图表的官方渲染路径可以直接验证上述边界：ECharts 从块内容求值 option 后调用 `echarts.init(...).setOption(option)`，见 [`chartRender.ts`](https://github.com/siyuan-note/siyuan/blob/v3.8.2/app/src/protyle/render/chartRender.ts#L8-L51)；内置思维导图也调用 ECharts 初始化与 `setOption`，见 [`mindmapRender.ts`](https://github.com/siyuan-note/siyuan/blob/v3.8.2/app/src/protyle/render/mindmapRender.ts#L6-L82)。

PDF 阅读器样式只处理页面 Canvas、TextLayer、选择与标注层，没有面向 PDF 页面字族的思源变量；见 [官方 PDF 样式](https://github.com/siyuan-note/siyuan/blob/v3.8.2/app/src/assets/scss/pdf/_pdf.scss#L176-L229)。这也说明替换 PDF 页面字体不属于字体插件的合理作用域。

## 当前插件 7 类目标的覆盖评价

当前源码定义了 `ui | content | mono | graph | emoji | math | mermaid` 七个目标，见 [`src/types.ts`](../../src/types.ts)。对照 v3.8.2 后评价如下：

| 当前目标 | 上游适配度 | 评价与下一步 |
| --- | --- | --- |
| `ui` 界面 | 家族：高；字重/字号：部分 | 已覆盖 `--b3-font-family`，方向正确。`body {font-weight}` 不会覆盖局部 500/600/bold；`--b3-font-size` 加一组选择器仍无法囊括大量固定字号。UI 家族保留一级，weight 标“基础/合成字重”，size 标“实验性组件字号”。 |
| `content` 正文 | 高 | 已同时写入旧 `--b3-font-family-protyle` 和 v3.8.2 新 `--b3-font-family-editor`，并覆盖 editor size；正文父级 weight 仍不会改变 H1–H6 的 600、文档标题 bold、strong bold。适合作为一级功能，可另增标题层级 weight。 |
| `mono` 等宽 | 很高 | 已同步新旧 code 变量与 `--b3-font-weight-editor-code`，还能分离行内代码/代码块，并覆盖行号和编辑框。是边界最完整的一级功能。需重点测试 CJK fallback、等宽性、导出。 |
| `graph` 关系图 | 高 | 已写官方 `--b3-font-family-graph`，与 Canvas 渲染器一致。不提供 size 正好符合上游边界；变更后需确认关系图触发重绘。 |
| `emoji` | 中/高级 | 已写官方 Emoji 变量并用 unicode-range 限制系统别名，思路比直接全局换字体安全；但导入 Emoji 字体、平台 `size-adjust`、彩色格式与缺字回退差异大。保持高级项，不提供 weight/size。 |
| `math` | 部分、实验 | 当前不仅写 `--b3-font-family-math`，还对一组 KaTeX glyph 选择器强制 family，并支持行内/块公式分离。这比上游官方 `.mathnormal` 范围更广，也更容易造成数学字形与基线问题。应在 UI 明示“部分公式/实验性”，保留 KaTeX 回退并补复杂公式测试。 |
| `mermaid` | 可用但脆弱 | 当前在 Mermaid 初始化配置层合并 family/size，技术路线正确，优于单纯 CSS；但依赖拦截和重渲染，受 Mermaid 升级与多类 SVG/foreignObject 输出影响。保持高级实验项，不能承诺覆盖 ECharts/Graphviz/PlantUML。 |

当前最明显的**遗漏**是 `kbd`：上游已有 `--b3-font-family-kbd`，实现成本低，可新增高级目标，或明确让它跟随正文/界面。其次是导出接缝：七类运行时设置使用动态根变量和动态 `<style>`，而官方 `getPluginStyle()` 只拼接 `/api/petal/loadPetals` 返回的打包 CSS，见 [导出 `getPluginStyle`](https://github.com/siyuan-note/siyuan/blob/v3.8.2/app/src/protyle/export/index.ts#L18-L26)，所以必须验证/补齐导出窗口中的设置与 `@font-face`。

其他图表不是“遗漏一个变量”那么简单：ECharts、思维导图、Graphviz、Flowchart、PlantUML、ABC 需要各自渲染器适配。建议在产品说明中明确不属于 Mermaid 目标，不要让用户误以为“图表字体”七类全覆盖。

## 推荐的插件产品分层

### 默认展示

- **界面**：family；可选基础 weight，并注明仅影响继承文本。
- **正文**：family + 首选真实 weight；自然覆盖段落、列表、表格、块引用、Callout、数据库内容、反链/搜索预览等 Protyle 内容。
- **等宽**：family + weight；覆盖行内代码、代码块、行号和代码编辑框。
- **编辑器字号**：优先调用/同步思源原生字号，而不是另建冲突状态。

### 高级设置

- H1–H6 共用字重。
- 文档标题字重。
- 关系图标签 family。
- `kbd` family。
- Emoji family（仅专用 Emoji 字体）。
- 数学 `.mathnormal` family（明确“部分公式”）。
- Mermaid family/size（实验性，需要重渲染）。

### 不提供

- 强改 PDF 页面文字。
- 对 KaTeX、SVG、Canvas、iframe 使用全局 `*` 覆盖。
- 把数据库、搜索预览、块引用再拆成独立字体家族；它们已有清晰的界面/正文继承归属。
- 用统一字重抹平正文、标题、粗体、Callout 标题和按钮的语义层级。

## 建议验证矩阵

每次改变正文或代码字体后，至少检查：

- 编辑器正文、文档标题、H1–H6、粗体/斜体、上下标；
- 行内代码、代码块、行号、代码块编辑态；
- 表格、块引用、Callout、列表、数据库表格/画廊/看板；
- 搜索结果列表与右侧预览、反链/提及预览；
- 关系图标签、Emoji、KaTeX 普通字母与数学符号混排；
- Mermaid SVG/HTML 标签、ECharts、思维导图；
- 导出 PDF、HTML、Word、图片；
- 12–16px 中文小字号、125%/150% Windows 缩放、深浅主题；
- 字体缺少 500/600/700/italic 时的回退或合成效果。

最终边界可以概括为：**DOM 继承文字优先走官方变量；语义标题用窄选择器；Canvas/SVG/图片/iframe 必须在各自渲染器内处理；专用字形（数学、Emoji）不可与普通正文一刀切。**
