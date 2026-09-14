# 思源字体工坊

[English](https://github.com/MDfox-ChaosZone/siyuan-font-studio/blob/main/README.en.md)

轻松自定义思源中的所有字体元素！

## 功能

| 元素     | 可修改字体 | 可修改字号 | 具体范围                                                   |
| ---------- | ------------ | ------------ | ------------------------------------------------------------ |
| 界面     | ✅         | ✅         | 菜单、对话框、输入框、按钮、标签栏、侧栏等应用界面         |
| 正文     | ✅         | ✅         | 文档标题和编辑器中的普通正文、标题、列表、引述、表格等内容 |
| 等宽文字 | ✅         | ✅         | 行内代码、代码块；两者可分开设置                           |
| 公式字体 | ✅         | ✅         | 行级公式、公式块；两者可分开设置                           |
| 关系图   | ✅         | ❌         | 关系图和全局关系图                                         |
| Mermaid  | ✅         | 部分       | 图表主要文字；部分图表元素有自己的固定字号，无法统一覆盖   |
| Emoji    | ✅         | ❌         | 正文、文档标题等位置显示的 Emoji                           |

- 可将字体组合保存为预设方案，轻松切换字体方案；支持导入导出，方便分享与多设备使用。
- 可多选字体来候补字符。

## 额外说明

- 关系图字体：思源 3.8 及以上版本采用新版关系图渲染器，目前仅支持修改字体，不提供字号设置。
- 思源内置的 KaTeX 对专用字体进行了特殊适配，因此建议保留 `KaTeX_Math` 作为首选字体，可次选其他字体来候补中文字符。
- 推荐使用体积更小的 WOFF2 字体格式。TTF/OTF 格式字体可以通过 [CloudConvert](https://cloudconvert.com/ttf-to-woff2) 在线转换，或使用本人项目 [FontConvert](https://github.com/MDfox-ChaosZone/Font-Converter) 转换。
- 可在预设方案工具栏中按需下载并自动导入[示例字体方案](https://github.com/MDfox-ChaosZone/siyuan-font-studio/releases/tag/%E7%A4%BA%E4%BE%8B%E5%AD%97%E4%BD%93%E6%96%B9%E6%A1%88)，示例字体不会打包进插件或随插件更新重复下载。欢迎通过 [GitHub Issues](https://github.com/MDfox-ChaosZone/siyuan-font-studio/issues) 分享自己的字体方案，方案将手动同步到该 Release 中。

## 更新记录

- **v0.1.4 及以前**：完成插件基本功能。
- **v0.1.5**：新增示例字体方案的按需下载与自动导入功能，并优化预设方案工具栏布局。
- **v0.1.6**：增加对字体字重的显示和选择功能，并适配思源 3.8.2 版本。
- **v0.1.7**：完善可变字体支持，为等宽、公式、关系图和 Mermaid 字体增加字重调节；修复公式候补字体字重不生效，以及候补字体错误覆盖 KaTeX 数字和运算符的问题；修复思源 3.8.3 中下载示例方案时提示“保存设置失败：[object Object]”的问题。

## 许可证

[MIT](LICENSE)

## 支持与赞助

如果这个项目对你有帮助，欢迎给这个项目点心。任何赞助都不胜感激哦。

### 微信支付与支付宝

| 微信支付 | 支付宝 |
| :---: | :---: |
| ![微信支付收款码](assets/donate/Wechat-pay.webp) | ![支付宝收款码](assets/donate/Alipay.jpg) |

### USDT

- Plasma：`0x742fa2ac27c5d3ff0c337b93ad688d39a77da4c8`
- Aptos：`0xb3ba1611884cc1c2d2d970d081f6c24089d363817a772bddab52a0a278c6ffef`

| Plasma | Aptos |
| :---: | :---: |
| ![Plasma 网络 USDT 充值二维码](assets/donate/USDT-Plasma.jpg) | ![Aptos 网络 USDT 充值二维码](assets/donate/USDT-APTOS.jpg) |
