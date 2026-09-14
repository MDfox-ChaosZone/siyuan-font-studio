import {afterEach, describe, expect, it, vi} from "vitest";
import {StyleManager} from "../src/style-manager";
import {DEFAULT_STATE, ImportedFont} from "../src/types";

afterEach(() => vi.unstubAllGlobals());

describe("font target isolation", () => {
    it("uses SiYuan's official font stacks when theme variables are not ready yet", () => {
        const rootStyle = {
            getPropertyValue: () => "",
            getPropertyPriority: () => "",
            setProperty: vi.fn(),
            removeProperty: vi.fn(),
        };
        vi.stubGlobal("document", {documentElement: {style: rootStyle}});
        vi.stubGlobal("getComputedStyle", () => ({getPropertyValue: () => ""}));

        const manager = new StyleManager();

        expect(manager.getBaselineFamily("ui")).toContain("BlinkMacSystemFont");
        expect(manager.getBaselineFamily("content")).toContain("BlinkMacSystemFont");
        expect(manager.getBaselineFamily("mono")).toContain("JetBrainsMono-Regular");
        expect(manager.getBaselineFamily("emoji")).toBe('"Emojis Additional", emojis');
        expect(manager.getBaselineFamily("math")).toBe("KaTeX_Math");
        expect(manager.getBaselineFamily("mermaid")).toBe("sans-serif");
    });

    it("freezes the original content and code stacks when only the interface font changes", () => {
        const properties = new Map<string, string>();
        const setProperty = vi.fn((name: string, value: string) => properties.set(name, value));
        const rootStyle = {
            getPropertyValue: (name: string) => properties.get(name) || "",
            getPropertyPriority: () => "",
            setProperty,
            removeProperty: (name: string) => properties.delete(name),
        };
        const generatedStyle = {id: "", textContent: "", remove: vi.fn()};
        vi.stubGlobal("document", {
            documentElement: {style: rootStyle},
            head: {appendChild: vi.fn()},
            getElementById: vi.fn().mockReturnValue(null),
            createElement: vi.fn().mockReturnValue(generatedStyle),
        });
        vi.stubGlobal("getComputedStyle", () => ({
            getPropertyValue: (name: string) => ({
                "--b3-font-family": "Original UI",
                "--b3-font-family-protyle": "var(--b3-font-family)",
                "--b3-font-family-code": '"Original Mono", var(--b3-font-family)',
            }[name] || ""),
        }));

        const state = structuredClone(DEFAULT_STATE);
        state.targets.ui.fonts = [{kind: "system", family: "Custom UI", displayName: "Custom UI", weight: 400}];
        new StyleManager().apply(state, new Set());

        expect(setProperty).toHaveBeenCalledWith("--b3-font-family-protyle", "Original UI", "important");
        expect(setProperty).toHaveBeenCalledWith("--b3-font-family-code", '"Original Mono", Original UI', "important");
        expect(generatedStyle.textContent).not.toContain("font-family: \"Custom UI\"");
        expect(generatedStyle.textContent).not.toContain(".protyle-wysiwyg");
    });

    it("uses the official editor variable and applies the selected base weight", () => {
        const properties = new Map<string, string>();
        const setProperty = vi.fn((name: string, value: string) => properties.set(name, value));
        const rootStyle = {
            getPropertyValue: (name: string) => properties.get(name) || "",
            getPropertyPriority: () => "",
            setProperty,
            removeProperty: (name: string) => properties.delete(name),
        };
        const generatedStyle = {id: "", textContent: "", remove: vi.fn()};
        vi.stubGlobal("document", {
            documentElement: {style: rootStyle},
            head: {appendChild: vi.fn()},
            getElementById: vi.fn().mockReturnValue(null),
            createElement: vi.fn().mockReturnValue(generatedStyle),
        });
        vi.stubGlobal("getComputedStyle", () => ({
            getPropertyValue: (name: string) => ({
                "--b3-font-family": "Original UI",
                "--b3-font-family-protyle": "var(--b3-font-family)",
                "--b3-font-family-code": '"Original Mono", var(--b3-font-family)',
            }[name] || ""),
        }));

        const state = structuredClone(DEFAULT_STATE);
        state.targets.ui.fonts = [{kind: "system", family: "Custom UI", displayName: "Custom UI Bold", weight: 700}];
        state.targets.content.fonts = [{kind: "system", family: "Custom Content", displayName: "Custom Content Medium", weight: 500}];
        new StyleManager().apply(state, new Set());

        expect(setProperty).toHaveBeenCalledWith("--b3-font-family-protyle", '"Custom Content", Original UI', "important");
        expect(setProperty).toHaveBeenCalledWith("--b3-font-family-editor", '"Custom Content", Original UI', "important");
        expect(setProperty).toHaveBeenCalledWith("--b3-font-family-code", '"Original Mono", Original UI', "important");
        expect(generatedStyle.textContent).toContain('body { font-weight: 700; }');
        expect(generatedStyle.textContent).toContain('.protyle-wysiwyg, .protyle-title { font-weight: 500; }');
        expect(generatedStyle.textContent).not.toContain('font-family: "Custom Content"');
        expect(generatedStyle.textContent).not.toContain('font-family: "Custom UI"');
    });

    it("writes each configured category only to its own SiYuan variable", () => {
        const cases = [
            ["content", ["--b3-font-family-protyle", "--b3-font-family-editor"]],
            ["mono", ["--b3-font-family-code", "--b3-font-family-editor-code", "--b3-font-weight-editor-code"]],
            ["graph", ["--b3-font-family-graph", "--bfm-font-weight-graph"]],
            ["emoji", ["--b3-font-family-emoji"]],
        ] as const;

        for (const [target, expectedProperties] of cases) {
            const properties = new Map<string, string>();
            const setProperty = vi.fn((name: string, value: string) => properties.set(name, value));
            const rootStyle = {
                getPropertyValue: (name: string) => properties.get(name) || "",
                getPropertyPriority: () => "",
                setProperty,
                removeProperty: (name: string) => properties.delete(name),
            };
            vi.stubGlobal("document", {
                documentElement: {style: rootStyle},
                head: {appendChild: vi.fn()},
                getElementById: vi.fn().mockReturnValue(null),
                createElement: vi.fn().mockReturnValue({id: "", textContent: "", remove: vi.fn()}),
            });
            vi.stubGlobal("getComputedStyle", () => ({
                getPropertyValue: (name: string) => ({
                    "--b3-font-family": "Original UI",
                    "--b3-font-family-protyle": "var(--b3-font-family)",
                    "--b3-font-family-code": '"Original Mono", var(--b3-font-family)',
                    "--b3-font-family-graph": "Original Graph",
                    "--b3-font-family-emoji": "Original Emoji",
                    "--b3-font-family-math": "Original Math",
                }[name] || ""),
            }));
            const state = structuredClone(DEFAULT_STATE);
            state.targets[target].fonts = [{kind: "system", family: `Only ${target}`, displayName: `Only ${target}`, weight: 400}];

            new StyleManager().apply(state, new Set());

            expect(Array.from(new Set(setProperty.mock.calls.map(([name]) => name)))).toEqual(expectedProperties);
        }
    });

    it("uses and overrides SiYuan 3.8.2 editor and monospace variables", () => {
        const properties = new Map<string, string>();
        const setProperty = vi.fn((name: string, value: string) => properties.set(name, value));
        const rootStyle = {
            getPropertyValue: (name: string) => properties.get(name) || "",
            getPropertyPriority: () => "",
            setProperty,
            removeProperty: (name: string) => properties.delete(name),
        };
        const generatedStyle = {id: "", textContent: "", remove: vi.fn()};
        vi.stubGlobal("document", {
            documentElement: {style: rootStyle},
            head: {appendChild: vi.fn()},
            getElementById: vi.fn().mockReturnValue(null),
            createElement: vi.fn().mockReturnValue(generatedStyle),
        });
        vi.stubGlobal("getComputedStyle", () => ({
            getPropertyValue: (name: string) => ({
                "--b3-font-family": "Original UI",
                "--b3-font-family-protyle": "Original Theme Content",
                "--b3-font-family-editor": '"Native Content A", "Native Content B"',
                "--b3-font-family-code": "Original Theme Mono",
                "--b3-font-family-editor-code": '"Native Mono"',
            }[name] || ""),
        }));

        const state = structuredClone(DEFAULT_STATE);
        state.targets.content.fonts = [{kind: "system", family: "Plugin Content", displayName: "Plugin Content", weight: 500}];
        state.targets.mono.fonts = [{kind: "system", family: "Plugin Mono", displayName: "Plugin Mono", weight: 600}];
        state.targets.mono.decoupled = true;
        state.targets.mono.secondary = {fonts: [{kind: "system", family: "Plugin Block Mono", displayName: "Plugin Block Mono", weight: 700}], size: 15};

        const manager = new StyleManager();
        expect(manager.getBaselineFamily("content")).toBe('"Native Content A", "Native Content B"');
        expect(manager.getBaselineFamily("mono")).toBe('"Native Mono"');
        manager.apply(state, new Set());

        expect(setProperty).toHaveBeenCalledWith("--b3-font-family-editor", '"Plugin Content", "Native Content A", "Native Content B"', "important");
        expect(setProperty).toHaveBeenCalledWith("--b3-font-family-editor-code", '"Plugin Mono", ui-monospace, Consolas, monospace', "important");
        expect(setProperty).toHaveBeenCalledWith("--b3-font-weight-editor-code", "600", "important");
        expect(generatedStyle.textContent).toContain('textarea[style*="--b3-font-family-editor-code"]');
        expect(generatedStyle.textContent).toContain('font-family: "Plugin Block Mono", ui-monospace');
    });

    it("isolates advanced categories and preserves KaTeX structural fonts", () => {
        const properties = new Map<string, string>();
        const setProperty = vi.fn((name: string, value: string) => properties.set(name, value));
        const rootStyle = {
            getPropertyValue: (name: string) => properties.get(name) || "",
            getPropertyPriority: () => "",
            setProperty,
            removeProperty: (name: string) => properties.delete(name),
        };
        const generatedStyle = {id: "", textContent: "", remove: vi.fn()};
        vi.stubGlobal("document", {
            documentElement: {style: rootStyle},
            head: {appendChild: vi.fn()},
            getElementById: vi.fn().mockReturnValue(null),
            createElement: vi.fn().mockReturnValue(generatedStyle),
        });
        vi.stubGlobal("getComputedStyle", () => ({
            getPropertyValue: (name: string) => ({
                "--b3-font-family": "Original UI",
                "--b3-font-family-graph": "Original Graph",
                "--b3-font-family-emoji": "Original Emoji",
                "--b3-font-family-math": "Original Math",
            }[name] || ""),
        }));

        const state = structuredClone(DEFAULT_STATE);
        state.targets.graph.fonts = [{kind: "system", family: "Graph Font", displayName: "Graph Font", weight: 400}];
        state.targets.emoji.fonts = [{kind: "system", family: "Emoji Font", displayName: "Emoji Font", weight: 400}];
        state.targets.math.fonts = [{kind: "system", family: "Math Font", displayName: "Math Font", weight: 400}];
        state.targets.math.size = 20;
        new StyleManager().apply(state, new Set());

        expect(setProperty).toHaveBeenCalledWith("--b3-font-family-graph", '"Graph Font", Original Graph', "important");
        expect(setProperty).toHaveBeenCalledWith("--b3-font-family-emoji", '"BFM_EMOJI_SYSTEM_0", Original Emoji', "important");
        expect(setProperty).not.toHaveBeenCalledWith("--b3-font-family-math", expect.anything(), expect.anything());
        expect(generatedStyle.textContent).toContain('@font-face { font-family: "BFM_EMOJI_SYSTEM_0"; src: local("Emoji Font")');
        expect(generatedStyle.textContent).toContain('unicode-range: U+231A-231B');
        expect(generatedStyle.textContent).toContain('U+2600-2604');
        expect(generatedStyle.textContent).not.toContain('U+2600-27BF');
        expect(generatedStyle.textContent).not.toContain('font-variant-emoji');
        expect(generatedStyle.textContent).toContain('font-family: "BFM_EMOJI_SYSTEM_0", var(--b3-font-family-protyle) !important');
        expect(generatedStyle.textContent).toContain('.protyle-wysiwyg .katex');
        expect(generatedStyle.textContent).toContain('.protyle-wysiwyg .katex .mord:not(.sqrt):not(.delimsizing)');
        expect(generatedStyle.textContent).toContain('.protyle-wysiwyg .katex .mop:not(.op-symbol)');
        expect(generatedStyle.textContent).toContain('font-family: "Math Font", Original Math !important');
        expect(generatedStyle.textContent).not.toContain('.katex-html *');
        expect(generatedStyle.textContent).not.toContain('.op-symbol {');
        expect(generatedStyle.textContent).not.toContain('.mopen');
        expect(generatedStyle.textContent).not.toContain('.mclose');
        expect(generatedStyle.textContent).not.toContain('font-family: "Graph Font"');
        expect(generatedStyle.textContent).not.toContain('.emojis__item');
        expect(generatedStyle.textContent).toContain('font-size: 20px !important');
    });

    it("treats a sole SiYuan default choice as a true no-op for emoji and math", () => {
        const rootStyle = {
            getPropertyValue: () => "",
            getPropertyPriority: () => "",
            setProperty: vi.fn(),
            removeProperty: vi.fn(),
        };
        const generatedStyle = {id: "", textContent: "", remove: vi.fn()};
        vi.stubGlobal("document", {
            documentElement: {style: rootStyle},
            head: {appendChild: vi.fn()},
            getElementById: vi.fn().mockReturnValue(null),
            createElement: vi.fn().mockReturnValue(generatedStyle),
        });
        vi.stubGlobal("getComputedStyle", () => ({
            getPropertyValue: (name: string) => ({
                "--b3-font-family-emoji": "Original Emoji",
                "--b3-font-family-math": "Original Math",
            }[name] || ""),
        }));

        const state = structuredClone(DEFAULT_STATE);
        state.targets.emoji.fonts = [{kind: "default"}];
        state.targets.math.fonts = [{kind: "default"}];
        new StyleManager().apply(state, new Set());

        expect(rootStyle.setProperty).not.toHaveBeenCalled();
        expect(generatedStyle.textContent).not.toContain("font-family");
        expect(generatedStyle.textContent).not.toContain("@font-face");
    });

    it("uses separate block font and size settings when enabled", () => {
        const properties = new Map<string, string>();
        const rootStyle = {getPropertyValue: (name: string) => properties.get(name) || "", getPropertyPriority: () => "", setProperty: vi.fn(), removeProperty: vi.fn()};
        const generatedStyle = {id: "", textContent: "", remove: vi.fn()};
        vi.stubGlobal("document", {documentElement: {style: rootStyle}, head: {appendChild: vi.fn()}, getElementById: vi.fn().mockReturnValue(null), createElement: vi.fn().mockReturnValue(generatedStyle)});
        vi.stubGlobal("getComputedStyle", () => ({getPropertyValue: (name: string) => ({"--b3-font-family-code": "Original Mono", "--b3-font-family-math": "Original Math"}[name] || "")}));
        const state = structuredClone(DEFAULT_STATE);
        state.targets.mono.fonts = [{kind: "system", family: "Inline Mono", displayName: "Inline Mono", weight: 400}];
        state.targets.mono.decoupled = true;
        state.targets.mono.secondary = {fonts: [{kind: "system", family: "Block Mono", displayName: "Block Mono", weight: 400}], size: 15};
        state.targets.math.fonts = [{kind: "system", family: "Inline Math", displayName: "Inline Math", weight: 400}];
        state.targets.math.decoupled = true;
        state.targets.math.secondary = {fonts: [{kind: "system", family: "Block Math", displayName: "Block Math", weight: 400}], size: 18};
        new StyleManager().apply(state, new Set());
        expect(rootStyle.setProperty).toHaveBeenCalledWith("--b3-font-family-code", '"Inline Mono", ui-monospace, Consolas, monospace', "important");
        expect(rootStyle.setProperty).toHaveBeenCalledWith("--b3-font-family-editor-code", '"Inline Mono", ui-monospace, Consolas, monospace', "important");
        expect(rootStyle.setProperty).toHaveBeenCalledWith("--b3-font-weight-editor-code", "400", "important");
        expect(generatedStyle.textContent).not.toContain('font-family: "Inline Mono"');
        expect(generatedStyle.textContent).toContain('font-family: "Block Mono", ui-monospace');
        expect(generatedStyle.textContent).toContain('textarea[style*="--b3-font-family-editor-code"]');
        expect(generatedStyle.textContent).not.toContain('.b3-chip');
        expect(generatedStyle.textContent).toContain('font-size: 15px');
        expect(generatedStyle.textContent).toContain('.katex:not(.katex-display .katex) .mord:not(.sqrt):not(.delimsizing)');
        expect(generatedStyle.textContent).toContain('.katex-display .katex .mord:not(.sqrt):not(.delimsizing)');
        expect(generatedStyle.textContent).toContain('font-family: "Inline Math", Original Math !important');
        expect(generatedStyle.textContent).toContain('font-family: "Block Math", Original Math !important');
        expect(generatedStyle.textContent).not.toContain('.katex-html *');
        expect(generatedStyle.textContent).not.toContain('.op-symbol {');
    });

    it("applies selected variable weights to monospace, math, graph and Mermaid renderers", () => {
        const properties = new Map<string, string>();
        const rootStyle = {
            getPropertyValue: (name: string) => properties.get(name) || "",
            getPropertyPriority: () => "",
            setProperty: vi.fn((name: string, value: string) => properties.set(name, value)),
            removeProperty: vi.fn((name: string) => properties.delete(name)),
        };
        const generatedStyle = {id: "", textContent: "", remove: vi.fn()};
        vi.stubGlobal("document", {
            documentElement: {style: rootStyle},
            head: {appendChild: vi.fn()},
            getElementById: vi.fn().mockReturnValue(null),
            createElement: vi.fn().mockReturnValue(generatedStyle),
        });
        vi.stubGlobal("getComputedStyle", () => ({getPropertyValue: () => ""}));

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

        expect(rootStyle.setProperty).toHaveBeenCalledWith("--b3-font-weight-editor-code", "610", "important");
        expect(rootStyle.setProperty).toHaveBeenCalledWith("--bfm-font-weight-graph", "630", "important");
        expect(generatedStyle.textContent).toContain('span[data-type~="code"] { font-weight: 610 !important; }');
        expect(generatedStyle.textContent).toContain('[data-subtype="mermaid"] svg { font-weight: 640 !important; }');
        expect(generatedStyle.textContent).toContain('font-weight: 620 !important;');
    });

    it("applies a variable axis when a variable math font follows the SiYuan default", () => {
        const properties = new Map<string, string>();
        const rootStyle = {
            getPropertyValue: (name: string) => properties.get(name) || "",
            getPropertyPriority: () => "",
            setProperty: vi.fn((name: string, value: string) => properties.set(name, value)),
            removeProperty: vi.fn((name: string) => properties.delete(name)),
        };
        const generatedStyle = {id: "", textContent: "", remove: vi.fn()};
        vi.stubGlobal("document", {
            documentElement: {style: rootStyle},
            head: {appendChild: vi.fn()},
            getElementById: vi.fn().mockReturnValue(null),
            createElement: vi.fn().mockReturnValue(generatedStyle),
        });
        vi.stubGlobal("getComputedStyle", () => ({getPropertyValue: (name: string) => name === "--b3-font-family-math" ? "KaTeX_Math" : ""}));

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

        expect(generatedStyle.textContent).toContain('.protyle-wysiwyg .katex .cjk_fallback');
        expect(generatedStyle.textContent).not.toContain('.protyle-wysiwyg .katex .mbin');
        expect(generatedStyle.textContent).not.toContain('.protyle-wysiwyg .katex .mrel');
        expect(generatedStyle.textContent).toContain('font-family: "BFM_math-fallback", var(--b3-font-family-protyle) !important;');
        expect(generatedStyle.textContent).toContain('font-variation-settings: "wght" 615 !important;');
    });
});
