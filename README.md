# 思源字体工坊

[English](https://github.com/MDfox-ChaosZone/siyuan-font-studio/blob/main/README.en.md)

来自定义思源里的所有字体元素吧！

## 功能

- 支持自定义界面、正文、等宽、数学公式、关系图、Emoji 和 Mermaid 的字体和字号。
- 可自定义字体预设方案，支持导入、导出、切换字体方案。
- 可多选字体来候补字符。

## 额外说明

- 关系图字体：思源 3.8 及以上版本采用新版关系图渲染器。新版本仍支持修改字体，但暂未提供独立的字号接口，因此关系图字号设置对于 3.8 及以上版本不会生效。
- 思源内置的 KaTeX 对专用字体进行了特殊适配，因此建议保留 `KaTeX_Math` 作为首选字体，可次选其他字体来候补中文字符。
- Mermaid 的部分元素使用独立固定字号，因此插件无法覆盖所有图表元素的字号修改。
- 推荐使用体积更小的 WOFF2 字体格式。TTF/OTF 格式字体可以通过 [CloudConvert](https://cloudconvert.com/ttf-to-woff2) 在线转换，或使用本人项目 [FontConvert](https://github.com/MDfox-ChaosZone/Font-Converter) 转换。

## 许可证

[MIT](LICENSE)

## 支持与赞助

如果这个项目对你有帮助，欢迎给这个项目点心。任何赞助都不胜感激哦。

### 微信支付与支付宝

| 微信支付 | 支付宝 |
| :---: | :---: |
| ![微信支付收款码](assets/donate/wechat-pay.png) | ![支付宝收款码](assets/donate/alipay.jpg) |

### USDT

- Plasma：`0x742fa2ac27c5d3ff0c337b93ad688d39a77da4c8`
- Aptos：`0xb3ba1611884cc1c2d2d970d081f6c24089d363817a772bddab52a0a278c6ffef`

| Plasma | Aptos |
| :---: | :---: |
| ![Plasma 网络 USDT 充值二维码](assets/donate/usdt-plasma.jpg) | ![Aptos 网络 USDT 充值二维码](assets/donate/usdt-aptos.jpg) |

转账 USDT 时，请同时核对网络和钱包地址。
