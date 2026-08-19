# 思源字体工坊

为[思源笔记](https://github.com/siyuan-note/siyuan)导入本地字体，并针对不同使用场景分别配置字体、回退顺序和字号。

[English](README.md)

## 功能

- 批量导入 WOFF2、WOFF、TTF 和 OTF 字体
- 预览、重命名、删除、校验字体，并自动跳过重复文件
- 使用已导入字体、操作系统字体或思源默认字体
- 为每个场景建立可排序的字体回退栈
- 分别配置界面、正文、行内代码和代码块字体及字号
- 配置数学公式、关系图、Mermaid 和 Emoji 字体
- 为行内/块级代码及行级/块级公式分别设置字体
- 新建、重命名、切换、导入和导出字体方案
- 设置即时生效，并在重启或切换主题后自动恢复

## 使用方法

安装并启用插件后，点击思源顶部工具栏中的字体图标，或在命令面板中执行“打开思源字体工坊”。先将字体导入字体库，再按优先顺序将它们分配给需要的使用场景。

推荐使用体积通常更小的 WOFF2 字体。已有 TTF/OTF 字体可以通过 [CloudConvert](https://cloudconvert.com/ttf-to-woff2) 在线转换，或使用本人项目 [FontConvert](https://github.com/MDfox-ChaosZone/Font-Converter) 转换。

为兼容早期开发版本，已导入字体继续保存在 `data/storage/petal/siyuan-better-font-manager/fonts/`。插件更名不会移动或删除已有字体，首次运行新版时会将旧配置迁移到新的插件命名空间。

## 兼容性说明

- 思源 3.8 及以上版本采用新版关系图渲染器。新版仍支持修改字体，但暂未提供独立的标签字号接口，因此关系图字号设置目前不会生效。
- KaTeX 针对专用数学字体进行了适配，建议保留 `KaTeX_Math` 作为首选字体，将其他字体作为后备。
- Mermaid 的部分元素使用独立字号；插件可以修改主要文字，但无法覆盖所有图表元素。
- PDF 阅读器、第三方 iframe 内容和导出文件不在插件样式覆盖范围内。
- 每个导入文件会作为一个独立字体条目，不同字重不会自动合并。

## 开发

需要 Node.js 24 和 pnpm 11：

```bash
pnpm install
pnpm check
```

本地开发时，关闭思源并为目标工作空间创建开发链接：

```powershell
pnpm dev:setup -- "D:\\你的思源工作空间"
pnpm dev
```

`pnpm dev` 会监听源码并生成 `index.js`、`index.css` 和 `i18n/`。生产构建输出到 `dist/`，生成的 `package.zip` 可以直接作为 GitHub Release 附件。

## 许可证

[MIT](LICENSE)
