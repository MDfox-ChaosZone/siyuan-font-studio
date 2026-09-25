import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {unzipSync, strFromU8} from "fflate";

export const REPO = "MDfox-ChaosZone/siyuan-font-studio";
export const CATALOG_BRANCH = "main";
export const COMMUNITY_RELEASE_TAG = "社区字体方案";
export const MAX_PACKAGE_BYTES = 100 * 1024 * 1024;
const MAX_UNPACKED_BYTES = 500 * 1024 * 1024;
const TARGETS = ["ui", "content", "mono", "math", "graph", "emoji", "mermaid"];
const ACCEPTED_EXTENSIONS = new Set(["woff2", "woff", "ttf", "otf"]);
const MAX_SHARE_PARTS = 5;
const MAX_SHARE_PART_BYTES = 25_000_000;
const MAX_CHUNK_BYTES = 24_000_000;

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const apiHeaders = (token) => ({Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", Authorization: `Bearer ${token}`});

export function parseIssueBody(body, title) {
    const fields = new Map();
    for (const [, title, content] of body.matchAll(/(?:^|\n)### ([^\n]+)\n([\s\S]*?)(?=\n### |$)/g)) fields.set(title.trim(), content.trim());
    const prefix = "[字体方案分享]";
    if (!title?.startsWith(prefix)) throw new Error(`Issue 标题须保留 ${prefix} 前缀`);
    const name = title.slice(prefix.length).trim();
    if (!name || name.length > 100) throw new Error("请在标题前缀后填写 1–100 字的名称或文字");
    const required = ["字体方案压缩包"];
    if (required.some((key) => !fields.get(key) || fields.get(key) === "_No response_")) throw new Error(`缺少投稿字段：${required.filter((key) => !fields.get(key) || fields.get(key) === "_No response_").join("、")}`);
    const attachments = [...fields.get("字体方案压缩包").matchAll(/https:\/\/[^\s)>]+/gi)].map(([url]) => url);
    if (!attachments.length || attachments.length > MAX_SHARE_PARTS || new Set(attachments).size !== attachments.length
        || attachments.some((url) => !isAllowedAttachmentUrl(url))) throw new Error("方案文件须为 1–5 个不同的 Issue 附件或可直接下载的 HTTPS 链接");
    const attachment = attachments[0];
    const preview = fields.get("效果截图")?.match(/https:\/\/github\.com\/user-attachments\/assets\/[\w-]+/i)?.[0];
    if (fields.get("效果截图") && fields.get("效果截图") !== "_No response_" && !preview) throw new Error("效果截图须为 GitHub Issue 附件");
    const description = fields.get("字体方案介绍") === "_No response_" ? "" : fields.get("字体方案介绍") || "";
    if (description.length > 1000) throw new Error("字体方案介绍超过 1000 字");
    return {
        name,
        description,
        attachment,
        attachments,
        preview,
    };
}

export function isAllowedAttachmentUrl(value) {
    try {
        const url = new URL(value);
        return url.protocol === "https:" && !url.username && !url.password && !url.port
            && url.hostname.includes(".") && !url.hostname.endsWith(".local") && !url.hostname.endsWith(".internal")
            && !/^(?:localhost|\d+\.\d+\.\d+\.\d+|\[.*\])$/i.test(url.hostname);
    } catch {
        return false;
    }
}

function safeString(value, max = 120) {
    return typeof value === "string" && value.trim() && value.length <= max;
}

function validWeight(value) {
    return value === undefined || typeof value === "number" && Number.isFinite(value) && value >= 1 && value <= 1000;
}

function choiceInfo(choice, fontMap) {
    if (!choice || typeof choice !== "object") throw new Error("无效的字体选择");
    if (choice.kind === "default") return {name: "SiYuan", weight: {value: null}};
    if (choice.kind === "system" && safeString(choice.family) && safeString(choice.displayName) && validWeight(choice.weight))
        return {name: choice.displayName, weight: {value: typeof choice.weight === "number" ? choice.weight : null}};
    if (choice.kind === "imported" && /^[a-f0-9]{64}$/i.test(choice.sha256) && validWeight(choice.weight)
        && (choice.displayName === undefined || safeString(choice.displayName))) {
        const font = fontMap.get(choice.sha256.toLowerCase());
        return {name: font?.displayName || choice.displayName || choice.sha256, weight: {value: typeof choice.weight === "number" ? choice.weight : null}};
    }
    throw new Error("无效的字体选择");
}

function row(target, settings, fontMap) {
    if (!settings || !Array.isArray(settings.fonts) || settings.fonts.length > 12
        || !(settings.size === null || Number.isFinite(settings.size) && settings.size >= 1 && settings.size <= 200)) throw new Error(`无效的 ${target} 设置`);
    const choices = settings.fonts.length ? settings.fonts : [{kind: "default"}];
    const details = choices.map((choice) => choiceInfo(choice, fontMap));
    return {target, fonts: details.map(({name}) => name), size: settings.size, weights: details.map(({weight}) => weight)};
}

export function inspectPresetPackage(bytes, filename = "preset.zip") {
    if (!bytes.length || bytes.length > MAX_PACKAGE_BYTES) throw new Error("方案文件超过 100 MB 或为空");
    const isJson = filename.toLowerCase().endsWith(".json") || bytes[0] === 0x7b;
    let config;
    let files = {};
    if (isJson) config = JSON.parse(Buffer.from(bytes).toString("utf8"));
    else {
        let unpacked = 0;
        const names = new Set();
        files = unzipSync(bytes, {filter: (file) => {
            if (names.has(file.name)) throw new Error("方案包包含重复文件");
            names.add(file.name);
            if (names.size > 103) throw new Error("方案包文件数量过多");
            if (file.name !== "preset.json" && file.name !== "README.md"
                && !/^fonts\/[a-zA-Z0-9._-]+\.(?:woff2|woff|ttf|otf)$/i.test(file.name))
                throw new Error(`方案包包含不允许的文件：${file.name.slice(0, 100)}`);
            if (file.name === "README.md" && file.originalSize > 256 * 1024) throw new Error("README.md 超过 256 KB");
            unpacked += file.originalSize;
            if (unpacked > MAX_UNPACKED_BYTES) throw new Error("解压后文件超过 500 MB");
            return true;
        }});
        if (!files["preset.json"]) throw new Error("缺少 preset.json");
        config = JSON.parse(strFromU8(files["preset.json"]));
    }
    if (!config || config.format !== "siyuan-font-studio-preset" || config.version !== 1
        || !safeString(config.name, 100) || !config.targets || typeof config.targets !== "object") throw new Error("无效的方案格式或版本");
    const fontMap = new Map();
    const declaredPaths = new Set();
    for (const font of config.bundledFonts || []) {
        if (!font || !/^fonts\/[a-zA-Z0-9._-]+$/.test(font.path) || !/^[a-f0-9]{64}$/i.test(font.sha256)
            || !ACCEPTED_EXTENSIONS.has(font.extension?.toLowerCase()) || !safeString(font.displayName)
            || !safeString(font.originalName) || !Number.isSafeInteger(font.size) || font.size < 1 || font.size > MAX_PACKAGE_BYTES
            || !font.path.toLowerCase().endsWith(`.${font.extension.toLowerCase()}`)
            || !files[font.path] || files[font.path].length !== font.size || digest(files[font.path]) !== font.sha256.toLowerCase()) throw new Error("字体文件与清单不一致");
        const signature = Buffer.from(files[font.path].subarray(0, 4)).toString("ascii");
        if (!(signature === "wOF2" && font.extension.toLowerCase() === "woff2"
            || signature === "wOFF" && font.extension.toLowerCase() === "woff"
            || signature === "OTTO" && font.extension.toLowerCase() === "otf"
            || signature === "\u0000\u0001\u0000\u0000" && font.extension.toLowerCase() === "ttf")) throw new Error("字体文件格式与扩展名不一致");
        if (declaredPaths.has(font.path)) throw new Error("字体清单包含重复文件");
        declaredPaths.add(font.path);
        fontMap.set(font.sha256.toLowerCase(), font);
    }
    if (Object.keys(files).some((path) => path.startsWith("fonts/") && !declaredPaths.has(path)))
        throw new Error("方案包包含未在清单中声明的字体文件");
    const rows = [];
    for (const target of TARGETS) {
        const settings = config.targets[target];
        if ((target === "mono" || target === "math") && settings?.decoupled) {
            if (!settings.secondary) throw new Error(`缺少 ${target} 的第二组设置`);
            rows.push(row(target === "mono" ? "inlineCode" : "inlineFormula", settings, fontMap));
            rows.push(row(target === "mono" ? "codeBlock" : "formulaBlock", settings.secondary, fontMap));
        } else rows.push(row(target, settings, fontMap));
    }
    return {name: config.name, rows, includesFonts: fontMap.size > 0, sha256: digest(bytes), size: bytes.length};
}

export async function readPackageFile(path) {
    const bytes = await readFile(path);
    return inspectPresetPackage(bytes, path);
}

async function requestJson(url, token, init = {}) {
    const response = await fetch(url, {...init, headers: {...apiHeaders(token), ...init.headers}});
    if (!response.ok) throw new Error(`GitHub API ${response.status}: ${(await response.text()).slice(0, 300)}`);
    return response.status === 204 ? null : response.json();
}

async function downloadAttachment(url) {
    let response;
    for (let redirects = 0; redirects <= 5; redirects++) {
        if (!isAllowedAttachmentUrl(url)) throw new Error("下载地址必须是公开的 HTTPS 地址");
        response = await fetch(url, {redirect: "manual", signal: AbortSignal.timeout(300_000)});
        if (![301, 302, 303, 307, 308].includes(response.status)) break;
        if (redirects === 5) throw new Error("下载地址重定向次数过多");
        const location = response.headers.get("location");
        if (!location) throw new Error("下载地址重定向缺少目标");
        url = new URL(location, url).href;
    }
    if (!response.ok) throw new Error(`附件下载失败：HTTP ${response.status}`);
    const length = Number(response.headers.get("content-length"));
    if (length > MAX_PACKAGE_BYTES) throw new Error("方案文件超过 100 MB");
    const chunks = [];
    let total = 0;
    for await (const chunk of response.body) {
        total += chunk.length;
        if (total > MAX_PACKAGE_BYTES) throw new Error("方案文件超过 100 MB");
        chunks.push(chunk);
    }
    return Buffer.concat(chunks, total);
}

function readSplitPart(bytes) {
    if (!bytes.length || bytes.length >= MAX_SHARE_PART_BYTES) throw new Error("分包附件必须小于 25 MB");
    const names = new Set();
    const files = unzipSync(bytes, {filter: (file) => {
        if (names.has(file.name) || !["part.json", "data.bin"].includes(file.name)) throw new Error("分包 ZIP 包含重复或额外文件");
        names.add(file.name);
        if (file.originalSize > (file.name === "part.json" ? 1024 : MAX_CHUNK_BYTES)) throw new Error("分包内容过大");
        return true;
    }});
    if (!files["part.json"] || !files["data.bin"] || names.size !== 2) throw new Error("分包 ZIP 缺少 part.json 或 data.bin");
    const manifest = JSON.parse(strFromU8(files["part.json"]));
    if (manifest?.format !== "siyuan-font-studio-preset-part" || manifest.version !== 1
        || !Number.isSafeInteger(manifest.index) || !Number.isSafeInteger(manifest.total)
        || manifest.index < 1 || manifest.total < 2 || manifest.total > MAX_SHARE_PARTS || manifest.index > manifest.total
        || !Number.isSafeInteger(manifest.archiveSize) || manifest.archiveSize < 1 || manifest.archiveSize > MAX_PACKAGE_BYTES
        || !/^[a-f0-9]{64}$/.test(manifest.archiveSha256) || !/^[a-f0-9]{64}$/.test(manifest.chunkSha256)
        || !files["data.bin"].length || digest(files["data.bin"]) !== manifest.chunkSha256) throw new Error("分包元数据或分包哈希无效");
    return {manifest, chunk: files["data.bin"]};
}

async function downloadSubmission(attachments) {
    if (attachments.length === 1) {
        const bytes = await downloadAttachment(attachments[0]);
        const filename = new URL(attachments[0]).pathname.split("/").at(-1);
        try {
            return {bytes, info: inspectPresetPackage(bytes, filename)};
        } catch (error) {
            try {
                const part = readSplitPart(bytes);
                throw new Error(`检测到第 ${part.manifest.index}/${part.manifest.total} 个分包；请在同一字段上传全部分包链接`);
            } catch (partError) {
                if (String(partError.message).startsWith("检测到第 ")) throw partError;
                throw error;
            }
        }
    }
    const partBytes = [];
    for (const url of attachments) partBytes.push(await downloadAttachment(url));
    return assembleSplitParts(partBytes);
}

export function assembleSplitParts(partBytes) {
    if (!Array.isArray(partBytes) || partBytes.length < 2 || partBytes.length > MAX_SHARE_PARTS) throw new Error("需要 2–5 个分包");
    const parts = partBytes.map(readSplitPart);
    const first = parts[0].manifest;
    const byIndex = new Map();
    let size = 0;
    for (const {manifest, chunk} of parts) {
        if (manifest.total !== parts.length || manifest.total !== first.total
            || manifest.archiveSize !== first.archiveSize || manifest.archiveSha256 !== first.archiveSha256
            || byIndex.has(manifest.index)) throw new Error("分包数量、编号或整包信息不一致");
        byIndex.set(manifest.index, chunk);
        size += chunk.length;
        if (size > MAX_PACKAGE_BYTES) throw new Error("组装后的方案包超过 100 MB");
    }
    if (size !== first.archiveSize) throw new Error("组装后的方案包大小不匹配");
    const bytes = Buffer.concat(Array.from({length: parts.length}, (_, index) => {
        const chunk = byIndex.get(index + 1);
        if (!chunk) throw new Error("缺少分包");
        return chunk;
    }), size);
    if (digest(bytes) !== first.archiveSha256) throw new Error("组装后的方案包 SHA-256 不匹配");
    return {bytes, info: inspectPresetPackage(bytes)};
}

async function issueSubmission(number, token) {
    const issue = await requestJson(`https://api.github.com/repos/${REPO}/issues/${number}`, token);
    if (issue.pull_request || !issue.body || !issue.labels?.some((label) => label.name === "字体方案分享")) throw new Error("找不到带有字体方案分享标签的投稿 Issue");
    const form = parseIssueBody(issue.body, issue.title);
    const {bytes, info} = await downloadSubmission(form.attachments);
    return {issue, form, bytes, info};
}

async function comment(number, token, body) {
    await requestJson(`https://api.github.com/repos/${REPO}/issues/${number}/comments`, token, {method: "POST", body: JSON.stringify({body})});
}

async function catalogFile(token) {
    try {
        const file = await requestJson(`https://api.github.com/repos/${REPO}/contents/catalog.json?ref=${CATALOG_BRANCH}`, token);
        return {sha: file.sha, catalog: JSON.parse(Buffer.from(file.content.replace(/\n/g, ""), "base64").toString("utf8"))};
    } catch (error) {
        if (!String(error).includes("GitHub API 404")) throw error;
        return {sha: undefined, catalog: {version: 1, updatedAt: new Date().toISOString(), presets: []}};
    }
}

async function saveCatalog(catalog, sha, token) {
    await requestJson(`https://api.github.com/repos/${REPO}/contents/catalog.json`, token, {
        method: "PUT",
        body: JSON.stringify({message: "Update community font preset catalog", content: Buffer.from(JSON.stringify(catalog, null, 2) + "\n").toString("base64"), branch: CATALOG_BRANCH, ...(sha ? {sha} : {})}),
    });
}

async function findReleaseAsset(release, name, token) {
    const initial = release.assets?.find((asset) => asset.name === name);
    if (initial) return initial;
    for (let page = 1; page <= 10; page++) {
        const assets = await requestJson(`https://api.github.com/repos/${REPO}/releases/${release.id}/assets?per_page=100&page=${page}`, token);
        const found = assets.find((asset) => asset.name === name);
        if (found) return found;
        if (assets.length < 100) break;
    }
    return undefined;
}

export async function validateIssue(number, token) {
    try {
        const {info, form} = await issueSubmission(number, token);
        await comment(number, token, `✅ 自动检查通过。文件 SHA-256：\`${info.sha256}\`，大小：${info.size} 字节，${info.includesFonts ? "包含字体" : "仅配置"}。\n\n请维护者核对截图、字体授权与实际效果；确认后添加 \`publish-approved\` 标签。`);
        return {info, form};
    } catch (error) {
        await comment(number, token, `❌ 自动检查未通过：${String(error.message || error).slice(0, 500)}`);
        throw error;
    }
}

export async function publishIssue(number, token) {
    const {issue, form, bytes, info} = await issueSubmission(number, token);
    if (issue.state === "closed") throw new Error("投稿 Issue 已关闭，不能发布");
    if (!issue.labels?.some((label) => label.name === "publish-approved")) throw new Error("缺少 publish-approved 审核标签");
    if (process.env.GITHUB_EVENT_PATH && process.env.GITHUB_EVENT_NAME === "issues") {
        const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8"));
        if (event.issue?.body !== issue.body || event.issue?.title !== issue.title) throw new Error("审核后 Issue 标题或内容已修改，请重新审核");
    }
    const {sha: catalogSha, catalog} = await catalogFile(token);
    if (catalog.presets.some((preset) => preset.issueUrl === issue.html_url)) throw new Error("该 Issue 已发布；更新方案须另开投稿");
    const id = `issue-${number}`;
    const tag = COMMUNITY_RELEASE_TAG;
    let release;
    try {
        release = await requestJson(`https://api.github.com/repos/${REPO}/releases/tags/${tag}`, token);
    } catch (error) {
        if (!String(error).includes("GitHub API 404")) throw error;
        release = await requestJson(`https://api.github.com/repos/${REPO}/releases`, token, {method: "POST", body: JSON.stringify({tag_name: tag, name: "社区字体方案", body: "社区成员分享的字体方案文件。方案列表、简介与下载入口见插件内的下载页。", draft: false, prerelease: false, make_latest: "false"})});
    }
    const ext = bytes[0] === 0x7b ? "json" : "zip";
    const assetName = `${id}.siyuan-font-studio-preset.${ext}`;
    let asset = await findReleaseAsset(release, assetName, token);
    if (!asset) {
        const uploadUrl = release.upload_url.replace(/\{.*$/, "") + `?name=${encodeURIComponent(assetName)}`;
        asset = await requestJson(uploadUrl, token, {method: "POST", headers: {"Content-Type": "application/octet-stream"}, body: bytes});
    }
    const url = asset.browser_download_url;
    if (asset.size !== info.size) throw new Error("Release 文件大小不匹配");
    if (asset.digest && asset.digest !== `sha256:${info.sha256}`) throw new Error("Release 文件哈希不匹配");
    if (!asset.digest && asset.browser_download_url !== form.attachment
        && digest(await downloadAttachment(asset.browser_download_url)) !== info.sha256) throw new Error("Release 文件哈希不匹配");
    catalog.presets.push({
        id, name: form.name, description: form.description, author: issue.user.login,
        authorUrl: issue.user.html_url, issueUrl: issue.html_url, ...(form.preview ? {previewUrl: form.preview} : {}),
        packageUrl: url, packageSize: info.size, packageSha256: info.sha256,
        includesFonts: info.includesFonts, rows: info.rows,
    });
    catalog.updatedAt = new Date().toISOString();
    await saveCatalog(catalog, catalogSha, token);
    await comment(number, token, `🎉 已发布到字体方案目录：${url}\n\n目录更新可能需要几分钟才能在客户端显示。如需自主下架，原投稿者关闭本 Issue 即可。`);
}

export async function withdrawIssue(number, actorId, token) {
    if (!Number.isSafeInteger(actorId) || actorId < 1) throw new Error("需要有效的操作人 ID");
    const issue = await requestJson(`https://api.github.com/repos/${REPO}/issues/${number}`, token);
    const issueUrl = `https://github.com/${REPO}/issues/${number}`;
    if (issue.pull_request || issue.html_url !== issueUrl || !issue.labels?.some((label) => label.name === "字体方案分享")
        || issue.state !== "closed" || !issue.user?.id || actorId !== issue.user.id)
        throw new Error("仅原投稿者关闭自己的字体方案 Issue 时才能撤回方案");

    const {sha, catalog} = await catalogFile(token);
    const id = `issue-${number}`;
    const entries = catalog.presets.filter((preset) => preset.id === id || preset.issueUrl === issueUrl);
    if (entries.length > 1 || entries.some((preset) => preset.id !== id || preset.issueUrl !== issueUrl))
        throw new Error("目录中的 Issue 与方案编号不一致，请维护者检查");
    const entry = entries[0];
    const names = [`${id}.siyuan-font-studio-preset.zip`, `${id}.siyuan-font-studio-preset.json`];
    let release;
    try {
        release = await requestJson(`https://api.github.com/repos/${REPO}/releases/tags/${COMMUNITY_RELEASE_TAG}`, token);
    } catch (error) {
        if (!String(error).includes("GitHub API 404")) throw error;
    }
    const assets = release ? (await Promise.all(names.map((name) => findReleaseAsset(release, name, token)))).filter(Boolean) : [];
    if (entry && !assets.some((asset) => asset.browser_download_url === entry.packageUrl))
        throw new Error("目录下载地址与共用 Release 附件不一致，请维护者检查");
    if (assets.some((asset) => !Number.isSafeInteger(asset.id) || asset.id < 1))
        throw new Error("Release 附件缺少有效 ID");

    try {
        await requestJson(`https://api.github.com/repos/${REPO}/issues/${number}/labels/publish-approved`, token, {method: "DELETE"});
    } catch (error) {
        if (!String(error).includes("GitHub API 404")) throw error;
    }
    if (entry) {
        catalog.presets = catalog.presets.filter((preset) => preset !== entry);
        catalog.updatedAt = new Date().toISOString();
        await saveCatalog(catalog, sha, token);
    }
    for (const asset of assets) {
        try {
            await requestJson(`https://api.github.com/repos/${REPO}/releases/assets/${asset.id}`, token, {method: "DELETE"});
        } catch (error) {
            if (!String(error).includes("GitHub API 404")) throw error;
        }
    }
    await comment(number, token, entry || assets.length
        ? "🗑️ 已按原投稿者要求撤回方案：已从插件目录下架，并清理共用 Release 中对应的方案附件。Issue 投稿附件及用户已下载的副本不会随之删除。"
        : "ℹ️ 此方案已撤回，目录和共用 Release 中均无对应文件。");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    const [, , command, numberText, actorIdText] = process.argv;
    const number = Number(numberText);
    const token = process.env.GITHUB_TOKEN;
    if (!token || !Number.isSafeInteger(number) || number < 1) throw new Error("需要 GITHUB_TOKEN 和有效 Issue 编号");
    if (command === "validate") await validateIssue(number, token);
    else if (command === "publish") await publishIssue(number, token);
    else if (command === "withdraw") await withdrawIssue(number, Number(actorIdText), token);
    else throw new Error("命令须为 validate、publish 或 withdraw");
}
