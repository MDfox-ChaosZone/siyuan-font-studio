import {describe, expect, it, vi} from "vitest";
import {
    COMMUNITY_PRESET_ASSET_NAME,
    downloadExamplePreset,
    EXAMPLE_PRESET_ASSET_NAME,
    fetchExamplePresetViaSiyuanProxy,
    MAX_EXAMPLE_PRESET_BYTES,
    PRESET_CATALOG,
    resolveExamplePresetAsset,
    resolvePresetAsset,
} from "../src/example-preset";

describe("example preset release", () => {
    it("discovers the named GitHub release asset and its digest", async () => {
        const fetcher = vi.fn(async () => new Response(JSON.stringify({assets: [{
            name: EXAMPLE_PRESET_ASSET_NAME,
            size: 123,
            browser_download_url: `https://github.com/MDfox-ChaosZone/siyuan-font-studio/releases/download/example/${EXAMPLE_PRESET_ASSET_NAME}`,
            digest: `sha256:${"a".repeat(64)}`,
        }]}), {status: 200}));

        await expect(resolveExamplePresetAsset(fetcher)).resolves.toEqual({
            downloadUrl: `https://github.com/MDfox-ChaosZone/siyuan-font-studio/releases/download/example/${EXAMPLE_PRESET_ASSET_NAME}`,
            size: 123,
            sha256: "a".repeat(64),
        });
    });

    it("falls back to the stable release URL when GitHub API discovery fails", async () => {
        const asset = await resolveExamplePresetAsset(async () => new Response(null, {status: 403}));
        expect(asset.downloadUrl).toContain("/releases/download/");
        expect(asset.downloadUrl).toContain(EXAMPLE_PRESET_ASSET_NAME);
        expect(asset.size).toBeNull();
    });

    it("exposes example and community presets with authors and complete detail tables", () => {
        expect(PRESET_CATALOG.map(({id}) => id)).toEqual(["example", "community"]);
        for (const item of PRESET_CATALOG) {
            expect(item.author).toBeTruthy();
            expect(item.authorUrl).toMatch(/^https:\/\/github\.com\//);
            expect(item.rows.map(({target}) => target)).toEqual(["ui", "content", "mono", "math", "graph", "emoji", "mermaid"]);
        }
    });

    it("discovers the community asset from its own release", async () => {
        const community = PRESET_CATALOG.find(({id}) => id === "community")!;
        const fetcher = vi.fn(async () => new Response(JSON.stringify({assets: [{
            name: COMMUNITY_PRESET_ASSET_NAME,
            size: 456,
            browser_download_url: `https://github.com/MDfox-ChaosZone/siyuan-font-studio/releases/download/community/${COMMUNITY_PRESET_ASSET_NAME}`,
            digest: `sha256:${"b".repeat(64)}`,
        }]}), {status: 200}));

        await expect(resolvePresetAsset(community, fetcher)).resolves.toEqual({
            downloadUrl: `https://github.com/MDfox-ChaosZone/siyuan-font-studio/releases/download/community/${COMMUNITY_PRESET_ASSET_NAME}`,
            size: 456,
            sha256: "b".repeat(64),
        });
        expect(fetcher).toHaveBeenCalledWith(community.releaseApiUrl, expect.any(Object));
    });
});

describe("example preset download", () => {
    it("reports progress and verifies the GitHub digest", async () => {
        const bytes = new Uint8Array([1, 2, 3]);
        const progress = vi.fn();
        const result = await downloadExamplePreset({
            downloadUrl: "https://github.com/example.zip",
            size: 3,
            sha256: "039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81",
        }, new AbortController().signal, progress, async () => new Response(bytes, {
            status: 200,
            headers: {"content-length": "3"},
        }));

        expect(Array.from(result)).toEqual([1, 2, 3]);
        expect(progress).toHaveBeenLastCalledWith({received: 3, total: 3});
    });

    it("can use SiYuan's network proxy as a cross-origin fallback", async () => {
        const fetcher = vi.fn(async () => new Response(JSON.stringify({
            code: 0,
            msg: "",
            data: {
                body: "AQID",
                bodyEncoding: "base64",
                contentType: "application/zip",
                status: 200,
            },
        }), {status: 200, headers: {"content-type": "application/json"}}));

        const response = await fetchExamplePresetViaSiyuanProxy("https://github.com/example.zip", {signal: new AbortController().signal}, fetcher);
        expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([1, 2, 3]);
        expect(fetcher).toHaveBeenCalledWith("/api/network/forwardProxy", expect.objectContaining({method: "POST"}));
    });

    it("rejects oversized and corrupted downloads", async () => {
        await expect(downloadExamplePreset({
            downloadUrl: "https://github.com/too-large.zip",
            size: MAX_EXAMPLE_PRESET_BYTES + 1,
            sha256: null,
        }, new AbortController().signal, vi.fn())).rejects.toThrow("example-package-too-large");

        await expect(downloadExamplePreset({
            downloadUrl: "https://github.com/corrupt.zip",
            size: 3,
            sha256: "a".repeat(64),
        }, new AbortController().signal, vi.fn(), async () => new Response(new Uint8Array([1, 2, 3]), {
            status: 200,
            headers: {"content-length": "3"},
        }))).rejects.toThrow("example-download-integrity");
    });
});
