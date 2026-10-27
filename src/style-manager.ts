import {EMOJI_UNICODE_RANGE, emojiRuntimeFamily, familyForChoices, quoteFamily, runtimeFamily, variableWeightForChoices, weightForChoices} from "./font-utils";
import {BaseFontTarget, FontChoice, FontTarget, HEADING_TARGETS, ImportedFont, PluginState} from "./types";
import {mindmapOverrides} from "./mindmap";
import {supportsGraphFonts, supportsMindmapFonts} from "./compatibility";
import {formatLetterSpacing, formatLineHeight, SIYUAN_LINE_HEIGHT} from "./typography";

// SiYuan's PDF/HTML export copies every `style[id^="snippetCSS"]` from the
// main window, so this id carries the plugin's rules into exports. The snippet
// manager only removes the style elements it created itself.
export const STYLE_ID = "snippetCSS-siyuan-font-studio";
const LEGACY_STYLE_ID = "siyuan-font-studio-overrides";
const SIYUAN_UI_FALLBACK = '"Emojis Additional", "Emojis Reset", BlinkMacSystemFont, Helvetica, "Luxi Sans", "DejaVu Sans", arial, sans-serif, emojis';
const SIYUAN_MONO_FALLBACK = '"Emojis Additional", "Emojis Reset", "JetBrainsMono-Regular", mononoki, Consolas, "Liberation Mono", var(--b3-font-family), monospace';
const SIYUAN_EMOJI_FALLBACK = '"Emojis Additional", emojis';
// SiYuan 3.8.4+ puts its emoji corrections ahead of text fonts; older themes lack the variable.
const EMOJI_RESET = 'var(--b3-font-family-emoji-reset, "Emojis Additional", "Emojis Reset")';
const EDITOR_FAMILY = "var(--b3-font-family-editor, var(--b3-font-family-protyle))";
// Higher than SiYuan's `:root:root` global font rule and theme `:root` rules.
const ROOT_SELECTOR = ":root:root:root";
const CONTENT_CONTAINERS = ".b3-typography:not(.b3-typography--default), .protyle-wysiwyg, .protyle-title";
const INLINE_CODE_SELECTORS = '.b3-typography code:not(.hljs), .protyle-wysiwyg span[data-type~="code"]';
const MONO_BLOCK_SELECTORS = '.b3-typography .hljs, .protyle-wysiwyg .hljs, .protyle-linenumber__rows, textarea[style*="--b3-font-family-code"], textarea[style*="--b3-font-family-editor-code"]';
const CODE_BLOCK_SELECTORS = ".b3-typography .code-block, .protyle-wysiwyg .code-block";
// Mirrors SiYuan's line-height rule; code blocks and databases keep their own metrics.
const CONTENT_BLOCK_SELECTORS = [
    '.protyle-wysiwyg [data-node-id]:not([data-type="NodeCodeBlock"]):not([data-type="NodeAttributeView"])',
    ".b3-typography:not(.b3-typography--default) > p",
    ".b3-typography:not(.b3-typography--default) li > p",
    ".b3-typography:not(.b3-typography--default) blockquote > p",
    '.b3-typography:not(.b3-typography--default) [data-node-id]:not([data-type="NodeCodeBlock"]):not([data-type="NodeAttributeView"])',
].join(", ");
const BOLD_SELECTORS = '.protyle-wysiwyg strong, .protyle-wysiwyg b, .protyle-wysiwyg span[data-type~="strong"], .b3-typography:not(.b3-typography--default) strong, .b3-typography:not(.b3-typography--default) b';
const INDENT_SELECTORS = '.protyle-wysiwyg [data-type="NodeParagraph"]:not(.li > [data-type="NodeParagraph"]) > [contenteditable], .b3-typography:not(.b3-typography--default) > p';

export interface ApplyOptions {
    /** Fallback for SiYuan builds without the editor font-size plugin API. */
    cssEditorFontSize?: boolean;
}

export class StyleManager {
    private baselineFamilies: Record<BaseFontTarget, string>;

    constructor() {
        document.getElementById(LEGACY_STYLE_ID)?.remove();
        this.baselineFamilies = this.readBaselineFamilies();
    }

