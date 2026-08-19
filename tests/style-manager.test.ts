import {afterEach, describe, expect, it, vi} from "vitest";
import {StyleManager} from "../src/style-manager";
import {DEFAULT_STATE} from "../src/types";

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

    it("uses the official editor variable without injecting broad editor selectors", () => {
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
        state.targets.content.fonts = [{kind: "system", family: "Custom Content", displayName: "Custom Content", weight: 400}];
        new StyleManager().apply(state, new Set());

        expect(setProperty).toHaveBeenCalledWith("--b3-font-family-protyle", '"Custom Content", Original UI', "important");
        expect(setProperty).toHaveBeenCalledWith("--b3-font-family-code", '"Original Mono", Original UI', "important");
        expect(generatedStyle.textContent).not.toContain('.protyle-wysiwyg');
        expect(generatedStyle.textContent).not.toContain('font-family: "Custom Content"');
        expect(generatedStyle.textContent).not.toContain('font-family: "Custom UI"');
    });

    it("writes each configured category only to its own SiYuan variable", () => {
        const cases = [
            ["content", "--b3-font-family-protyle"],
            ["mono", "--b3-font-family-code"],
            ["graph", "--b3-font-family-graph"],
            ["emoji", "--b3-font-family-emoji"],
        ] as const;

        for (const [target, expectedProperty] of cases) {
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

            expect(Array.from(new Set(setProperty.mock.calls.map(([name]) => name)))).toEqual([expectedProperty]);
        }
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
        expect(generatedStyle.textContent).not.toContain('font-family: "Inline Mono"');
        expect(generatedStyle.textContent).toContain('font-family: "Block Mono", ui-monospace');
        expect(generatedStyle.textContent).not.toContain('.b3-chip');
        expect(generatedStyle.textContent).toContain('font-size: 15px');
        expect(generatedStyle.textContent).toContain('.katex:not(.katex-display .katex) .mord:not(.sqrt):not(.delimsizing)');
        expect(generatedStyle.textContent).toContain('.katex-display .katex .mord:not(.sqrt):not(.delimsizing)');
        expect(generatedStyle.textContent).toContain('font-family: "Inline Math", Original Math !important');
        expect(generatedStyle.textContent).toContain('font-family: "Block Math", Original Math !important');
        expect(generatedStyle.textContent).not.toContain('.katex-html *');
        expect(generatedStyle.textContent).not.toContain('.op-symbol {');
    });
});
