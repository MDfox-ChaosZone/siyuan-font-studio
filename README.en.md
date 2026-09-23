# SiYuan Font Studio

[简体中文](https://github.com/MDfox-ChaosZone/siyuan-font-studio/blob/main/README.md)

Font playground:

- Easily customize a wide range of font elements in SiYuan!
- Freely combine fonts and switch between your font presets!

## Features

Customize the font family and size of the following elements:

| Font element | Font family | Font size | Scope |
| --- | :---: | :---: | --- |
| Interface | ✅ | ✅ | Menus, settings, the document tree, tab bars, sidebars, and other SiYuan UI elements |
| Documents | ✅ | ✅ | Body text, headings, lists, blockquotes, tables, and other document content |
| Code | ✅ | ✅ | Inline code and code blocks; each can be configured separately |
| Formulas | ✅ | ✅ | Inline formulas and formula blocks; each can be configured separately |
| Graphs | ✅ | ❌ | Document graphs and the global graph |
| Mermaid | ✅ | Partial | Some Mermaid elements use independent fixed font sizes that cannot be overridden consistently |
| Emoji | ✅ | ❌ | Emoji displayed in the document tree, document content, and similar locations |

- Save font combinations as presets and switch between them easily. Import and export presets for sharing and use across devices.
- Select multiple fonts to provide fallbacks for missing characters.

## Additional notes

- Graph fonts: SiYuan 3.8 and later use a new graph renderer. The plugin currently supports changing the font family only and does not provide a graph font-size setting.
- WOFF2 is recommended because of its smaller file size. TTF/OTF fonts can be converted online with [CloudConvert](https://cloudconvert.com/ttf-to-woff2) or with my [FontConvert](https://github.com/MDfox-ChaosZone/Font-Converter) project.
- Share your presets from “Download font presets → Share my preset” in the plugin. See the [community submission and publishing guide](docs/community-presets.md) for review and release details.

## Changelog

- **v0.1.7**: Improved variable-font support; fixed font weights not applying to formula fallback fonts and prevented those fallbacks from overriding KaTeX digits and operators; fixed the “Failed to save settings: [object Object]” error when downloading the example preset in SiYuan 3.8.3.
- **v0.1.6**: Added font weight display and selection, with compatibility for SiYuan 3.8.2.
- **v0.1.5**: Added on-demand download and automatic import for the example font preset, and refined the preset toolbar layout.
- **v0.1.4 and earlier**: Completed the plugin's core functionality.

## License

[MIT](LICENSE)

## Support and sponsorship

If this plugin is useful to you, please give it a **Star on GitHub**. It means a lot to me—pretty please!

Any sponsorship is also greatly appreciated!

### WeChat Pay and Alipay

| WeChat Pay | Alipay |
| :---: | :---: |
| <img src="assets/donate/Wechat-pay.webp" alt="WeChat Pay QR code" width="220"> | <img src="assets/donate/Alipay.jpg" alt="Alipay QR code" width="220"> |

### USDT

- Plasma: `0x742fa2ac27c5d3ff0c337b93ad688d39a77da4c8`
- Aptos: `0xb3ba1611884cc1c2d2d970d081f6c24089d363817a772bddab52a0a278c6ffef`

| Plasma | Aptos |
| :---: | :---: |
| <img src="assets/donate/USDT-Plasma.jpg" alt="USDT deposit QR code on Plasma" width="220"> | <img src="assets/donate/USDT-APTOS.jpg" alt="USDT deposit QR code on Aptos" width="220"> |