    private readBaselineFamilies(): Record<BaseFontTarget, string> {
        const computed = getComputedStyle(document.documentElement);
        const baselineUi = computed.getPropertyValue("--b3-font-family").trim() || SIYUAN_UI_FALLBACK;
        const resolveReferences = (value: string, fallback: string, references: Record<string, string> = {}) => {
            let resolved = value.trim() || fallback;
            for (const [name, replacement] of Object.entries({"--b3-font-family": baselineUi, ...references})) {
                resolved = resolved.split(`var(${name})`).join(replacement);
            }
            return resolved;
        };
        const baselineProtyle = resolveReferences(computed.getPropertyValue("--b3-font-family-protyle"), baselineUi);
        const baselineCode = resolveReferences(computed.getPropertyValue("--b3-font-family-code"), SIYUAN_MONO_FALLBACK);
        const baselineEditor = resolveReferences(computed.getPropertyValue("--b3-font-family-editor"), baselineProtyle, {"--b3-font-family-protyle": baselineProtyle});
        return {
            ui: baselineUi,
            content: baselineEditor,
            mono: resolveReferences(computed.getPropertyValue("--b3-font-family-editor-code"), baselineCode, {"--b3-font-family-code": baselineCode}),
            graph: computed.getPropertyValue("--b3-font-family-graph").trim() || "arial",
            emoji: computed.getPropertyValue("--b3-font-family-emoji").trim() || SIYUAN_EMOJI_FALLBACK,
            math: computed.getPropertyValue("--b3-font-family-math").trim() || "KaTeX_Math",
            mermaid: "sans-serif",
            mindmap: baselineEditor,
            kbd: resolveReferences(computed.getPropertyValue("--b3-font-family-kbd"), baselineProtyle, {"--b3-font-family-protyle": baselineProtyle}),
        };
    }

    /** Returns whether SiYuan's or the theme's font stacks changed. */
    refreshBaselines(): boolean {
        const style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
        const previous = JSON.stringify(this.baselineFamilies);
        // Read SiYuan's and the theme's values without the plugin's overrides.
        if (style) style.disabled = true;
        try {
            this.baselineFamilies = this.readBaselineFamilies();
        } finally {
            if (style) style.disabled = false;
        }
        return JSON.stringify(this.baselineFamilies) !== previous;
    }

    getBaselineFamily(target: FontTarget): string {
        return this.baselineFamilies[HEADING_TARGETS.includes(target as typeof HEADING_TARGETS[number]) ? "content" : target as BaseFontTarget];
    }

