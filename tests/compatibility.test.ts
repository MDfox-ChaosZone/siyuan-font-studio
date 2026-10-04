import {afterEach, describe, expect, it, vi} from "vitest";
import {readFileSync} from "node:fs";
import {currentSystemFonts, MIN_APP_VERSION, siyuanVersionAtLeast} from "../src/compatibility";
import {StyleManager} from "../src/style-manager";
import {parseState} from "../src/state";

afterEach(() => vi.unstubAllGlobals());

describe("optional font features", () => {
    it("keeps the marketplace minimum at the supported SiYuan baseline", () => {
        const manifest = JSON.parse(readFileSync("plugin.json", "utf8"));
        expect(manifest.minAppVersion).toBe(MIN_APP_VERSION);
        expect(MIN_APP_VERSION).toBe("3.8.0");
    });

    it("handles missing and non-semantic version values conservatively", () => {
        expect(siyuanVersionAtLeast("3.8.0", "")).toBe(false);
        expect(siyuanVersionAtLeast("3.8.0", "unknown")).toBe(false);
        expect(siyuanVersionAtLeast("3.8.0", "3.7.9")).toBe(false);
        expect(siyuanVersionAtLeast("3.8.0", "v3.8.0")).toBe(true);
        expect(siyuanVersionAtLeast("3.8.0", "3.8.0-alpha.1")).toBe(false);
        expect(siyuanVersionAtLeast("3.8.0", "3.8.0+build-1")).toBe(true);
        expect(siyuanVersionAtLeast("3.8.5", "3.8.4")).toBe(false);
        expect(siyuanVersionAtLeast("3.8.5", "3.8.6-alpha.1")).toBe(true);
        expect(siyuanVersionAtLeast("3.8.5", "3.10.0")).toBe(true);
    });

    it("ignores old system font payloads without adapting or crashing", () => {
        const valid = {family: "Arial", displayName: "Arial", weight: 400};
        expect(currentSystemFonts(["Arial", "Calibri"])).toEqual([]);
        expect(currentSystemFonts(null)).toEqual([]);
        expect(currentSystemFonts([valid, null, {family: "Bad"}, {...valid, weight: NaN}])).toEqual([valid]);
    });

    it.each([
        ["2.9.0", false, false], ["3.7.9", false, false],
        ["3.8.0", true, false], ["3.8.4", true, false],
        ["3.8.5", true, true], ["3.8.6", true, true],
    ])("keeps core settings usable on %s and gates specialized renderers", (version, graph, mindmap) => {
        const style = {textContent: ""};
        const rootStyle = {getPropertyValue: () => "", getPropertyPriority: () => "", setProperty: vi.fn(), removeProperty: vi.fn()};
        vi.stubGlobal("window", {siyuan: {config: {system: {kernelVersion: version}}}});
        vi.stubGlobal("document", {documentElement: {style: rootStyle}, getElementById: () => style});
        vi.stubGlobal("getComputedStyle", () => ({getPropertyValue: () => ""}));
        const state = parseState(null);
        for (const target of ["ui", "mono", "graph", "mindmap"] as const) {
            state.targets[target].fonts = [{kind: "system", family: "Arial", displayName: "Arial", weight: 700}];
        }
        state.targets.mindmap.size = 24;
        new StyleManager().apply(state, new Set());
        expect(rootStyle.setProperty).toHaveBeenCalledWith("--b3-font-family", expect.stringContaining("Arial"), "important");
        expect(style.textContent).toContain('span[data-type~="code"] { font-weight: 700');
        expect(rootStyle.setProperty.mock.calls.some(([name]) => name === "--b3-font-family-graph")).toBe(graph);
        expect(rootStyle.setProperty.mock.calls.some(([name]) => name === "--bfm-font-weight-graph")).toBe(graph);
        expect(style.textContent.includes(".mindmap-view")).toBe(mindmap);
        expect(style.textContent).not.toContain('[data-subtype="mindmap"]');
    });
});
