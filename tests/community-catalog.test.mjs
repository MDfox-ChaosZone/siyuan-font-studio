import {createHash} from "node:crypto";
import {describe, expect, it, vi} from "vitest";
import {strToU8, zipSync} from "fflate";
import {inspectPresetPackage, isAllowedAttachmentUrl, parseIssueBody, publishIssue} from "../scripts/community-catalog.mjs";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const targets = Object.fromEntries(["ui", "content", "mono", "math", "graph", "emoji", "mermaid"].map((key) => [key, {fonts: [], size: null}]));
const config = {format: "siyuan-font-studio-preset", version: 1, name: "测试方案", targets};
const body = `### 简介\n适合阅读。\n\n### 效果截图\n![效果](https://github.com/user-attachments/assets/preview-id)\n\n### 字体授权确认\n- [x] 我已确认所用字体可免费商用或开源；若方案文件包含字体，我也确认这些字体允许随方案再分发。\n\n### 方案文件\n[方案](https://github.com/user-attachments/assets/package-id)`;

describe("community submission", () => {
    it("reads the standardized Issue form and validates a portable package", () => {
        expect(parseIssueBody(body, "自拟的方案名称")).toMatchObject({name: "自拟的方案名称", attachment: "https://github.com/user-attachments/assets/package-id"});
        expect(parseIssueBody(body.replace("适合阅读。", "_No response_").replace(/!\[效果\]\([^)]*\)/, "_No response_"), "自拟的方案名称"))
            .toMatchObject({description: "", preview: undefined});
        expect(() => parseIssueBody(body.replace("- [x]", "- [ ]"), "自拟的方案名称")).toThrow("请勾选字体授权确认");
        expect(parseIssueBody(body.replace("https://github.com/user-attachments/assets/package-id", "https://downloads.example.com/preset.zip?token=abc"), "自拟的方案名称").attachment)
            .toBe("https://downloads.example.com/preset.zip?token=abc");
        expect(isAllowedAttachmentUrl("https://localhost/preset.zip")).toBe(false);
        expect(isAllowedAttachmentUrl("http://downloads.example.com/preset.zip")).toBe(false);
        const bytes = strToU8(JSON.stringify(config));
        expect(inspectPresetPackage(bytes, "preset.json")).toMatchObject({name: "测试方案", includesFonts: false, sha256: sha(bytes)});
        const zip = zipSync({"preset.json": bytes});
        expect(inspectPresetPackage(zip)).toMatchObject({name: "测试方案", includesFonts: false});
        expect(() => inspectPresetPackage(zipSync({"preset.json": strToU8(JSON.stringify({...config, version: 99}))}))).toThrow("无效的方案格式或版本");
    });

    it("publishes an approved Issue through Release and catalog API", async () => {
        const bytes = strToU8(JSON.stringify(config));
        const calls = [];
        const json = (value, status = 200) => new Response(JSON.stringify(value), {status, headers: {"content-type": "application/json"}});
        const fetcher = vi.fn(async (input, init = {}) => {
            const url = String(input);
            calls.push({url, method: init.method || "GET", body: init.body});
            if (url.endsWith("/issues/42") && !init.method) return json({number: 42, title: "自拟的方案名称", body, html_url: "https://github.com/MDfox-ChaosZone/siyuan-font-studio/issues/42", user: {login: "alice", html_url: "https://github.com/alice"}, labels: [{name: "publish-approved"}]});
            if (url.endsWith("/user-attachments/assets/package-id")) return new Response(bytes);
            if (url.includes("/contents/catalog.json?ref=main")) return json({sha: "catalog-sha", content: Buffer.from(JSON.stringify({version: 1, updatedAt: "2026-09-23T00:00:00Z", presets: []})).toString("base64")});
            if (url.endsWith("/releases/tags/community-preset-issue-42")) return json({message: "Not Found"}, 404);
            if (url.endsWith("/releases") && init.method === "POST") return json({id: 8, upload_url: "https://uploads.github.com/repos/MDfox-ChaosZone/siyuan-font-studio/releases/8/assets{?name,label}", assets: []}, 201);
            if (url.startsWith("https://uploads.github.com/")) return json({browser_download_url: "https://github.com/MDfox-ChaosZone/siyuan-font-studio/releases/download/community-preset-issue-42/issue-42.siyuan-font-studio-preset.json", size: bytes.length, digest: `sha256:${sha(bytes)}`}, 201);
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
            expect(calls.some((call) => call.url.endsWith("/issues/42") && call.method === "PATCH")).toBe(true);
        } finally {
            vi.unstubAllGlobals();
        }
    });
});
