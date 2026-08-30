import {EMOJI_UNICODE_RANGE, emojiRuntimeFamily, familyForChoices, quoteFamily, runtimeFamily, weightForChoices} from "./font-utils";
import {FontChoice, FontTarget, ImportedFont, PluginState} from "./types";

const STYLE_ID = "siyuan-font-studio-overrides";
const SIYUAN_UI_FALLBACK = '"Emojis Additional", "Emojis Reset", BlinkMacSystemFont, Helvetica, "Luxi Sans", "DejaVu Sans", arial, sans-serif, emojis';
const SIYUAN_MONO_FALLBACK = '"Emojis Additional", "Emojis Reset", "JetBrainsMono-Regular", mononoki, Consolas, "Liberation Mono", var(--b3-font-family)';
const SIYUAN_EMOJI_FALLBACK = '"Emojis Additional", emojis';
const ROOT_PROPERTIES = [
    "--b3-font-family",
    "--b3-font-family-protyle",
    "--b3-font-family-editor",
    "--b3-font-family-code",
    "--b3-font-family-editor-code",
    "--b3-font-weight-editor-code",
    "--b3-font-family-graph",
    "--b3-font-family-emoji",
    "--b3-font-family-math",
    "--b3-font-size",
    "--b3-font-size-editor",
];
const MONO_BLOCK_SELECTORS = '.b3-typography .hljs, .protyle-wysiwyg .hljs, .protyle-linenumber__rows, textarea[style*="--b3-font-family-code"], textarea[style*="--b3-font-family-editor-code"]';

export class StyleManager {
    private originalProperties = new Map<string, {value: string; priority: string}>();
    private baselineFamilies: Record<FontTarget, string>;

    constructor() {
        this.baselineFamilies = this.readBaselineFamilies();
        const rootStyle = document.documentElement.style;
        for (const name of ROOT_PROPERTIES) {
            this.originalProperties.set(name, {
                value: rootStyle.getPropertyValue(name),
                priority: rootStyle.getPropertyPriority(name),
            });
        }
    }

    private readBaselineFamilies(): Record<FontTarget, string> {
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
        return {
            ui: baselineUi,
            content: resolveReferences(computed.getPropertyValue("--b3-font-family-editor"), baselineProtyle, {"--b3-font-family-protyle": baselineProtyle}),
            mono: resolveReferences(computed.getPropertyValue("--b3-font-family-editor-code"), baselineCode, {"--b3-font-family-code": baselineCode}),
            graph: computed.getPropertyValue("--b3-font-family-graph").trim() || "arial",
            emoji: computed.getPropertyValue("--b3-font-family-emoji").trim() || SIYUAN_EMOJI_FALLBACK,
            math: computed.getPropertyValue("--b3-font-family-math").trim() || "KaTeX_Math",
            mermaid: "sans-serif",
        };
    }

    refreshBaselines(): void {
        this.restoreRoot();
        this.baselineFamilies = this.readBaselineFamilies();
    }

    getBaselineFamily(target: FontTarget): string {
        return this.baselineFamilies[target];
    }

    apply(state: PluginState, loadedIds: Set<string>): void {
        this.restoreRoot();
        const root = document.documentElement.style;
        const effectiveChoices = (choices: FontChoice[]) => isOnlySiyuanDefault(choices) ? [] : choices;
        const ui = familyForChoices(effectiveChoices(state.targets.ui.fonts), state.fonts, loadedIds, runtimeFamily, this.baselineFamilies.ui);
        const content = familyForChoices(effectiveChoices(state.targets.content.fonts), state.fonts, loadedIds, runtimeFamily, this.baselineFamilies.content);
        const mono = familyForChoices(effectiveChoices(state.targets.mono.fonts), state.fonts, loadedIds, runtimeFamily, this.baselineFamilies.mono);
        const graph = familyForChoices(effectiveChoices(state.targets.graph.fonts), state.fonts, loadedIds, runtimeFamily, this.baselineFamilies.graph);
        const restrictedEmoji = restrictedEmojiFamilies(effectiveChoices(state.targets.emoji.fonts), state.fonts, loadedIds, this.baselineFamilies.emoji);
        const emoji = restrictedEmoji.family;
        const math = familyForChoices(effectiveChoices(state.targets.math.fonts), state.fonts, loadedIds, runtimeFamily, this.baselineFamilies.math);
        const weights = {
            ui: weightForChoices(effectiveChoices(state.targets.ui.fonts), state.fonts),
            content: weightForChoices(effectiveChoices(state.targets.content.fonts), state.fonts),
            mono: weightForChoices(effectiveChoices(state.targets.mono.fonts), state.fonts),
        };

        if (ui) root.setProperty("--b3-font-family", `${ui}, "Emojis Additional", "Emojis Reset", system-ui, sans-serif`, "important");
        if (content) {
            const contentStack = `${content}, ${this.baselineFamilies.content}`;
            root.setProperty("--b3-font-family-protyle", contentStack, "important");
            root.setProperty("--b3-font-family-editor", contentStack, "important");
        }
        else if (ui) root.setProperty("--b3-font-family-protyle", this.baselineFamilies.content, "important");
        if (mono) {
            const monoStack = `${mono}, ui-monospace, Consolas, monospace`;
            root.setProperty("--b3-font-family-code", monoStack, "important");
            root.setProperty("--b3-font-family-editor-code", monoStack, "important");
        }
        else if (ui) root.setProperty("--b3-font-family-code", this.baselineFamilies.mono, "important");
        if (weights.mono !== null) root.setProperty("--b3-font-weight-editor-code", String(weights.mono), "important");
        if (graph) root.setProperty("--b3-font-family-graph", `${graph}, ${this.baselineFamilies.graph}`, "important");
        if (emoji) root.setProperty("--b3-font-family-emoji", `${emoji}, ${this.baselineFamilies.emoji}`, "important");
        if (state.targets.ui.size !== null) root.setProperty("--b3-font-size", `${state.targets.ui.size}px`, "important");
        if (state.targets.content.size !== null) root.setProperty("--b3-font-size-editor", `${state.targets.content.size}px`, "important");

        let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
        if (!style) {
            style = document.createElement("style");
            style.id = STYLE_ID;
            document.head.appendChild(style);
        }
        const monoBlock = state.targets.mono.decoupled ? familyForChoices(state.targets.mono.secondary?.fonts || [], state.fonts, loadedIds, runtimeFamily, this.baselineFamilies.mono) || this.baselineFamilies.mono : mono;
        const mathBlock = state.targets.math.decoupled
            ? familyForChoices(effectiveChoices(state.targets.math.secondary?.fonts || []), state.fonts, loadedIds, runtimeFamily, this.baselineFamilies.math)
            : null;
        const monoBlockWeight = state.targets.mono.decoupled
            ? weightForChoices(state.targets.mono.secondary?.fonts || [], state.fonts)
            : weights.mono;
        style.textContent = [...restrictedEmoji.faceRules, this.buildRules(state, {ui, content, mono, graph, emoji, math, mermaid: null}, {monoBlock, mathBlock}, weights, monoBlockWeight)].filter(Boolean).join("\n");
    }

