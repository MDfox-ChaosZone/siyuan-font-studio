import {afterEach, describe, expect, it, vi} from "vitest";
import {DEFAULT_STATE, HEADING_TARGETS} from "../src/types";
import {activatePreset, parseState, syncActivePreset} from "../src/state";
import {parsePresetConfig, serializePreset} from "../src/preset-io";
import {StyleManager} from "../src/style-manager";

afterEach(() => vi.unstubAllGlobals());

describe("heading settings", () => {
    it("loads old states and presets with inherited headings", () => {
        const state = parseState({version: 3, targets: {content: {fonts: [], size: 20}}});
        const portable = JSON.parse(serializePreset(state.presets[0], [], "Legacy"));
        for (const target of HEADING_TARGETS) delete portable.targets[target];
        const imported = parsePresetConfig(portable, []);
        for (const target of HEADING_TARGETS) {
            expect(state.targets[target]).toEqual({fonts: [], size: null});
            expect(imported.targets[target]).toEqual({fonts: [], size: null});
        }
        expect(state.targets.content.size).toBe(20);
    });

    it("keeps all six levels through save, export, import and preset switching", () => {
        const state = parseState(null);
        state.presets[0].name = "Headings";
        for (const [index, target] of HEADING_TARGETS.entries()) {
            state.targets[target] = {fonts: [{kind: "system", family: `Heading ${index}`, displayName: `Heading ${index}`, weight: 600}], size: 40 - index * 4};
        }
        syncActivePreset(state);
        const imported = parsePresetConfig(JSON.parse(serializePreset(state.presets[0], [])), []);
        expect(imported.targets).toEqual(state.targets);
        state.targets = structuredClone(DEFAULT_STATE.targets);
        expect(activatePreset(state, state.presets[0].id)).toBe(true);
        expect(state.targets).toEqual(imported.targets);
    });

    it("isolates each level and removes overrides on reset", () => {
        const style = {textContent: "", remove: vi.fn()};
        vi.stubGlobal("document", {
            documentElement: {style: {getPropertyValue: () => "", getPropertyPriority: () => "", setProperty: vi.fn(), removeProperty: vi.fn()}},
            getElementById: () => style,
        });
        vi.stubGlobal("getComputedStyle", () => ({getPropertyValue: () => ""}));
        const manager = new StyleManager();
        const state = structuredClone(DEFAULT_STATE);
        manager.apply(state, new Set());
        expect(style.textContent).toBe("");
        for (const target of HEADING_TARGETS) {
            state.targets[target] = {fonts: [{kind: "system", family: "Heading Font", displayName: "Heading Font", weight: 700}], size: 32};
            manager.apply(state, new Set());
            expect(style.textContent).toContain(`[data-type="NodeHeading"][data-subtype="${target}"]`);
            expect(style.textContent).toContain(`.b3-typography:not(.b3-typography--default) ${target}`);
            expect(style.textContent).toContain('font-family: "Heading Font", var(--b3-font-family-protyle) !important;');
            expect(style.textContent).toContain("font-size: 32px !important;");
            expect(style.textContent).not.toContain(".protyle-title");
            for (const other of HEADING_TARGETS.filter((item) => item !== target)) expect(style.textContent).not.toContain(`[data-subtype="${other}"]`);
            state.targets[target] = {fonts: [], size: null};
        }
        manager.apply(state, new Set());
        expect(style.textContent).toBe("");
        state.targets.h1 = {fonts: [{kind: "default"}], size: 35};
        manager.apply(state, new Set());
        expect(style.textContent).not.toContain("font-family:");
        expect(style.textContent).toContain("font-size: 35px");
    });
});

