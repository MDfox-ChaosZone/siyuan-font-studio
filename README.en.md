# SiYuan Font Studio

[简体中文](https://github.com/MDfox-ChaosZone/siyuan-font-studio/blob/main/README.md)

## Features

| Element | Font | Size | Scope |
| --- | :---: | :---: | --- |
| Interface | ✅ | ✅ | Menus, settings, the document tree, sidebars and other UI |
| Editor | ✅ | ✅ | Document content in the editor |
| Headings | ✅ | ✅ | H1–H6 can be set separately |
| Code | ✅ | ✅ | Inline code and code blocks, which can be set separately |
| Formulas | ✅ | ✅ | Inline formulas and formula blocks, which can be set separately |
| Graphs | ✅ | ❌ | Document graphs and the global graph |
| Mind maps | ✅ | ✅ | Mind map blocks |
| Mermaid | ✅ | Partial | Some diagram elements use fixed sizes |
| Emoji | ✅ | ❌ | Emoji in the document tree, the editor and elsewhere |

- Select several fonts; later fonts fill in characters the earlier ones lack.
- Save your settings as presets, and import or export them to switch quickly or use them on other devices.

## Additional notes

- For personal use, the smaller WOFF2 font format is recommended to reduce memory and storage usage.
  - TTF/OTF fonts can be converted with [CloudConvert](https://cloudconvert.com/ttf-to-woff2) or my [FontConvert](https://github.com/MDfox-ChaosZone/Font-Converter) tool.
  - When distributing fonts, use the original font files to comply with any restrictions in their licenses.

## Changelog

- **v2.0.1**: Fixed font selection menus being clipped by settings groups in Neo and other themes, leaving the monospace and formula font lists only partially visible.

- **v2.0.0**: The plugin is feature-complete. I'm not using SiYuan for now, but I'll keep maintaining this plugin. Please open an [issue](https://github.com/MDfox-ChaosZone/siyuan-font-studio/issues) if you run into problems.

<details>
<summary>Earlier entries</summary>

- **v2.0.0 changes in detail**:
  - Settings wording now matches SiYuan, for example “Document font” is now “Editor font”.
  - Bold and italic text uses the real faces of the same font when those files are imported.
  - The editor font's size now sets SiYuan's editor font size, fixing conflicts with SiYuan's font-size shortcuts and broken code-block line heights when line numbers are shown.
  - Adapted to SiYuan's newer global fonts, emoji corrections and custom fonts (Docker and mobile); the plugin refreshes when SiYuan's own font settings change.
  - Fixed a security issue where preset import messages could inject HTML, fixed the emoji font overriding SiYuan's editor font, and applied synced settings without reloading the plugin.
  - Removed community preset submission and downloads; only the author's example preset remains.

- **v1.2.0**: Improved font loading: startup loads only fonts used by the current preset, and previews load as you scroll. Font metadata is cached, and Emoji faces load only when used.
- **v1.1.2**:
  - Monospace default sizes now display their computed values. Default monospace and formula size values update immediately when the document font size changes.
  - Fixed a custom inline formula size affecting formula blocks using their default size when “Set separately” was enabled.
  - Fixed mismatches between slider values and displayed values when default sizes fell outside the manual adjustment range. Added a font size tooltip next to “Document font”.
- **v1.1.1**: Fixed spacing between SiYuan's automatic heading numbers and text failing to update immediately when changing document or heading fonts and sizes through the plugin.
- **v1.1.0**: Added mind map font settings.
- **v1.0.0**:
  - Fixed the mismatch between the formula size slider and the actual size after resetting to defaults. Inline formulas and formula blocks display their computed sizes separately; defaults may include decimals, while manual adjustments still use whole pixels.
  - Fixed hard-to-read settings tooltips in themes such as neo by using matching theme background and text colors.
- **v0.1.9**: Added independent H1–H6 fonts, weights, and sizes with default resets and preset import/export; display computed default sizes while preserving older presets; refreshed the plugin preview and documentation.
- **v0.1.8**: Added community preset submission, review, and live downloads; added split uploads for large presets and author-initiated withdrawal; improved the download dialog and saving split packages.
- **v0.1.7**: Improved variable-font support; fixed font weights not applying to formula fallback fonts and prevented those fallbacks from overriding KaTeX digits and operators; fixed failures when downloading the example preset.
- **v0.1.6**: Added font weight display and selection, with compatibility for SiYuan 3.8.2.
- **v0.1.5**: Added on-demand download and automatic import for the example font preset, and refined the preset toolbar layout.
- **v0.1.4 and earlier**: Completed the plugin's core functionality.

</details>

## Support and sponsorship

If this plugin is useful to you, please give it a **free Star on GitHub**. It means a lot to me—pretty please!

Any sponsorship is also greatly appreciated!

[PayPal](https://paypal.me/MDfox7788) · [Ko-fi](https://ko-fi.com/mdfox)

| WeChat Pay | Alipay | USDT (Aptos) |
| :---: | :---: | :---: |
| <img src="assets/donate/Wechat-pay.webp" alt="WeChat Pay QR code" width="200"> | <img src="assets/donate/Alipay.jpg" alt="Alipay QR code" width="200"> | <img src="assets/donate/USDT-APTOS.jpg" alt="USDT deposit QR code on Aptos" width="200"> |

USDT (Aptos) address: `0xb3ba1611884cc1c2d2d970d081f6c24089d363817a772bddab52a0a278c6ffef`