    apply(state: PluginState, loadedIds: Set<string>, emojiLoadedIds = loadedIds, options: ApplyOptions = {}): void {
        const vars: Array<[string, string]> = [];
        const effectiveChoices = (choices: FontChoice[]) => isOnlySiyuanDefault(choices) ? [] : choices;
        const ui = familyForChoices(effectiveChoices(state.targets.ui.fonts), state.fonts, loadedIds, runtimeFamily, this.baselineFamilies.ui);
        const content = familyForChoices(effectiveChoices(state.targets.content.fonts), state.fonts, loadedIds, runtimeFamily, this.baselineFamilies.content);
        const mono = familyForChoices(effectiveChoices(state.targets.mono.fonts), state.fonts, loadedIds, runtimeFamily, this.baselineFamilies.mono);
        const graph = familyForChoices(effectiveChoices(state.targets.graph.fonts), state.fonts, loadedIds, runtimeFamily, this.baselineFamilies.graph);
        const kbd = familyForChoices(effectiveChoices(state.targets.kbd.fonts), state.fonts, loadedIds, runtimeFamily, this.baselineFamilies.kbd);
        const restrictedEmoji = restrictedEmojiFamilies(effectiveChoices(state.targets.emoji.fonts), state.fonts, emojiLoadedIds, this.baselineFamilies.emoji);
        const emoji = restrictedEmoji.family;
        const mathChoices = effectiveMathChoices(state.targets.math.fonts);
        const math = familyForChoices(mathChoices, state.fonts, loadedIds, runtimeFamily, this.baselineFamilies.math);
        const weights = {
            ui: weightForChoices(effectiveChoices(state.targets.ui.fonts), state.fonts),
            content: weightForChoices(effectiveChoices(state.targets.content.fonts), state.fonts),
            mono: weightForChoices(effectiveChoices(state.targets.mono.fonts), state.fonts),
            graph: weightForChoices(effectiveChoices(state.targets.graph.fonts), state.fonts),
            math: weightForChoices(mathChoices, state.fonts),
            mermaid: weightForChoices(effectiveChoices(state.targets.mermaid.fonts), state.fonts),
        };
        const mathVariableWeight = variableWeightForChoices(mathChoices, state.fonts);

        if (ui) vars.push(["--b3-font-family", `${EMOJI_RESET}, ${ui}, ${this.baselineFamilies.ui}`]);
        if (content) {
            const contentStack = `${EMOJI_RESET}, ${content}, ${this.baselineFamilies.content}`;
            vars.push(["--b3-font-family-protyle", contentStack], ["--b3-font-family-editor", contentStack]);
        }
        // Keep documents and code on their original fonts when only the interface changes.
        else if (ui) vars.push(["--b3-font-family-protyle", this.baselineFamilies.content]);
        if (mono) {
            const monoStack = `${EMOJI_RESET}, ${mono}, ${this.baselineFamilies.mono}`;
            vars.push(["--b3-font-family-code", monoStack], ["--b3-font-family-editor-code", monoStack]);
        }
        else if (ui) vars.push(["--b3-font-family-code", this.baselineFamilies.mono]);
        if (weights.mono !== null) vars.push(["--b3-font-weight-editor-code", String(weights.mono)]);
        if (supportsGraphFonts()) {
            if (graph) vars.push(["--b3-font-family-graph", `${graph}, ${this.baselineFamilies.graph}`]);
            if (weights.graph !== null) vars.push(["--bfm-font-weight-graph", String(weights.graph)]);
        }
        if (emoji) vars.push(["--b3-font-family-emoji", `${emoji}, ${this.baselineFamilies.emoji}`]);
        if (kbd) vars.push(["--b3-font-family-kbd", `${kbd}, var(--b3-font-family-protyle)`]);
        if (state.targets.ui.size !== null) vars.push(["--b3-font-size", `${state.targets.ui.size}px`]);
        if (options.cssEditorFontSize && state.targets.content.size !== null) vars.push(["--b3-font-size-editor", `${state.targets.content.size}px`]);

        let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
        if (!style) {
            style = document.createElement("style");
            style.id = STYLE_ID;
            document.head.appendChild(style);
        }
        const monoBlock = state.targets.mono.decoupled ? familyForChoices(state.targets.mono.secondary?.fonts || [], state.fonts, loadedIds, runtimeFamily, this.baselineFamilies.mono) || this.baselineFamilies.mono : mono;
        const mathBlockChoices = effectiveMathChoices(state.targets.math.secondary?.fonts || []);
        const mathBlock = state.targets.math.decoupled
            ? familyForChoices(mathBlockChoices, state.fonts, loadedIds, runtimeFamily, this.baselineFamilies.math)
            : null;
        const monoBlockWeight = state.targets.mono.decoupled
            ? weightForChoices(state.targets.mono.secondary?.fonts || [], state.fonts)
            : weights.mono;
        const mathBlockWeight = state.targets.math.decoupled
            ? weightForChoices(mathBlockChoices, state.fonts)
            : weights.math;
        const mathBlockVariableWeight = state.targets.math.decoupled
            ? variableWeightForChoices(mathBlockChoices, state.fonts)
            : mathVariableWeight;
        const mindmap = mindmapOverrides(state, loadedIds);
        const mindmapDeclarations = [
            mindmap.fontFamily ? `font-family: ${mindmap.fontFamily} !important;` : "",
            mindmap.fontSize !== undefined ? `font-size: ${mindmap.fontSize}px !important;` : "",
        ].filter(Boolean).join(" ");
        const mindmapRules = supportsMindmapFonts() ? [
            mindmapDeclarations ? `.mindmap-view .mindmap-view__node, .mindmap-view .mindmap-view__content, .mindmap-view .mindmap-view__editor .protyle-wysiwyg { ${mindmapDeclarations} }` : "",
            // Virtual root and summary nodes keep SiYuan's emphasis weight.
            mindmap.fontWeight !== undefined ? `.mindmap-view .mindmap-view__node:not(.mindmap-view__node--virtual), .mindmap-view .mindmap-view__node:not(.mindmap-view__node--virtual) .mindmap-view__content, .mindmap-view .mindmap-view__editor .protyle-wysiwyg { font-weight: ${mindmap.fontWeight} !important; }` : "",
        ] : [];
        const rootRule = vars.length ? `${ROOT_SELECTOR} { ${vars.map(([name, value]) => `${name}: ${value} !important;`).join(" ")} }` : "";
        style.textContent = [
            rootRule,
            ...restrictedEmoji.faceRules,
            ...mindmapRules,
            this.buildRules(state, {ui, content, mono, graph, emoji, math, mermaid: null, mindmap: null, kbd}, {monoBlock, mathBlock}, weights, monoBlockWeight, mathBlockWeight, mathVariableWeight, mathBlockVariableWeight, options),
            ...HEADING_TARGETS.map((target) => {
                const settings = state.targets[target];
                const choices = effectiveChoices(settings.fonts);
                const family = familyForChoices(choices, state.fonts, loadedIds, runtimeFamily, EDITOR_FAMILY);
                const weight = weightForChoices(choices, state.fonts);
                const declarations = [
                    family ? `font-family: ${emoji ? `${emoji}, ` : ""}${family}, ${EDITOR_FAMILY} !important;` : "",
                    settings.size !== null ? `font-size: ${settings.size}px !important;` : "",
                    weight !== null ? `font-weight: ${weight} !important;` : "",
                    settings.letterSpacing != null ? `letter-spacing: ${formatLetterSpacing(settings.letterSpacing)} !important;` : "",
                    settings.lineHeight != null ? `line-height: ${formatLineHeight(settings.lineHeight)} !important;` : "",
                ].filter(Boolean).join(" ");
                // [data-node-id] matches the specificity of the document line-height rule, which comes first.
                return declarations ? `.protyle-wysiwyg [data-node-id][data-type="NodeHeading"][data-subtype="${target}"], .b3-typography:not(.b3-typography--default) ${target} { ${declarations} }` : "";
            }),
        ].filter(Boolean).join("\n");
    }

