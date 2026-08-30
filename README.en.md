# SiYuan Font Studio

[简体中文](https://github.com/MDfox-ChaosZone/siyuan-font-studio/blob/main/README.md)

Easily customize every font element in SiYuan!

## Features

| Element | Font family | Font size | Scope |
| --- | :---: | :---: | --- |
| Interface | ✅ | ✅ | Menus, dialogs, input fields, buttons, tab bars, sidebars, and other application UI |
| Document content | ✅ | ✅ | Document titles, body text, headings, lists, blockquotes, tables, and other editor content |
| Monospace text | ✅ | ✅ | Inline code and code blocks; each can be configured separately |
| Formula fonts | ✅ | ✅ | Inline formulas and formula blocks; each can be configured separately |
| Graphs | ✅ | ❌ | Document graphs and the global graph |
| Mermaid | ✅ | Partial | Main diagram text; some elements use independent fixed sizes that cannot be overridden consistently |
| Emoji | ✅ | ❌ | Emoji displayed in document content, document titles, and similar locations |

- Save font combinations as presets and switch between them easily. Import and export presets for sharing and use across devices.
- Select multiple fonts to provide fallback characters.

## Additional notes

- Graph fonts: SiYuan 3.8 and later use a new graph renderer. The plugin currently supports changing the font family only and does not provide a graph font-size setting.
- SiYuan's bundled KaTeX is specially adapted for dedicated formula fonts. Keeping `KaTeX_Math` as the first choice and adding other fonts as fallbacks for Chinese characters is recommended.
- WOFF2 is recommended because it is smaller. TTF/OTF fonts can be converted online with [CloudConvert](https://cloudconvert.com/ttf-to-woff2) or with my [FontConvert](https://github.com/MDfox-ChaosZone/Font-Converter) project.
- Download and automatically import the [example font preset](https://github.com/MDfox-ChaosZone/siyuan-font-studio/releases/tag/%E7%A4%BA%E4%BE%8B%E5%AD%97%E4%BD%93%E6%96%B9%E6%A1%88) on demand from the preset toolbar. Example fonts are not bundled with the plugin or downloaded again during plugin updates. You are welcome to share your own presets through [GitHub Issues](https://github.com/MDfox-ChaosZone/siyuan-font-studio/issues); presets will be manually added to that Release.

## Changelog

- **v0.1.4 and earlier**: Completed the plugin's core functionality.
- **v0.1.5**: Added on-demand download and automatic import for the example font preset, and refined the preset toolbar layout.
- **v0.1.6**: Added font weight display and selection.

## License

[MIT](LICENSE)

## Support and sponsorship

If this project is useful to you, you are welcome to leave a tip. Any sponsorship is greatly appreciated.

### WeChat Pay and Alipay

| WeChat Pay | Alipay |
| :---: | :---: |
| ![WeChat Pay QR code](assets/donate/Wechat-pay.webp) | ![Alipay QR code](assets/donate/Alipay.jpg) |

### USDT

- Plasma: `0x742fa2ac27c5d3ff0c337b93ad688d39a77da4c8`
- Aptos: `0xb3ba1611884cc1c2d2d970d081f6c24089d363817a772bddab52a0a278c6ffef`

| Plasma | Aptos |
| :---: | :---: |
| ![USDT deposit QR code on Plasma](assets/donate/USDT-Plasma.jpg) | ![USDT deposit QR code on Aptos](assets/donate/USDT-APTOS.jpg) |
