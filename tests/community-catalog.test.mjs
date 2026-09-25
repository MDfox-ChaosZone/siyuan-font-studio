import {createHash} from "node:crypto";
import {describe, expect, it, vi} from "vitest";
import {strToU8, unzipSync, zipSync} from "fflate";
import {assembleSplitParts, inspectPresetPackage, isAllowedAttachmentUrl, parseIssueBody, publishIssue} from "../scripts/community-catalog.mjs";
import {splitPresetPackage} from "../src/preset-parts";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const targets = Object.fromEntries(["ui", "content", "mono", "math", "graph", "emoji", "mermaid"].map((key) => [key, {fonts: [], size: null}]));
const config = {format: "siyuan-font-studio-preset", version: 1, name: "测试方案", targets};
const body = `### 字体方案介绍\n适合阅读。\n\n### 效果截图\n![效果](https://github.com/user-attachments/assets/preview-id)\n\n### 字体方案压缩包\n[方案](https://github.com/user-attachments/assets/package-id)`;

describe("community submission", () => {
    it("reads the standardized Issue form and validates a portable package", () => {
        expect(parseIssueBody(body, "[字体方案分享] 自拟的方案名称")).toMatchObject({name: "自拟的方案名称", attachment: "https://github.com/user-attachments/assets/package-id"});
        expect(parseIssueBody(body.replace("适合阅读。", "_No response_").replace(/!\[效果\]\([^)]*\)/, "_No response_"), "[字体方案分享] 自拟的方案名称"))
            .toMatchObject({description: "", preview: undefined});
        expect(() => parseIssueBody(body, "[字体方案分享] ")).toThrow("请在标题前缀后填写");
        expect(() => parseIssueBody(body, "自拟的方案名称")).toThrow("须保留 [字体方案分享] 前缀");
        expect(() => parseIssueBody(body.replace("### 字体方案压缩包", "### 其他文件"), "[字体方案分享] 自拟的方案名称")).toThrow("缺少投稿字段：字体方案压缩包");
        expect(parseIssueBody(body.replace("https://github.com/user-attachments/assets/package-id", "https://downloads.example.com/preset.zip?token=abc"), "[字体方案分享] 自拟的方案名称").attachment)
            .toBe("https://downloads.example.com/preset.zip?token=abc");
        expect(parseIssueBody(body.replace("https://github.com/user-attachments/assets/package-id", "https://github.com/user-attachments/assets/part-1)\n[第二份](https://github.com/user-attachments/assets/part-2"), "[字体方案分享] 两份"))
            .toMatchObject({attachments: ["https://github.com/user-attachments/assets/part-1", "https://github.com/user-attachments/assets/part-2"]});
        expect(isAllowedAttachmentUrl("https://localhost/preset.zip")).toBe(false);
        expect(isAllowedAttachmentUrl("http://downloads.example.com/preset.zip")).toBe(false);
        const bytes = strToU8(JSON.stringify(config));
        expect(inspectPresetPackage(bytes, "preset.json")).toMatchObject({name: "测试方案", includesFonts: false, sha256: sha(bytes)});
        const zip = zipSync({"preset.json": bytes});
        expect(inspectPresetPackage(zip)).toMatchObject({name: "测试方案", includesFonts: false});
        expect(inspectPresetPackage(zipSync({"preset.json": bytes, "README.md": strToU8("说明")}))).toMatchObject({name: "测试方案"});
        expect(() => inspectPresetPackage(zipSync({"preset.json": bytes, "virus.exe": strToU8("MZ")}))).toThrow("不允许的文件");
        expect(() => inspectPresetPackage(zipSync({"preset.json": bytes, "fonts/hidden.ttf": Uint8Array.of(0, 1, 0, 0)}))).toThrow("未在清单中声明");
        expect(() => inspectPresetPackage(zipSync({"preset.json": strToU8(JSON.stringify({...config, version: 99}))}))).toThrow("无效的方案格式或版本");
    });

    it("splits a real package below GitHub per-file limit and reassembles it with integrity checks", async () => {
        const font = new Uint8Array(24_000_000);
        font.set([0, 1, 0, 0]);
        const fontSha = sha(font);
        const fontPath = `fonts/${fontSha}.ttf`;
        const manifest = {...config, bundledFonts: [{path: fontPath, sha256: fontSha, displayName: "测试字体", originalName: "test.ttf", extension: "ttf", size: font.length}]};
        const archive = zipSync({"preset.json": strToU8(JSON.stringify(manifest)), [fontPath]: font}, {level: 0});
        const parts = await splitPresetPackage(archive, "test.siyuan-font-studio-preset");
        expect(parts).toHaveLength(2);
        expect(parts.every((part) => part.name.endsWith(".zip") && part.bytes.length < 25_000_000)).toBe(true);
        expect(parts.every((part) => Object.keys(unzipSync(part.bytes)).sort().join(",") === "data.bin,part.json")).toBe(true);
        const restored = assembleSplitParts(parts.map((part) => part.bytes).reverse());
        expect(sha(restored.bytes)).toBe(sha(archive));
        expect(restored.info).toMatchObject({name: "测试方案", includesFonts: true});
        expect(() => assembleSplitParts([parts[0].bytes])).toThrow("需要 2–5 个分包");
        expect(() => assembleSplitParts([parts[0].bytes, parts[0].bytes])).toThrow("编号");
        const files = unzipSync(parts[0].bytes);
        files["data.bin"][0] ^= 1;
        const tampered = zipSync(files, {level: 0});
        expect(() => assembleSplitParts([tampered, parts[1].bytes])).toThrow("分包哈希");

        const urls = ["https://github.com/user-attachments/assets/part-1", "https://github.com/user-attachments/assets/part-2"];
        const splitBody = body.replace("https://github.com/user-attachments/assets/package-id", `${urls[0]})\n[第二份](${urls[1]}`);
        const calls = [];
        const json = (value, status = 200) => new Response(JSON.stringify(value), {status, headers: {"content-type": "application/json"}});
        vi.stubGlobal("fetch", vi.fn(async (input, init = {}) => {
            const url = String(input);
            calls.push({url, method: init.method || "GET", body: init.body});
            if (url.endsWith("/issues/42") && !init.method) return json({title: "[字体方案分享] 多分包", body: splitBody, html_url: "https://github.com/MDfox-ChaosZone/siyuan-font-studio/issues/42", user: {login: "alice", html_url: "https://github.com/alice"}, labels: [{name: "字体方案分享"}, {name: "publish-approved"}]});
            if (url === urls[0]) return new Response(parts[0].bytes);
            if (url === urls[1]) return new Response(parts[1].bytes);
            if (url.includes("/contents/catalog.json?ref=main")) return json({sha: "catalog-sha", content: Buffer.from(JSON.stringify({version: 1, presets: []})).toString("base64")});
            if (url.endsWith("/releases/tags/社区字体方案")) return json({id: 8, upload_url: "https://uploads.github.com/repos/MDfox-ChaosZone/siyuan-font-studio/releases/8/assets{?name,label}", assets: []});
            if (url.startsWith("https://api.github.com/") && url.includes("/releases/8/assets?")) return json([]);
            if (url.startsWith("https://uploads.github.com/")) return json({browser_download_url: "https://github.com/MDfox-ChaosZone/siyuan-font-studio/releases/download/社区字体方案/issue-42.siyuan-font-studio-preset.zip", size: archive.length, digest: `sha256:${sha(archive)}`}, 201);
            if (url.endsWith("/contents/catalog.json") && init.method === "PUT") return json({content: {sha: "new-sha"}}, 201);
            if (url.endsWith("/issues/42/comments")) return json({id: 1}, 201);
            throw new Error(`Unexpected ${init.method || "GET"} ${url}`);
        }));
        try {
            await publishIssue(42, "test-token");
            const upload = calls.find((call) => call.url.startsWith("https://uploads.github.com/"));
            expect(sha(upload.body)).toBe(sha(archive));
            const saved = calls.find((call) => call.url.endsWith("/contents/catalog.json") && call.method === "PUT");
            const published = JSON.parse(Buffer.from(JSON.parse(saved.body).content, "base64").toString());
            expect(published.presets[0]).toMatchObject({packageSha256: sha(archive), packageSize: archive.length});
        } finally {
            vi.unstubAllGlobals();
        }
    }, 15_000);

    it("publishes an approved Issue through Release and catalog API", async () => {
        const bytes = strToU8(JSON.stringify(config));
        const calls = [];
        const json = (value, status = 200) => new Response(JSON.stringify(value), {status, headers: {"content-type": "application/json"}});
        const fetcher = vi.fn(async (input, init = {}) => {
            const url = String(input);
            calls.push({url, method: init.method || "GET", body: init.body});
            if (url.endsWith("/issues/42") && !init.method) return json({number: 42, title: "[字体方案分享] 自拟的方案名称", body, html_url: "https://github.com/MDfox-ChaosZone/siyuan-font-studio/issues/42", user: {login: "alice", html_url: "https://github.com/alice"}, labels: [{name: "字体方案分享"}, {name: "publish-approved"}]});
            if (url.endsWith("/user-attachments/assets/package-id")) return new Response(bytes);
            if (url.includes("/contents/catalog.json?ref=main")) return json({sha: "catalog-sha", content: Buffer.from(JSON.stringify({version: 1, updatedAt: "2026-09-23T00:00:00Z", presets: []})).toString("base64")});
            if (url.endsWith("/releases/tags/社区字体方案")) return json({id: 8, upload_url: "https://uploads.github.com/repos/MDfox-ChaosZone/siyuan-font-studio/releases/8/assets{?name,label}", assets: []});
            if (url.startsWith("https://api.github.com/") && url.includes("/releases/8/assets?")) return json([]);
            if (url.startsWith("https://uploads.github.com/")) return json({browser_download_url: "https://github.com/MDfox-ChaosZone/siyuan-font-studio/releases/download/社区字体方案/issue-42.siyuan-font-studio-preset.json", size: bytes.length, digest: `sha256:${sha(bytes)}`}, 201);
            if (url.endsWith("/contents/catalog.json") && init.method === "PUT") return json({content: {sha: "new-sha"}}, 201);
            if (url.endsWith("/issues/42/comments")) return json({id: 1}, 201);
            if (url.endsWith("/issues/42") && init.method === "PATCH") return json({state: "closed"});
            throw new Error(`Unexpected ${init.method || "GET"} ${url}`);
        });
        vi.stubGlobal("fetch", fetcher);
        try {
            await publishIssue(42, "test-token");
            const saved = calls.find((call) => call.url.endsWith("/contents/catalog.json") && call.method === "PUT");
            expect(JSON.parse(saved.body)).toMatchObject({branch: "main", sha: "catalog-sha"});
            const published = JSON.parse(Buffer.from(JSON.parse(saved.body).content, "base64").toString());
            expect(published.presets[0]).toMatchObject({id: "issue-42", name: "自拟的方案名称", packageSha256: sha(bytes), description: "适合阅读。"});
            expect(calls.some((call) => call.url.endsWith("/releases") && call.method === "POST")).toBe(false);
            expect(calls.some((call) => call.url.endsWith("/issues/42") && call.method === "PATCH")).toBe(false);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it("reuses a manually staged shared Release asset", async () => {
        const bytes = strToU8(JSON.stringify(config));
        const assetUrl = "https://github.com/MDfox-ChaosZone/siyuan-font-studio/releases/download/社区字体方案/issue-42.siyuan-font-studio-preset.json";
        const stagedBody = body.replace("https://github.com/user-attachments/assets/package-id", assetUrl);
        const calls = [];
        const json = (value, status = 200) => new Response(JSON.stringify(value), {status, headers: {"content-type": "application/json"}});
        vi.stubGlobal("fetch", vi.fn(async (input, init = {}) => {
            const url = String(input);
            calls.push({url, method: init.method || "GET", body: init.body});
            if (url.endsWith("/issues/42") && !init.method) return json({title: "[字体方案分享] 自拟的方案名称", body: stagedBody, html_url: "https://github.com/MDfox-ChaosZone/siyuan-font-studio/issues/42", user: {login: "alice", html_url: "https://github.com/alice"}, labels: [{name: "字体方案分享"}, {name: "publish-approved"}]});
            if (url === assetUrl) return new Response(bytes);
            if (url.includes("/contents/catalog.json?ref=main")) return json({sha: "catalog-sha", content: Buffer.from(JSON.stringify({version: 1, presets: []})).toString("base64")});
            if (url.endsWith("/releases/tags/社区字体方案")) return json({id: 8, upload_url: "https://uploads.github.com/repos/MDfox-ChaosZone/siyuan-font-studio/releases/8/assets{?name,label}", assets: [{name: "issue-42.siyuan-font-studio-preset.json", browser_download_url: assetUrl, size: bytes.length, digest: `sha256:${sha(bytes)}`}]});
            if (url.endsWith("/contents/catalog.json") && init.method === "PUT") return json({content: {sha: "new-sha"}}, 201);
            if (url.endsWith("/issues/42/comments")) return json({id: 1}, 201);
            throw new Error(`Unexpected ${init.method || "GET"} ${url}`);
        }));
        try {
            await publishIssue(42, "test-token");
            expect(calls.some((call) => call.url.startsWith("https://uploads.github.com/"))).toBe(false);
            expect(calls.some((call) => call.url.endsWith("/issues/42") && call.method === "PATCH")).toBe(false);
            expect(calls.some((call) => call.url.endsWith("/contents/catalog.json") && call.method === "PUT")).toBe(true);
        } finally {
            vi.unstubAllGlobals();
        }
    });
});
