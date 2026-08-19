# SiYuan Font Studio

Import local fonts and configure independent font stacks and sizes for different parts of [SiYuan](https://github.com/siyuan-note/siyuan).

[简体中文](README.zh-CN.md)

## Features

- Import WOFF2, WOFF, TTF and OTF files in batches
- Preview, rename, delete, validate and deduplicate imported fonts
- Use imported fonts, installed system fonts, or SiYuan defaults
- Build ordered fallback stacks for each typography target
- Configure interface, editor, inline code and code-block fonts and sizes
- Configure math, graph, Mermaid and emoji fonts
- Keep separate inline/block settings for code and math
- Save, rename, switch, import and export font presets
- Apply changes immediately and restore them after restarts or theme changes

## Usage

After enabling the plugin, click the font icon in SiYuan's top bar or run **Open SiYuan Font Studio** from the command palette. Import fonts into the library, then assign them to the desired targets in order of priority.

WOFF2 is recommended because it is usually much smaller than TTF or OTF. Existing TTF/OTF files can be converted with [CloudConvert](https://cloudconvert.com/ttf-to-woff2) or [FontConvert](https://github.com/MDfox-ChaosZone/Font-Converter).

Imported font files remain under `data/storage/petal/siyuan-better-font-manager/fonts/` for compatibility with earlier development builds. Renaming the plugin does not move or delete existing fonts, and the first run migrates existing settings into the new plugin namespace.

## Compatibility notes

- SiYuan 3.8 and later use a new graph renderer. It still accepts the graph font family, but does not expose an independent graph-label size option, so the graph size control currently has no effect.
- KaTeX is designed around its dedicated math fonts. Keeping `KaTeX_Math` first and using additional fonts as fallbacks is recommended.
- Mermaid has elements with independent font-size rules; the plugin changes the primary diagram text but cannot override every element.
- PDF viewers, third-party iframe content and exported documents are outside the plugin's styling scope.
- Each imported file is a separate font entry; font weights are not grouped automatically.

## Development

Node.js 24 and pnpm 11 are required.

```bash
pnpm install
pnpm check
```

For local development, close SiYuan and create a development link in a workspace:

```powershell
pnpm dev:setup -- "D:\\path\\to\\your\\SiYuanWorkspace"
pnpm dev
```

`pnpm dev` watches the source and writes `index.js`, `index.css`, and `i18n/`. The production build is written to `dist/`, and `package.zip` is ready to attach to a GitHub Release.

## License

[MIT](LICENSE)
