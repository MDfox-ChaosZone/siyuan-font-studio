import {describe, expect, it} from "vitest";
import {activatePreset, clampLibraryPreviewWidth, clampSize, cloneTargets, parseState, removeFontFromState, syncActivePreset} from "../src/state";
import {detectFontCoverage, emojiRuntimeFamily, extractFontMetadata, familyForChoice, familyForChoices, extensionOf, fontWeightName, groupImportedFonts, groupSystemFonts, hasDuplicateHash, localizedFamilyName, nameWithoutExtension, quoteFamily, runtimeFamily, weightForChoices} from "../src/font-utils";
import {mergeMermaidConfig, mermaidOverrides} from "../src/mermaid";
import {
    createPresetPackage,
    importedFontIdsInTargets,
    parsePresetConfig,
    PRESET_FILE_FORMAT,
    PRESET_FILE_VERSION,
    readPresetContainer,
    serializePreset,
} from "../src/preset-io";
import {ImportedFont} from "../src/types";

const font: ImportedFont = {
    id: "font-1",
    displayName: "Example",
    originalName: "Example.woff2",
    storageName: "Example__font1.woff2",
    extension: "woff2",
    size: 123,
    sha256: "abc",
    importedAt: "2026-01-01T00:00:00.000Z",
};

describe("state parsing", () => {
    it("creates defaults for missing data", () => {
        const initial = parseState("");
        expect(initial.targets.ui).toEqual({fonts: [], size: null});
        expect(initial.presets).toHaveLength(1);
        expect(initial.activePresetId).toBe("default");
        expect(parseState({version: 3, fonts: [], targets: {}}).targets.graph).toEqual({fonts: [], size: null});
    });

    it("drops dangling imported assignments", () => {
        const state = parseState({version: 3, fonts: [], targets: {ui: {fonts: [{kind: "imported", id: "missing"}], size: 15}}});
        expect(state.targets.ui.fonts).toEqual([]);
        expect(state.targets.ui.size).toBe(15);
    });

    it("preserves ordered font stacks", () => {
        const stacked = parseState({version: 3, fonts: [font], targets: {ui: {fonts: [
            {kind: "system", family: "First", displayName: "First", weight: 400},
            {kind: "default"},
            {kind: "imported", id: font.id},
        ], size: null}}});
        expect(stacked.targets.ui.fonts.map((choice) => choice.kind)).toEqual(["system", "default", "imported"]);
    });

    it("resets categories when a font is removed", () => {
        const state = parseState({
            version: 3,
            fonts: [font],
            targets: {
                ui: {fonts: [{kind: "imported", id: font.id}], size: 14},
                content: {fonts: [{kind: "default"}], size: null},
                mono: {fonts: [{kind: "imported", id: font.id}], size: 13},
            },
        });
        const next = removeFontFromState(state, font.id);
        expect(next.fonts).toEqual([]);
        expect(next.targets.ui.fonts).toEqual([]);
        expect(next.targets.mono.fonts).toEqual([]);
    });

    it("preserves, switches, and updates presets independently", () => {
        const state = parseState({version: 3, fonts: [], targets: {ui: {fonts: [], size: 14}}});
        state.presets[0].name = "Reading";
        const codingTargets = cloneTargets(state.targets);
        codingTargets.ui.size = 18;
        state.presets.push({id: "coding", name: "Coding", targets: codingTargets});

        expect(activatePreset(state, "coding")).toBe(true);
        expect(state.targets.ui.size).toBe(18);
        state.targets.ui.size = 20;
        syncActivePreset(state);

        expect(state.presets.find((preset) => preset.id === "coding")?.targets.ui.size).toBe(20);
        expect(state.presets[0].targets.ui.size).toBe(14);
    });

    it("removes a deleted font from every preset", () => {
        const state = parseState({version: 3, fonts: [font], targets: {ui: {fonts: [{kind: "imported", id: font.id}], size: 14}}});
        state.presets.push({id: "second", name: "Second", targets: cloneTargets(state.targets)});
        const next = removeFontFromState(state, font.id);

        expect(next.presets.every((preset) => preset.targets.ui.fonts.length === 0)).toBe(true);
    });
});