    destroy(): void {
        document.getElementById(STYLE_ID)?.remove();
    }

    private buildRules(state: PluginState, families: Record<BaseFontTarget, string | null>, separated: {monoBlock: string | null; mathBlock: string | null}, weights: {ui: number | null; content: number | null; mono: number | null; graph: number | null; math: number | null; mermaid: number | null}, monoBlockWeight: number | null, mathBlockWeight: number | null, mathVariableWeight: number | null, mathBlockVariableWeight: number | null, options: ApplyOptions): string {
        const rules: string[] = [];
        // Matches SiYuan's global font weight rule; form controls do not inherit it.
        if (weights.ui !== null) rules.push(`body, button, input, select, textarea { font-weight: ${weights.ui}; }`);
        if (weights.content !== null) rules.push(`.b3-typography:not(.b3-typography--default), .protyle-wysiwyg, .protyle-title { font-weight: ${weights.content}; }`);
        if (weights.mono !== null) rules.push(`${INLINE_CODE_SELECTORS} { font-weight: ${weights.mono} !important; }`);
        if (families.emoji) {
            rules.push(`.b3-typography:not(.b3-typography--default),
.protyle-wysiwyg,
.protyle-title { font-family: ${families.emoji}, ${EDITOR_FAMILY} !important; }`);
        }
        if (state.targets.mono.decoupled && separated.monoBlock) {
            rules.push(`${MONO_BLOCK_SELECTORS} { font-family: ${EMOJI_RESET}, ${separated.monoBlock}, ${this.baselineFamilies.mono} !important;${monoBlockWeight === null ? "" : ` font-weight: ${monoBlockWeight} !important;`} }`);
        } else if (monoBlockWeight !== null) {
            rules.push(`${MONO_BLOCK_SELECTORS} { font-weight: ${monoBlockWeight} !important; }`);
        }
        if (families.math) {
            const fallbackOnly = hasLeadingSiyuanDefault(state.targets.math.fonts);
            const mathFamily = fallbackOnly ? `${families.math}, ${EDITOR_FAMILY}` : `${families.math}, ${this.baselineFamilies.math}`;
            const mathRoot = state.targets.math.decoupled ? ".katex:not(.katex-display .katex)" : ".katex";
            const selectors = fallbackOnly ? fallbackMathSelectors(mathRoot) : safeMathSelectors(mathRoot);
            rules.push(`${selectors} { font-family: ${mathFamily} !important;${weights.math === null ? "" : ` font-weight: ${weights.math} !important;`}${mathVariableWeight === null ? "" : ` font-variation-settings: "wght" ${mathVariableWeight} !important;`} }`);
        }
        if (separated.mathBlock) {
            const fallbackOnly = hasLeadingSiyuanDefault(state.targets.math.secondary?.fonts || []);
            const mathBlockFamily = fallbackOnly ? `${separated.mathBlock}, ${EDITOR_FAMILY}` : `${separated.mathBlock}, ${this.baselineFamilies.math}`;
            const selectors = fallbackOnly ? fallbackMathSelectors(".katex-display .katex") : safeMathSelectors(".katex-display .katex");
            rules.push(`${selectors} { font-family: ${mathBlockFamily} !important;${mathBlockWeight === null ? "" : ` font-weight: ${mathBlockWeight} !important;`}${mathBlockVariableWeight === null ? "" : ` font-variation-settings: "wght" ${mathBlockVariableWeight} !important;`} }`);
        }
        if (weights.mermaid !== null) rules.push(`[data-subtype="mermaid"] svg { font-weight: ${weights.mermaid} !important; }`);
        if (state.targets.ui.size !== null) {
            rules.push(`body > .fn__flex-1, .b3-menu, .b3-dialog, .b3-text-field, .b3-select, .b3-button, .layout-tab-bar { font-size: ${state.targets.ui.size}px !important; }`);
        }
        if (state.targets.mono.size !== null) {
            rules.push(`${INLINE_CODE_SELECTORS} { font-size: ${state.targets.mono.size}px !important; }`);
        }
        const monoBlockSize = state.targets.mono.decoupled ? state.targets.mono.secondary?.size : state.targets.mono.size;
        if (monoBlockSize !== null && monoBlockSize !== undefined) {
            rules.push(`${MONO_BLOCK_SELECTORS} { font-size: ${monoBlockSize}px !important; }`);
        }
        if (state.targets.math.size !== null) {
            const mathRoot = state.targets.math.decoupled ? ".katex:not(.katex-display .katex)" : ".katex";
            rules.push(`.b3-typography ${mathRoot}, .protyle-wysiwyg ${mathRoot} { font-size: ${state.targets.math.size}px !important; }`);
        }
        const mathBlockSize = state.targets.math.decoupled ? state.targets.math.secondary?.size : null;
        if (mathBlockSize !== null && mathBlockSize !== undefined) rules.push(`.b3-typography .katex-display .katex, .protyle-wysiwyg .katex-display .katex { font-size: ${mathBlockSize}px !important; }`);
        rules.push(...this.spacingRules(state, monoBlockSize ?? null, options));
        return rules.join("\n");
    }

