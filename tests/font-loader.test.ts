import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {FontLoader, selectedFontRequests} from "../src/font-loader";
import {extractFontMetadata, FONT_METADATA_VERSION} from "../src/font-utils";
import {readFontFile} from "../src/storage";
import {parseState} from "../src/state";
import {ImportedFont} from "../src/types";

vi.mock("../src/storage", () => ({readFontFile: vi.fn()}));
vi.mock("../src/font-utils", async importOriginal => ({...await importOriginal<typeof import("../src/font-utils")>(), extractFontMetadata: vi.fn()}));

function font(id = "one"): ImportedFont {
    return {id, displayName: id, originalName: `${id}.woff2`, storageName: `${id}.woff2`, extension: "woff2",
        size: 10, sha256: id, importedAt: "2026-10-17", metadataVersion: FONT_METADATA_VERSION,
        fontName: id, fontStyle: "Regular", fontWeight: 400, variationAxes: {}, fontVersion: "1.0",
        coverage: {chinese: true, english: true, emoji: false, math: false}};
}

let faces: Array<{family: string; descriptors: FontFaceDescriptors; load: ReturnType<typeof vi.fn>}>;
let registered: Set<unknown>;
let metadataChanged: ReturnType<typeof vi.fn<() => void>>;
let loader: FontLoader;

beforeEach(() => {
    vi.clearAllMocks();
    faces = [];
    registered = new Set();
    vi.stubGlobal("document", {fonts: {add: (face: unknown) => registered.add(face), delete: (face: unknown) => registered.delete(face)}});
    vi.stubGlobal("FontFace", class {
        load = vi.fn(async () => this);
        constructor(public family: string, _source: ArrayBuffer, public descriptors: FontFaceDescriptors) { faces.push(this); }
    });
    vi.mocked(readFontFile).mockResolvedValue(new ArrayBuffer(10));
    vi.mocked(extractFontMetadata).mockReturnValue({metadataVersion: FONT_METADATA_VERSION, fontName: "Parsed", fontStyle: "Regular",
        fontWeight: 400, variationAxes: {}, fontVersion: "2.0", coverage: {chinese: true, english: true, emoji: false, math: false}});
    metadataChanged = vi.fn();
    loader = new FontLoader(metadataChanged);
});
afterEach(() => {loader.destroy(); vi.unstubAllGlobals();});

