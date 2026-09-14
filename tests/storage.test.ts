import {afterEach, describe, expect, it, vi} from "vitest";
import {deleteFontFile, deletePluginStorage, ensureFontDirectory, readFontFile, storedFontFileName, writeFontFile} from "../src/storage";

const font = {storageName: "Demo__safeid.woff2"};

afterEach(() => vi.unstubAllGlobals());

describe("font storage API", () => {
    it("builds readable collision-resistant storage names", () => {
        expect(storedFontFileName({
            id: "550e8400-e29b-41d4-a716-446655440000",
            originalName: "霞鹜臻楷 GB.ttf",
            extension: "ttf",
        })).toBe("霞鹜臻楷 GB__550e8400.ttf");
        expect(storedFontFileName({
            id: "12345678-abcd",
            originalName: "bad:name?.otf",
            extension: "otf",
        })).toBe("bad_name___12345678.otf");
    });

    it("writes to the plugin-specific storage directory", async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({code: 0}), {headers: {"content-type": "application/json"}}));
        vi.stubGlobal("fetch", fetchMock);
        await writeFontFile(font, new File(["font"], "demo.woff2"), "app-123");
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe("/api/file/putFile");
        expect((init.body as FormData).get("path")).toBe("/data/storage/petal/siyuan-font-studio/fonts/Demo__safeid.woff2");
        expect((init.body as FormData).get("app")).toBe("app-123");
    });

    it("returns binary font data", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), {headers: {"content-type": "font/woff2"}})));
        expect(Array.from(new Uint8Array(await readFontFile(font)))).toEqual([1, 2, 3]);
    });

    it("uses the readable storage name when present", async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({code: 0}), {headers: {"content-type": "application/json"}}));
        vi.stubGlobal("fetch", fetchMock);
        await writeFontFile({storageName: "Demo__12345678.woff2"}, new File(["font"], "demo.woff2"), "app-123");
        expect((fetchMock.mock.calls[0][1].body as FormData).get("path"))
            .toBe("/data/storage/petal/siyuan-font-studio/fonts/Demo__12345678.woff2");
    });

    it("creates the font directory before opening it", async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({code: 0}), {headers: {"content-type": "application/json"}}));
        vi.stubGlobal("fetch", fetchMock);
        await ensureFontDirectory("app-123");
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe("/api/file/putFile");
        expect((init.body as FormData).get("path")).toBe("/data/storage/petal/siyuan-font-studio/fonts");
        expect((init.body as FormData).get("isDir")).toBe("true");
        expect((init.body as FormData).get("app")).toBe("app-123");
    });

    it("surfaces kernel deletion errors", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({code: -1, msg: "denied"}), {headers: {"content-type": "application/json"}})));
        await expect(deleteFontFile(font, "app-123")).rejects.toThrow("denied");
    });

    it("removes all plugin-owned data on uninstall", async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({code: 0}), {headers: {"content-type": "application/json"}}));
        vi.stubGlobal("fetch", fetchMock);
        await deletePluginStorage("app-123");
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe("/api/file/removeFile");
        expect(JSON.parse(init.body as string)).toEqual({path: "/data/storage/petal/siyuan-font-studio", app: "app-123"});
    });
});