    destroy(): void {
        this.restoreRoot();
        document.getElementById(STYLE_ID)?.remove();
    }

    private buildRules(state: PluginState, families: Record<FontTarget, string | null>, separated: {monoBlock: string | null; mathBlock: string | null}, weights: {ui: number | null; content: number | null; mono: number | null}, monoBlockWeight: number | null): string {
        const rules: string[] = [];
        if (weights.ui !== null) rules.push(`body { font-weight: ${weights.ui}; }`);
        if (weights.content !== null) rules.push(`.b3-typography:not(.b3-typography--default), .protyle-wysiwyg, .protyle-title { font-weight: ${weights.content}; }`);
        if (weights.mono !== null) rules.push(`.b3-typography code:not(.hljs), .protyle-wysiwyg span[data-type~="code"] { font-weight: ${weights.mono}; }`);
        if (families.emoji) {
            rules.push(`.b3-typography:not(.b3-typography--default),
.protyle-wysiwyg,
.protyle-title { font-family: ${families.emoji}, var(--b3-font-family-protyle) !important; }`);
        }
        if (state.targets.mono.decoupled && separated.monoBlock) {
            rules.push(`${MONO_BLOCK_SELECTORS} { font-family: ${separated.monoBlock}, ui-monospace, Consolas, monospace !important;${monoBlockWeight === null ? "" : ` font-weight: ${monoBlockWeight};`} }`);
        } else if (monoBlockWeight !== null) {
            rules.push(`${MONO_BLOCK_SELECTORS} { font-weight: ${monoBlockWeight}; }`);
        }
        if (families.math) {
            const mathFamily = `${families.math}, ${this.baselineFamilies.math}`;
            const mathRoot = state.targets.math.decoupled ? ".katex:not(.katex-display .katex)" : ".katex";
            rules.push(`${safeMathSelectors(mathRoot)} { font-family: ${mathFamily} !important; }`);
        }
        if (separated.mathBlock) {
            const mathBlockFamily = `${separated.mathBlock}, ${this.baselineFamilies.math}`;
            rules.push(`${safeMathSelectors(".katex-display .katex")} { font-family: ${mathBlockFamily} !important; }`);
        }
        if (state.targets.ui.size !== null) {
            rules.push(`body > .fn__flex-1, .b3-menu, .b3-dialog, .b3-text-field, .b3-select, .b3-button, .layout-tab-bar { font-size: ${state.targets.ui.size}px !important; }`);
        }
        if (state.targets.mono.size !== null) {
            rules.push(`.b3-typography code:not(.hljs), .protyle-wysiwyg span[data-type~="code"] { font-size: ${state.targets.mono.size}px !important; }`);
        }
        const monoBlockSize = state.targets.mono.decoupled ? state.targets.mono.secondary?.size : state.targets.mono.size;
        if (monoBlockSize !== null && monoBlockSize !== undefined) {
            rules.push(`${MONO_BLOCK_SELECTORS} { font-size: ${monoBlockSize}px !important; }`);
        }
        if (state.targets.math.size !== null) {
            rules.push(`.b3-typography .katex, .protyle-wysiwyg .katex { font-size: ${state.targets.math.size}px !important; }`);
        }
        const mathBlockSize = state.targets.math.decoupled ? state.targets.math.secondary?.size : null;
        if (mathBlockSize !== null && mathBlockSize !== undefined) rules.push(`.b3-typography .katex-display .katex, .protyle-wysiwyg .katex-display .katex { font-size: ${mathBlockSize}px !important; }`);
        return rules.join("\n");
    }

    private restoreRoot(): void {
        const root = document.documentElement.style;
        for (const [name, original] of this.originalProperties) {
            if (original.value) root.setProperty(name, original.value, original.priority);
            else root.removeProperty(name);
        }
    }
}

function isOnlySiyuanDefault(choices: FontChoice[]): boolean {
    return choices.length === 1 && choices[0].kind === "default";
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