    private spacingRules(state: PluginState, monoBlockSize: number | null, options: ApplyOptions): string[] {
        const rules: string[] = [];
        const {ui, content, mono} = state.targets;
        const spacing = (value: number | null | undefined) => value == null ? "normal" : formatLetterSpacing(value);
        if (ui.letterSpacing != null) rules.push(`body { letter-spacing: ${formatLetterSpacing(ui.letterSpacing)}; }`);
        // letter-spacing inherits as an absolute length, so documents recompute it per block.
        if (content.letterSpacing != null || ui.letterSpacing != null) {
            rules.push(`${CONTENT_CONTAINERS}, ${CONTENT_BLOCK_SELECTORS} { letter-spacing: ${spacing(content.letterSpacing)}; }`);
        }
        // Spacing tab: primary mono is inline code and secondary is code blocks, whatever the font tab's decoupling.
        const inlineCodeSpacing = mono.letterSpacing;
        const blockCodeSpacing = mono.secondary?.letterSpacing;
        const inheritsSpacing = content.letterSpacing != null || ui.letterSpacing != null;
        if (inlineCodeSpacing != null || inheritsSpacing) rules.push(`${INLINE_CODE_SELECTORS} { letter-spacing: ${spacing(inlineCodeSpacing)} !important; }`);
        if (blockCodeSpacing != null || inheritsSpacing) rules.push(`${MONO_BLOCK_SELECTORS} { letter-spacing: ${spacing(blockCodeSpacing)} !important; }`);
        if (content.lineHeight != null) rules.push(`${CONTENT_BLOCK_SELECTORS} { line-height: ${formatLineHeight(content.lineHeight)} !important; }`);
        // SiYuan writes code-block line heights in px from its own editor font size,
        // so any plugin-controlled code size needs a relative line height.
        const codeLineHeight = mono.secondary?.lineHeight;
        if (codeLineHeight != null || monoBlockSize !== null || (options.cssEditorFontSize && content.size !== null)) {
            rules.push(`${CODE_BLOCK_SELECTORS} { line-height: ${formatLineHeight(codeLineHeight ?? SIYUAN_LINE_HEIGHT)} !important; }`);
        }
        const contentOptions = content.options;
        if (contentOptions?.boldWeight != null) rules.push(`${BOLD_SELECTORS} { font-weight: ${contentOptions.boldWeight}; }`);
        if (contentOptions?.indent) rules.push(`${INDENT_SELECTORS} { text-indent: 2em; }`);
        if (contentOptions?.autospace) {
            rules.push(`${CONTENT_CONTAINERS} { text-autospace: normal; }`);
            rules.push(`${INLINE_CODE_SELECTORS}, ${MONO_BLOCK_SELECTORS} { text-autospace: no-autospace; }`);
        }
        if (contentOptions?.noSynthesis) rules.push(`${CONTENT_CONTAINERS} { font-synthesis: none; }`);
        return rules;
    }
}

