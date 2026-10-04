import {afterEach, describe, expect, it, vi} from "vitest";
import {parseState, syncActivePreset} from "../src/state";
import {parsePresetConfig, serializePreset} from "../src/preset-io";
import {mindmapOverrides} from "../src/mindmap";
import {StyleManager} from "../src/style-manager";

afterEach(() => vi.unstubAllGlobals());

describe("mind map fonts", () => {
    it("imports old presets and retains independent mind map settings in new presets", () => {
        const state = parseState({version: 3, targets: {content: {fonts: [], size: 20}}});
        state.presets[0].name = "Mind maps";
        const legacy = JSON.parse(serializePreset(state.presets[0], []));
        delete legacy.targets.mindmap;
        expect(parsePresetConfig(legacy, []).targets.mindmap).toEqual({fonts: [], size: null});
        state.targets.mindmap = {fonts: [{kind: "system", family: "Arial", displayName: "Arial", weight: 700}], size: 24};
        syncActivePreset(state);
        expect(parsePresetConfig(JSON.parse(serializePreset(state.presets[0], [])), []).targets.mindmap).toEqual(state.targets.mindmap);
        expect(mindmapOverrides(state, new Set())).toEqual({fontFamily: '"Arial", sans-serif', fontSize: 24, fontWeight: 700});
    });

    it("scopes DOM rules to mind map text and removes them on reset", () => {
        const style = {textContent: "", remove: vi.fn()};
        vi.stubGlobal("document", {documentElement: {style: {getPropertyValue: () => "", getPropertyPriority: () => "", setProperty: vi.fn(), removeProperty: vi.fn()}}, getElementById: () => style});
        vi.stubGlobal("getComputedStyle", () => ({getPropertyValue: () => ""}));
        vi.stubGlobal("window", {siyuan: {config: {system: {kernelVersion: "3.8.6"}}}});
        const manager = new StyleManager();
        const state = parseState(null);
        state.targets.mindmap = {fonts: [{kind: "system", family: "Arial", displayName: "Arial", weight: 700}], size: 24};
        manager.apply(state, new Set());
        expect(style.textContent).toContain(".mindmap-view .mindmap-view__node");
        expect(style.textContent).toContain("font-size: 24px !important;");
        expect(style.textContent).not.toContain(".mindmap-view *");
        expect(style.textContent).not.toContain(".mindmap-view__toolbar");
        state.targets.mindmap = {fonts: [], size: null};
        manager.apply(state, new Set());
        expect(style.textContent).toBe("");
    });

});
