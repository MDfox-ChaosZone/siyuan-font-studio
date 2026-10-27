import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {StyleManager, STYLE_ID} from "../src/style-manager";
import {parseState} from "../src/state";
import {DEFAULT_STATE, ImportedFont} from "../src/types";
import {EDITOR_FAMILY, EMOJI_RESET, rootVars, rules, stubStyleDocument} from "./style-helpers";

afterEach(() => vi.unstubAllGlobals());
beforeEach(() => vi.stubGlobal("window", {siyuan: {config: {system: {kernelVersion: "3.8.6"}}}}));

const ORIGINAL_STACKS = {
    "--b3-font-family": "Original UI",
    "--b3-font-family-protyle": "var(--b3-font-family)",
    "--b3-font-family-code": '"Original Mono", var(--b3-font-family)',
};

describe("font target isolation", () => {
    it("uses SiYuan's official font stacks when theme variables are not ready yet", () => {
        stubStyleDocument();
        const manager = new StyleManager();

        expect(manager.getBaselineFamily("ui")).toContain("BlinkMacSystemFont");
        expect(manager.getBaselineFamily("content")).toContain("BlinkMacSystemFont");
        expect(manager.getBaselineFamily("mono")).toContain("JetBrainsMono-Regular");
        expect(manager.getBaselineFamily("emoji")).toBe('"Emojis Additional", emojis');
        expect(manager.getBaselineFamily("math")).toBe("KaTeX_Math");
        expect(manager.getBaselineFamily("mermaid")).toBe("sans-serif");
        expect(manager.getBaselineFamily("mindmap")).toBe(manager.getBaselineFamily("content"));
    });

    it("writes its rules to a style element that SiYuan's export copies", () => {
        const style = stubStyleDocument(ORIGINAL_STACKS);
        const state = structuredClone(DEFAULT_STATE);
        state.targets.ui.fonts = [{kind: "system", family: "Custom UI", displayName: "Custom UI", weight: 400}];
        new StyleManager().apply(state, new Set());

        expect(style.id).toBe(STYLE_ID);
        expect(STYLE_ID.startsWith("snippetCSS")).toBe(true);
    });

    it("freezes the original content and code stacks when only the interface font changes", () => {
        const style = stubStyleDocument(ORIGINAL_STACKS);
        const state = structuredClone(DEFAULT_STATE);
        state.targets.ui.fonts = [{kind: "system", family: "Custom UI", displayName: "Custom UI", weight: 400}];
        new StyleManager().apply(state, new Set());
        const vars = rootVars(style.textContent);

        expect(vars.get("--b3-font-family")).toBe(`${EMOJI_RESET}, "Custom UI", Original UI`);
        expect(vars.get("--b3-font-family-protyle")).toBe("Original UI");
        expect(vars.get("--b3-font-family-code")).toBe('"Original Mono", Original UI');
        expect(rules(style.textContent)).not.toContain("font-family");
        expect(rules(style.textContent)).not.toContain(".protyle-wysiwyg");
    });

    it("uses the official editor variable and applies the selected base weights", () => {
        const style = stubStyleDocument(ORIGINAL_STACKS);
        const state = structuredClone(DEFAULT_STATE);
        state.targets.ui.fonts = [{kind: "system", family: "Custom UI", displayName: "Custom UI Bold", weight: 700}];
        state.targets.content.fonts = [{kind: "system", family: "Custom Content", displayName: "Custom Content Medium", weight: 500}];
        new StyleManager().apply(state, new Set());
        const vars = rootVars(style.textContent);

        expect(vars.get("--b3-font-family-protyle")).toBe(`${EMOJI_RESET}, "Custom Content", Original UI`);
        expect(vars.get("--b3-font-family-editor")).toBe(`${EMOJI_RESET}, "Custom Content", Original UI`);
        expect(vars.get("--b3-font-family-code")).toBe('"Original Mono", Original UI');
        expect(style.textContent).toContain("body, button, input, select, textarea { font-weight: 700; }");
        expect(style.textContent).toContain(".protyle-wysiwyg, .protyle-title { font-weight: 500; }");
        expect(rules(style.textContent)).not.toContain('font-family: "Custom Content"');
    });

    it("writes each configured category only to its own SiYuan variable", () => {
        const cases = [
            ["content", ["--b3-font-family-protyle", "--b3-font-family-editor"]],
            ["mono", ["--b3-font-family-code", "--b3-font-family-editor-code", "--b3-font-weight-editor-code"]],
            ["graph", ["--b3-font-family-graph", "--bfm-font-weight-graph"]],
            ["emoji", ["--b3-font-family-emoji"]],
        ] as const;

        for (const [target, expectedProperties] of cases) {
            const style = stubStyleDocument({
                ...ORIGINAL_STACKS,
                "--b3-font-family-graph": "Original Graph",
                "--b3-font-family-emoji": "Original Emoji",
                "--b3-font-family-math": "Original Math",
            });
            const state = structuredClone(DEFAULT_STATE);
            state.targets[target].fonts = [{kind: "system", family: `Only ${target}`, displayName: `Only ${target}`, weight: 400}];

            new StyleManager().apply(state, new Set());

            expect(Array.from(rootVars(style.textContent).keys())).toEqual(expectedProperties);
        }
    });

    it("uses and overrides SiYuan 3.8.2 editor and monospace variables", () => {
        const style = stubStyleDocument({
            "--b3-font-family": "Original UI",
            "--b3-font-family-protyle": "Original Theme Content",
            "--b3-font-family-editor": '"Native Content A", "Native Content B"',
            "--b3-font-family-code": "Original Theme Mono",
            "--b3-font-family-editor-code": '"Native Mono"',
        });
        const state = structuredClone(DEFAULT_STATE);
        state.targets.content.fonts = [{kind: "system", family: "Plugin Content", displayName: "Plugin Content", weight: 500}];
        state.targets.mono.fonts = [{kind: "system", family: "Plugin Mono", displayName: "Plugin Mono", weight: 600}];
        state.targets.mono.decoupled = true;
        state.targets.mono.secondary = {fonts: [{kind: "system", family: "Plugin Block Mono", displayName: "Plugin Block Mono", weight: 700}], size: 15};

        const manager = new StyleManager();
        expect(manager.getBaselineFamily("content")).toBe('"Native Content A", "Native Content B"');
        expect(manager.getBaselineFamily("mono")).toBe('"Native Mono"');
        manager.apply(state, new Set());
        const vars = rootVars(style.textContent);

        expect(vars.get("--b3-font-family-editor")).toBe(`${EMOJI_RESET}, "Plugin Content", "Native Content A", "Native Content B"`);
        expect(vars.get("--b3-font-family-editor-code")).toBe(`${EMOJI_RESET}, "Plugin Mono", "Native Mono"`);
        expect(vars.get("--b3-font-weight-editor-code")).toBe("600");
        expect(style.textContent).toContain('textarea[style*="--b3-font-family-editor-code"]');
        expect(style.textContent).toContain(`font-family: ${EMOJI_RESET}, "Plugin Block Mono", "Native Mono" !important;`);
    });

    it("keeps SiYuan's native editor font behind emoji and heading fonts", () => {
        const style = stubStyleDocument({"--b3-font-family-emoji": "Original Emoji"});
        const state = structuredClone(DEFAULT_STATE);
        state.targets.emoji.fonts = [{kind: "system", family: "Emoji Font", displayName: "Emoji Font", weight: 400}];
        state.targets.h2.fonts = [{kind: "system", family: "Heading", displayName: "Heading", weight: 600}];
        new StyleManager().apply(state, new Set());

        expect(style.textContent).toContain(`.protyle-title { font-family: "BFM_EMOJI_SYSTEM_0", ${EDITOR_FAMILY} !important; }`);
        expect(style.textContent).toContain(`font-family: "BFM_EMOJI_SYSTEM_0", "Heading", ${EDITOR_FAMILY} !important;`);
        expect(style.textContent).not.toContain("var(--b3-font-family-protyle) !important");
    });

    it("isolates advanced categories and preserves KaTeX structural fonts", () => {
        const style = stubStyleDocument({
            "--b3-font-family": "Original UI",
            "--b3-font-family-graph": "Original Graph",
            "--b3-font-family-emoji": "Original Emoji",
            "--b3-font-family-math": "Original Math",
        });
        const state = structuredClone(DEFAULT_STATE);
        state.targets.graph.fonts = [{kind: "system", family: "Graph Font", displayName: "Graph Font", weight: 400}];
        state.targets.emoji.fonts = [{kind: "system", family: "Emoji Font", displayName: "Emoji Font", weight: 400}];
        state.targets.math.fonts = [{kind: "system", family: "Math Font", displayName: "Math Font", weight: 400}];
        state.targets.math.size = 20;
        new StyleManager().apply(state, new Set());
        const vars = rootVars(style.textContent);
        const css = rules(style.textContent);

        expect(vars.get("--b3-font-family-graph")).toBe('"Graph Font", Original Graph');
        expect(vars.get("--b3-font-family-emoji")).toBe('"BFM_EMOJI_SYSTEM_0", Original Emoji');
        expect(vars.has("--b3-font-family-math")).toBe(false);
        expect(css).toContain('@font-face { font-family: "BFM_EMOJI_SYSTEM_0"; src: local("Emoji Font")');
        expect(css).toContain("unicode-range: U+231A-231B");
        expect(css).toContain("U+2600-2604");
        expect(css).not.toContain("U+2600-27BF");
        expect(css).not.toContain("font-variant-emoji");
        expect(css).toContain(".protyle-wysiwyg .katex");
        expect(css).toContain(".protyle-wysiwyg .katex .mord:not(.sqrt):not(.delimsizing)");
        expect(css).toContain(".protyle-wysiwyg .katex .mop:not(.op-symbol)");
        expect(css).toContain('font-family: "Math Font", Original Math !important');
        expect(css).not.toContain(".katex-html *");
        expect(css).not.toContain(".op-symbol {");
        expect(css).not.toContain(".mopen");
        expect(css).not.toContain(".mclose");
        expect(css).not.toContain('font-family: "Graph Font"');
        expect(css).not.toContain(".emojis__item");
        expect(css).toContain("font-size: 20px !important");
    });

    it("treats a sole SiYuan default choice as a true no-op for emoji and math", () => {
        const style = stubStyleDocument({"--b3-font-family-emoji": "Original Emoji", "--b3-font-family-math": "Original Math"});
        const state = structuredClone(DEFAULT_STATE);
        state.targets.emoji.fonts = [{kind: "default"}];
        state.targets.math.fonts = [{kind: "default"}];
        new StyleManager().apply(state, new Set());

        expect(style.textContent).toBe("");
    });

    it("uses separate block font and size settings when enabled", () => {
        const style = stubStyleDocument({"--b3-font-family-code": "Original Mono", "--b3-font-family-math": "Original Math"});
        const state = structuredClone(DEFAULT_STATE);
        state.targets.mono.fonts = [{kind: "system", family: "Inline Mono", displayName: "Inline Mono", weight: 400}];
        state.targets.mono.decoupled = true;
        state.targets.mono.secondary = {fonts: [{kind: "system", family: "Block Mono", displayName: "Block Mono", weight: 400}], size: 15};
        state.targets.math.fonts = [{kind: "system", family: "Inline Math", displayName: "Inline Math", weight: 400}];
        state.targets.math.decoupled = true;
        state.targets.math.secondary = {fonts: [{kind: "system", family: "Block Math", displayName: "Block Math", weight: 400}], size: 18};
        new StyleManager().apply(state, new Set());
        const vars = rootVars(style.textContent);
        const css = rules(style.textContent);

        expect(vars.get("--b3-font-family-code")).toBe(`${EMOJI_RESET}, "Inline Mono", Original Mono`);
        expect(vars.get("--b3-font-family-editor-code")).toBe(`${EMOJI_RESET}, "Inline Mono", Original Mono`);
        expect(vars.get("--b3-font-weight-editor-code")).toBe("400");
        expect(css).not.toContain('"Inline Mono"');
        expect(css).toContain(`font-family: ${EMOJI_RESET}, "Block Mono", Original Mono !important;`);
        expect(css).toContain('textarea[style*="--b3-font-family-editor-code"]');
        expect(css).toContain("font-size: 15px");
        // SiYuan's px line height is derived from its own editor size, so a custom code size needs a relative one.
        expect(css).toContain(".protyle-wysiwyg .code-block { line-height: 1.625 !important; }");
        expect(css).toContain(".katex:not(.katex-display .katex) .mord:not(.sqrt):not(.delimsizing)");
        expect(css).toContain(".katex-display .katex .mord:not(.sqrt):not(.delimsizing)");
        expect(css).toContain('font-family: "Inline Math", Original Math !important');
        expect(css).toContain('font-family: "Block Math", Original Math !important');
    });

    it("applies selected variable weights to monospace, math, graph and Mermaid renderers", () => {
        const style = stubStyleDocument();
        const variableFont: ImportedFont = {
            id: "variable",
            displayName: "Variable",
            originalName: "Variable.woff2",
            storageName: "Variable__font.woff2",
            extension: "woff2",
            size: 123,
            sha256: "variable-hash",
            importedAt: "2026-01-01T00:00:00.000Z",
            fontWeight: 400,
            variationAxes: {wght: {name: "Weight", min: 100, default: 400, max: 900}},
        };
        const state = structuredClone(DEFAULT_STATE);
        state.fonts = [variableFont];
        state.targets.mono.fonts = [{kind: "imported", id: variableFont.id, weight: 610}];
        state.targets.math.fonts = [{kind: "imported", id: variableFont.id, weight: 620}];
        state.targets.graph.fonts = [{kind: "imported", id: variableFont.id, weight: 630}];
        state.targets.mermaid.fonts = [{kind: "imported", id: variableFont.id, weight: 640}];

        new StyleManager().apply(state, new Set([variableFont.id]));
        const vars = rootVars(style.textContent);

        expect(vars.get("--b3-font-weight-editor-code")).toBe("610");
        expect(vars.get("--bfm-font-weight-graph")).toBe("630");
        expect(style.textContent).toContain('span[data-type~="code"] { font-weight: 610 !important; }');
        expect(style.textContent).toContain('[data-subtype="mermaid"] svg { font-weight: 640 !important; }');
        expect(style.textContent).toContain("font-weight: 620 !important;");
    });

    it("applies a variable axis when a variable math font follows the SiYuan default", () => {
        const style = stubStyleDocument({"--b3-font-family-math": "KaTeX_Math"});
        const variableFont: ImportedFont = {
            id: "math-fallback",
            displayName: "Math Fallback",
            originalName: "MathFallback.woff2",
            storageName: "MathFallback__font.woff2",
            extension: "woff2",
            size: 123,
            sha256: "math-fallback-hash",
            importedAt: "2026-01-01T00:00:00.000Z",
            fontWeight: 400,
            variationAxes: {wght: {name: "Weight", min: 150, default: 330, max: 700}},
        };
        const state = structuredClone(DEFAULT_STATE);
        state.fonts = [variableFont];
        state.targets.math.fonts = [
            {kind: "default"},
            {kind: "imported", id: variableFont.id, weight: 615},
        ];

        new StyleManager().apply(state, new Set([variableFont.id]));

        expect(style.textContent).toContain(".protyle-wysiwyg .katex .cjk_fallback");
        expect(style.textContent).not.toContain(".protyle-wysiwyg .katex .mbin");
        expect(style.textContent).not.toContain(".protyle-wysiwyg .katex .mrel");
        expect(style.textContent).toContain(`font-family: "BFM_math-fallback", ${EDITOR_FAMILY} !important;`);
        expect(style.textContent).toContain('font-variation-settings: "wght" 615 !important;');
    });

    it("reads baselines without its own overrides and reports changes", () => {
        const style = stubStyleDocument(ORIGINAL_STACKS);
        const manager = new StyleManager();
        const state = structuredClone(DEFAULT_STATE);
        state.targets.ui.fonts = [{kind: "system", family: "Custom UI", displayName: "Custom UI", weight: 400}];
        manager.apply(state, new Set());
        let disabledWhileReading = false;
        vi.stubGlobal("getComputedStyle", () => ({
            getPropertyValue: (name: string) => {
                disabledWhileReading ||= style.disabled;
                return ({...ORIGINAL_STACKS, "--b3-font-family": "Theme UI"} as Record<string, string>)[name] || "";
            },
        }));

        expect(manager.refreshBaselines()).toBe(true);
        expect(disabledWhileReading).toBe(true);
        expect(style.disabled).toBe(false);
        expect(manager.refreshBaselines()).toBe(false);
        expect(manager.getBaselineFamily("ui")).toBe("Theme UI");
    });

    it("only overrides the editor font size through CSS when asked to", () => {
        const style = stubStyleDocument();
        const state = structuredClone(DEFAULT_STATE);
        state.targets.content.size = 18;
        const manager = new StyleManager();
        manager.apply(state, new Set());
        expect(rootVars(style.textContent).has("--b3-font-size-editor")).toBe(false);
        manager.apply(state, new Set(), new Set(), {cssEditorFontSize: true});
        expect(rootVars(style.textContent).get("--b3-font-size-editor")).toBe("18px");
        expect(style.textContent).toContain(".code-block { line-height: 1.625 !important; }");
    });
});

describe("content options", () => {
    it("applies the bold weight and faux-style switch to documents", () => {
        const style = stubStyleDocument();
        const state = parseState(null);
        state.targets.content.options = {boldWeight: 600, noSynthesis: true};
        new StyleManager().apply(state, new Set());
        const css = style.textContent;

        expect(css).toContain('span[data-type~="strong"], .b3-typography:not(.b3-typography--default) strong, .b3-typography:not(.b3-typography--default) b { font-weight: 600; }');
        expect(css).toContain(".protyle-title { font-synthesis: none; }");
        expect(css).not.toContain("letter-spacing");
        expect(css).not.toContain("text-indent");
    });
});