describe("size constraints", () => {
    it("keeps the saved font library preview width within usable bounds", () => {
        expect(clampLibraryPreviewWidth(90)).toBe(140);
        expect(clampLibraryPreviewWidth(280.4)).toBe(280);
        expect(clampLibraryPreviewWidth(900)).toBe(420);
        expect(parseState({version: 3, layout: {libraryPreviewWidth: 315}}).layout.libraryPreviewWidth).toBe(315);
    });

    it("uses target-specific ranges", () => {
        expect(clampSize("ui", 50)).toBe(24);
        expect(clampSize("content", 100)).toBe(72);
        expect(clampSize("mono", 2)).toBe(9);
        expect(clampSize("graph", 90)).toBe(72);
        expect(clampSize("emoji", 4)).toBe(8);
        expect(clampSize("math", 18)).toBe(18);
        expect(clampSize("mermaid", 2)).toBe(10);
        expect(clampSize("mermaid", 80)).toBe(32);
        expect(clampSize("ui", null)).toBeNull();
    });

    it("clears emoji size because document emoji cannot be sized independently", () => {
        const state = parseState({version: 3, fonts: [], targets: {emoji: {fonts: [], size: 28}}});
        expect(state.targets.emoji.size).toBeNull();
    });

    it("clears legacy graph sizes because SiYuan 3.8+ has no graph size API", () => {
        const state = parseState({version: 3, fonts: [], targets: {graph: {fonts: [], size: 32}}});
        expect(state.targets.graph.size).toBeNull();
    });
});

describe("Mermaid configuration", () => {
    it("injects an ordered font stack and size before Mermaid layout", () => {
        const state = parseState({version: 3, fonts: [font], targets: {mermaid: {
            fonts: [
                {kind: "imported", id: font.id},
                {kind: "default"},
            ],
            size: 18,
        }}});
        const overrides = mermaidOverrides(state, new Set([font.id]));
        expect(overrides).toEqual({fontFamily: '"BFM_font-1", sans-serif', fontSize: 18});
        expect(mergeMermaidConfig({securityLevel: "loose", fontFamily: "sans-serif"}, overrides)).toEqual({
            securityLevel: "loose",
            fontFamily: '"BFM_font-1", sans-serif',
            altFontFamily: '"BFM_font-1", sans-serif',
            fontSize: 18,
        });
    });

    it("leaves Mermaid defaults untouched when no override is configured", () => {
        const state = parseState(null);
        expect(mermaidOverrides(state, new Set())).toEqual({});
        state.targets.mermaid.fonts = [{kind: "default"}];
        expect(mermaidOverrides(state, new Set())).toEqual({});
    });
});

