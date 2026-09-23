import {describe, expect, it, vi} from "vitest";
import {fetchCommunityCatalog, parseCommunityCatalog} from "../src/preset-catalog";

const sha = "a".repeat(64);
const row = (target: string) => ({target, fonts: ["SiYuan"], size: null, weights: [{value: null}]});
const item = {
    id: "issue-42", name: "测试方案", description: "一套阅读字体", author: "alice",
    authorUrl: "https://github.com/alice", issueUrl: "https://github.com/MDfox-ChaosZone/siyuan-font-studio/issues/42",
    packageUrl: "https://github.com/MDfox-ChaosZone/siyuan-font-studio/releases/download/community-preset-issue-42/issue-42.siyuan-font-studio-preset.zip",
    packageSize: 123, packageSha256: sha, includesFonts: true,
    rows: ["ui", "content", "mono", "math", "graph", "emoji", "mermaid"].map(row),
};
const catalog = {version: 1, updatedAt: "2026-09-23T00:00:00Z", presets: [item]};

describe("community catalog", () => {
    it("validates and converts published entries", () => {
        expect(parseCommunityCatalog(catalog).presets[0]).toMatchObject({id: "issue-42", name: "测试方案", assetName: "issue-42.siyuan-font-studio-preset.zip"});
    });

    it("rejects unexpected download origins and duplicate IDs", () => {
        expect(() => parseCommunityCatalog({...catalog, presets: [{...item, packageUrl: "https://evil.example/font.zip"}]})).toThrow("invalid-catalog");
        expect(() => parseCommunityCatalog({...catalog, presets: [item, item]})).toThrow("invalid-catalog");
    });

    it("checks the network for updates on each call", async () => {
        const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify(catalog), {status: 200}));
        await fetchCommunityCatalog(fetcher);
        await fetchCommunityCatalog(fetcher);
        expect(fetcher).toHaveBeenCalledTimes(2);
        expect(fetcher.mock.calls[0][0]).toContain("community-catalog/catalog.json?t=");
    });
});
