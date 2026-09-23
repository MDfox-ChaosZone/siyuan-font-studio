import {createHash} from "node:crypto";
import {describe, expect, it, vi} from "vitest";
import {strToU8, zipSync} from "fflate";
import {inspectPresetPackage, parseIssueBody, publishIssue} from "../scripts/community-catalog.mjs";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const targets = Object.fromEntries(["ui", "content", "mono", "math", "graph", "emoji", "mermaid"].map((key) => [key, {fonts: [], size: null}]));
const config = {format: "siyuan-font-studio-preset", version: 1, name: "测试方案", targets};
const body = `### 方案名称\n测试方案\n\n### 简介\n适合阅读。\n\n### 效果截图\n![效果](https://github.com/user-attachments/assets/preview-id)\n\n### 字体来源与授权\n仅配置，无打包字体。\n\n### 方案文件\n[方案](https://github.com/user-attachments/assets/package-id)`;

describe("community submission", () => {
    it("reads the standardized Issue form and validates a portable package", () => {
        expect(parseIssueBody(body).attachment).toBe("https://github.com/user-attachments/assets/package-id");
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
            if (url.endsWith("/issues/42") && !init.method) return json({number: 42, body, html_url: "https://github.com/MDfox-ChaosZone/siyuan-font-studio/issues/42", user: {login: "alice", html_url: "https://github.com/alice"}, labels: [{name: "publish-approved"}]});
            if (url.endsWith("/user-attachments/assets/package-id")) return new Response(bytes);
            if (url.includes("/contents/catalog.json?")) return json({message: "Not Found"}, 404);
            if (url.endsWith("/releases/tags/community-preset-issue-42")) return json({message: "Not Found"}, 404);
            if (url.endsWith("/releases") && init.method === "POST") return json({id: 8, upload_url: "https://uploads.github.com/repos/MDfox-ChaosZone/siyuan-font-studio/releases/8/assets{?name,label}", assets: []}, 201);
            if (url.startsWith("https://uploads.github.com/")) return json({browser_download_url: "https://github.com/MDfox-ChaosZone/siyuan-font-studio/releases/download/community-preset-issue-42/issue-42.siyuan-font-studio-preset.json", size: bytes.length, digest: `sha256:${sha(bytes)}`}, 201);
            if (url.endsWith("/repos/MDfox-ChaosZone/siyuan-font-studio")) return json({default_branch: "main"});
            if (url.endsWith("/git/ref/heads/main")) return json({object: {sha: "base-sha"}});
            if (url.endsWith("/git/refs")) return json({ref: "refs/heads/community-catalog"}, 201);
            if (url.endsWith("/contents/catalog.json") && init.method === "PUT") return json({content: {sha: "new-sha"}}, 201);
            if (url.endsWith("/issues/42/comments")) return json({id: 1}, 201);
            if (url.endsWith("/issues/42") && init.method === "PATCH") return json({state: "closed"});
            throw new Error(`Unexpected ${init.method || "GET"} ${url}`);
        });
        vi.stubGlobal("fetch", fetcher);
        try {
            await publishIssue(42, "test-token");
            const saved = calls.find((call) => call.url.endsWith("/contents/catalog.json") && call.method === "PUT");
            const published = JSON.parse(Buffer.from(JSON.parse(saved.body).content, "base64").toString());
            expect(published.presets[0]).toMatchObject({id: "issue-42", packageSha256: sha(bytes), description: "适合阅读。"});
            expect(calls.some((call) => call.url.endsWith("/issues/42") && call.method === "PATCH")).toBe(true);
        } finally {
            vi.unstubAllGlobals();
        }
    });
});