function isOnlySiyuanDefault(choices: FontChoice[]): boolean {
    return choices.length === 1 && choices[0].kind === "default";
}

function hasLeadingSiyuanDefault(choices: FontChoice[]): boolean {
    return choices.length > 1 && choices[0].kind === "default";
}

function effectiveMathChoices(choices: FontChoice[]): FontChoice[] {
    return choices[0]?.kind === "default" ? choices.slice(1) : choices;
}

function fallbackMathSelectors(mathRoot: string): string {
    return [".b3-typography", ".protyle-wysiwyg"]
        .map((container) => `${container} ${mathRoot} .cjk_fallback`)
        .join(",\n");
}

function safeMathSelectors(mathRoot: string): string {
    const containers = [".b3-typography", ".protyle-wysiwyg"];
    const safeGlyphs = [
        ".mord:not(.sqrt):not(.delimsizing)",
        ".mop:not(.op-symbol)",
        ".mbin",
        ".mrel",
        ".mpunct",
    ];
    return containers.flatMap((container) => safeGlyphs.map((glyph) => `${container} ${mathRoot} ${glyph}`)).join(",\n");
}

function restrictedEmojiFamilies(choices: FontChoice[], fonts: ImportedFont[], loadedIds: Set<string>, defaultFamily: string): {family: string | null; faceRules: string[]} {
    const families: string[] = [];
    const faceRules: string[] = [];
    choices.forEach((choice, index) => {
        if (choice.kind === "default") {
            families.push(defaultFamily);
            return;
        }
        if (choice.kind === "imported") {
            if (fonts.some((font) => font.id === choice.id) && loadedIds.has(choice.id)) {
                families.push(quoteFamily(emojiRuntimeFamily(choice.id)));
            }
            return;
        }
        if (choice.kind !== "system") return;
        const alias = `BFM_EMOJI_SYSTEM_${index}`;
        const sources = Array.from(new Set([choice.displayName, choice.family]))
            .map((name) => `local(${quoteFamily(name)})`)
            .join(", ");
        families.push(quoteFamily(alias));
        faceRules.push(`@font-face { font-family: ${quoteFamily(alias)}; src: ${sources}; unicode-range: ${EMOJI_UNICODE_RANGE}; }`);
    });
    return {family: families.length ? families.join(", ") : null, faceRules};
}