describe("on-demand font loading", () => {
    it("reads no files at construction; a 100-font library loads only current targets and enabled secondary settings", async () => {
        const state = parseState(null);
        state.fonts = Array.from({length: 100}, (_, i) => font(String(i)));
        state.targets.content.fonts = [{kind: "imported", id: "1"}];
        state.targets.h1.fonts = [{kind: "imported", id: "1"}];
        state.targets.mono.secondary!.fonts = [{kind: "imported", id: "2"}];
        state.targets.math.decoupled = true;
        state.targets.math.secondary!.fonts = [{kind: "imported", id: "3"}];
        state.targets.emoji.fonts = [{kind: "imported", id: "4"}];
        expect(readFontFile).not.toHaveBeenCalled();
        const requests = selectedFontRequests(state);
        expect(requests).toEqual([{id: "1", emoji: false}, {id: "4", emoji: true}, {id: "3", emoji: false}]);
        await Promise.all(requests.map(({id, emoji}) => loader.ensure(state.fonts.find(f => f.id === id)!, emoji)));
        expect(readFontFile).toHaveBeenCalledTimes(3);
        expect(faces).toHaveLength(3);
        expect(loader.faces.size).toBe(2);
        expect(loader.emojiFaces.size).toBe(1);
    });

    it("deduplicates concurrent preview/settings loads and reuses a loaded face", async () => {
        const item = font();
        await Promise.all([loader.ensure(item), loader.ensure(item), loader.ensure(item)]);
        await loader.ensure(item);
        expect(readFontFile).toHaveBeenCalledTimes(1);
        expect(faces).toHaveLength(1);
        expect(extractFontMetadata).not.toHaveBeenCalled();
        expect(metadataChanged).not.toHaveBeenCalled();
    });

    it("shares one read between normal and Emoji faces and loads Emoji only when requested", async () => {
        const item = font();
        await Promise.all([loader.ensure(item), loader.ensure(item, true)]);
        expect(readFontFile).toHaveBeenCalledTimes(1);
        expect(faces).toHaveLength(2);
        expect(faces[0].descriptors.unicodeRange).toBeUndefined();
        expect(faces[1].descriptors.unicodeRange).toContain("U+1F300-1F6FF");
        await loader.ensure(item, true);
        expect(faces).toHaveLength(2);
    });

    it("loads a preview first, then creates the Emoji face on later selection", async () => {
        const item = font();
        await loader.ensure(item);
        expect(loader.emojiFaces.size).toBe(0);
        await loader.ensure(item, true);
        expect(loader.faces.size).toBe(1);
        expect(loader.emojiFaces.size).toBe(1);
        expect(faces).toHaveLength(2);
        expect(extractFontMetadata).not.toHaveBeenCalled();
    });

    it.each(["missing", "old-version", "incomplete"])("refreshes %s metadata once and persists its cache across loader instances", async reason => {
        const item = font();
        if (reason === "missing") delete item.metadataVersion;
        if (reason === "old-version") item.metadataVersion = 0;
        if (reason === "incomplete") delete item.coverage;
        await Promise.all([loader.ensure(item), loader.ensure(item, true)]);
        expect(extractFontMetadata).toHaveBeenCalledTimes(1);
        expect(metadataChanged).toHaveBeenCalledTimes(1);
        expect(item.fontName).toBe("Parsed");
        loader.destroy();
        loader = new FontLoader(metadataChanged);
        await loader.ensure(item);
        expect(extractFontMetadata).toHaveBeenCalledTimes(1);
    });

    it("keeps variable weights and italic styles on normal faces", async () => {
        const item = font();
        item.fontStyle = "Italic";
        item.variationAxes = {wght: {name: "Weight", min: 100, default: 400, max: 900}};
        await loader.ensure(item);
        expect(faces[0].descriptors).toEqual({style: "italic", weight: "100 900"});
    });

    it("contains missing-file errors and avoids retrying them on every settings change", async () => {
        vi.mocked(readFontFile).mockRejectedValueOnce(new Error("missing font"));
        const item = font();
        await loader.ensure(item);
        await loader.ensure(item);
        expect(loader.statuses.get(item.id)).toEqual({loaded: false, error: "missing font"});
        expect(readFontFile).toHaveBeenCalledTimes(1);
        await loader.ensure(font("valid"));
        expect(loader.faces.has("valid")).toBe(true);
    });

    it("keeps normal-font availability independent of an Emoji load failure", async () => {
        const item = font();
        await loader.ensure(item);
        vi.stubGlobal("FontFace", class {load = async () => {throw new Error("Emoji failed");};});
        await loader.ensure(item, true);
        expect(loader.faces.has(item.id)).toBe(true);
        expect(loader.emojiFaces.has(item.id)).toBe(false);
        expect(loader.statuses.get(item.id)).toEqual({loaded: true});
        loader.remove(item.id);
        expect(registered.size).toBe(0);
        expect(loader.statuses.has(item.id)).toBe(false);
    });

    it.each(["remove", "destroy"] as const)("does not register a face when %s happens during FontFace.load", async action => {
        let finish!: () => void;
        vi.stubGlobal("FontFace", class {
            load = () => new Promise<void>(resolve => {finish = resolve;});
        });
        const item = font();
        const pending = loader.ensure(item);
        await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
        if (action === "remove") loader.remove(item.id); else loader.destroy();
        finish();
        await pending;
        expect(registered.size).toBe(0);
        expect(loader.faces.size).toBe(0);
        expect(loader.statuses.size).toBe(0);
    });
});
