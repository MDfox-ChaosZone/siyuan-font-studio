import {vi} from "vitest";

export const EMOJI_RESET = 'var(--b3-font-family-emoji-reset, "Emojis Additional", "Emojis Reset")';
export const EDITOR_FAMILY = "var(--b3-font-family-editor, var(--b3-font-family-protyle))";

export interface StubbedStyle {
    id: string;
    textContent: string;
    disabled: boolean;
    remove: ReturnType<typeof vi.fn>;
}

/** Stubs the DOM a StyleManager touches and returns its generated style element. */
export function stubStyleDocument(computed: Record<string, string> = {}): StubbedStyle {
    const style: StubbedStyle = {id: "", textContent: "", disabled: false, remove: vi.fn()};
    let attached = false;
    vi.stubGlobal("document", {
        documentElement: {},
        head: {appendChild: vi.fn(() => { attached = true; })},
        getElementById: vi.fn((id: string) => attached && id === style.id ? style : null),
        createElement: vi.fn(() => style),
    });
    vi.stubGlobal("getComputedStyle", () => ({getPropertyValue: (name: string) => computed[name] || ""}));
    return style;
}

/** Variables the plugin writes to its root rule. */
export function rootVars(text: string): Map<string, string> {
    const body = /:root:root:root \{ (.*?) \}/.exec(text)?.[1] || "";
    return new Map(body.split(" !important;").map((item) => item.trim()).filter(Boolean).map((item) => {
        const index = item.indexOf(":");
        return [item.slice(0, index), item.slice(index + 1).trim()];
    }));
}

/** Generated CSS without the root variable rule. */
export function rules(text: string): string {
    return text.replace(/:root:root:root \{ .*? \}\n?/, "");
}