describe("preset transfer", () => {
    it("exports portable configuration and restores imported fonts by hash", () => {
        const state = parseState({version: 3, fonts: [font], targets: {
            ui: {fonts: [{kind: "imported", id: font.id}, {kind: "default"}], size: 15},
        }});
        const preset = state.presets[0];
        preset.name = "Reading";
        preset.targets = cloneTargets(state.targets);
        const container = readPresetContainer(new TextEncoder().encode(serializePreset(preset, state.fonts)), "reading.siyuan-font-studio-preset.json");
        const raw = container.config as {format: string; version: number; targets: {ui: {fonts: unknown[]}}};

        expect(raw.format).toBe(PRESET_FILE_FORMAT);
        expect(raw.version).toBe(PRESET_FILE_VERSION);
        expect(raw.targets.ui.fonts[0]).toEqual({kind: "imported", sha256: "abc", displayName: "Example"});
        const imported = parsePresetConfig(raw, [{...font, id: "local-font"}]);
        expect(imported.targets.ui.fonts).toEqual([{kind: "imported", id: "local-font"}, {kind: "default"}]);
    });

    it("packs and reads selected font files", async () => {
        const state = parseState({version: 3, fonts: [font], targets: {ui: {fonts: [{kind: "imported", id: font.id}], size: 14}}});
        const preset = state.presets[0];
        preset.name = "Portable";
        preset.targets = cloneTargets(state.targets);
        const bytes = new Uint8Array([1, 2, 3]).buffer;
        const archive = await createPresetPackage(preset, state.fonts, [{font: {...font, size: 3}, data: bytes}]);
        const container = readPresetContainer(archive, "portable.siyuan-font-studio-preset.zip");

        expect(container.bundledFonts).toHaveLength(1);
        expect(Array.from(container.bundledFonts[0].data)).toEqual([1, 2, 3]);
        expect(importedFontIdsInTargets(preset.targets)).toEqual(new Set([font.id]));
    });

    it("reports bundled fonts that are absent from the local library", () => {
        const state = parseState({version: 3, fonts: [font], targets: {content: {fonts: [{kind: "imported", id: font.id}], size: 16}}});
        const preset = state.presets[0];
        preset.name = "Missing";
        preset.targets = cloneTargets(state.targets);
        const raw = JSON.parse(serializePreset(preset, state.fonts));
        const imported = parsePresetConfig(raw, []);

        expect(imported.targets.content.fonts).toEqual([]);
        expect(imported.missingFonts).toEqual(["Example"]);
    });
});

describe("font utilities", () => {
    it("normalizes file names", () => {
        expect(extensionOf("FONT.WOFF2")).toBe("woff2");
        expect(nameWithoutExtension("Source Han Sans.otf")).toBe("Source Han Sans");
    });

    it("creates safe CSS font names", () => {
        expect(runtimeFamily("hello/world")).toBe("BFM_hello_world");
        expect(emojiRuntimeFamily("hello/world")).toBe("BFM_EMOJI_hello_world");
        expect(quoteFamily('A "Font"')).toBe('"A \\"Font\\""');
    });

    it("falls back when an imported font is unavailable", () => {
        expect(familyForChoice({kind: "imported", id: font.id}, [font], new Set())).toBeNull();
        expect(familyForChoice({kind: "imported", id: font.id}, [font], new Set([font.id]))).toBe('"BFM_font-1"');
        expect(familyForChoice({kind: "imported", id: font.id}, [font], new Set([font.id]), emojiRuntimeFamily)).toBe('"BFM_EMOJI_font-1"');
    });

    it("builds an ordered CSS fallback stack", () => {
        expect(familyForChoices([
            {kind: "system", family: "First", displayName: "First", weight: 400},
            {kind: "default"},
            {kind: "imported", id: font.id},
        ], [font], new Set([font.id]), runtimeFamily, '"SiYuan Default"')).toBe('"First", "SiYuan Default", "BFM_font-1"');
    });

    it("uses only the first system choice as the stack weight", () => {
        expect(weightForChoices([{kind: "system", family: "First", displayName: "First Bold", weight: 700}])).toBe(700);
        expect(weightForChoices([{kind: "default"}, {kind: "system", family: "Second", displayName: "Second Bold", weight: 700}])).toBeNull();
        expect(weightForChoices([{kind: "imported", id: font.id}, {kind: "system", family: "Second", displayName: "Second Bold", weight: 700}])).toBeNull();
    });

    it("uses an imported variable font's selected or default weight", () => {
        const variable = {...font, fontWeight: 400, variationAxes: {wght: {name: "Weight", min: 150, default: 330, max: 700}}};
        expect(weightForChoices([{kind: "imported", id: font.id}], [variable])).toBe(330);
        expect(weightForChoices([{kind: "imported", id: font.id, weight: 615}], [variable])).toBe(615);
    });

    it("groups imported font files by family and sorts their variants by weight", () => {
        const bold = {...font, id: "bold", displayName: "Example Bold", fontName: "Example Family", fontStyle: "Bold", fontWeight: 700};
        const regular = {...font, id: "regular", displayName: "Example Regular", fontName: "Example Family", fontStyle: "Regular", fontWeight: 400};
        const other = {...font, id: "other", displayName: "Other", fontName: "Other Family", fontWeight: 400};
        const groups = groupImportedFonts([bold, other, regular]);

        expect(groups.map((group) => group.familyName)).toEqual(["Example Family", "Other Family"]);
        expect(groups[0].fonts.map((item) => item.id)).toEqual(["regular", "bold"]);
    });

    it("preserves localized system font names and weight aliases when grouping families", () => {
        const groups = groupSystemFonts([
            {family: "FangSong", displayName: "仿宋 Bold", weight: 700},
            {family: "FangSong", displayName: "仿宋", weight: 400},
        ]);

        expect(groups).toHaveLength(1);
        expect(groups[0].displayName).toBe("仿宋");
        expect(groups[0].searchText).toContain("仿宋 bold");
        expect(groups[0].preferred.font.weight).toBe(400);
    });

    it("labels standard and custom numeric font weights", () => {
        expect(fontWeightName(300)).toBe("Light");
        expect(fontWeightName(400)).toBe("Regular");
        expect(fontWeightName(700)).toBe("Bold");
        expect(fontWeightName(350)).toBe("Weight 350");
    });

    it("detects duplicate hashes", () => {
        expect(hasDuplicateHash([font], "abc")).toBe(true);
        expect(hasDuplicateHash([font], "different")).toBe(false);
    });

    it("falls back cleanly when font metadata cannot be parsed", () => {
        expect(extractFontMetadata(new Uint8Array([1, 2, 3]).buffer, "Fallback")).toEqual({
            fontName: "Fallback",
            fontStyle: "Regular",
            fontWeight: 400,
            variationAxes: {},
            fontVersion: "—",
            coverage: {chinese: false, english: false, emoji: false, math: false},
        });
    });

    it("detects Chinese, English, emoji and math character coverage", () => {
        const emojiSet = [
            ...Array.from({length: 36}, (_, index) => 0x1f300 + index),
            ...Array.from({length: 36}, (_, index) => 0x1f600 + index),
        ];
        expect(detectFontCoverage([0x4e2d, 0x41, 0x2211, ...emojiSet])).toEqual({chinese: true, english: true, emoji: true, math: true});
        expect(detectFontCoverage([0x30])).toEqual({chinese: false, english: false, emoji: false, math: false});
        expect(detectFontCoverage([0x20000, 0x7a])).toEqual({chinese: true, english: true, emoji: false, math: false});
        expect(detectFontCoverage([0x2600, 0x2665, 0x2713, 0x1f600])).toEqual({chinese: false, english: false, emoji: false, math: false});
        expect(detectFontCoverage(Array.from({length: 16}, (_, index) => 0x1f600 + index))).toEqual({chinese: false, english: false, emoji: true, math: false});
        expect(detectFontCoverage(Array.from({length: 8}, (_, index) => 0x1f600 + index), true)).toEqual({chinese: false, english: false, emoji: true, math: false});
    });

    it("does not label fonts with enclosed ideographs but no common emoji faces", () => {
        const enclosedIdeographs = [
            0x1f18e, ...Array.from({length: 10}, (_, index) => 0x1f191 + index),
            0x1f201, 0x1f21a, 0x1f22f, ...Array.from({length: 9}, (_, index) => 0x1f232 + index),
            0x1f250, 0x1f251, ...Array.from({length: 14}, (_, index) => 0x1fa60 + index),
        ];
        expect(detectFontCoverage(enclosedIdeographs)).toEqual({chinese: false, english: false, emoji: false, math: false});
    });

    it("prefers a localized Chinese font family name", () => {
        expect(localizedFamilyName({name: {records: {fontFamily: {en: "LXGW ZhenKai GB", zh: "霞鹜臻楷 GB"}}}})).toBe("霞鹜臻楷 GB");
    });
});
