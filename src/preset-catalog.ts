import {PresetCatalogItem, PresetCatalogRow} from "./example-preset";

export const COMMUNITY_CATALOG_URL = "https://raw.githubusercontent.com/MDfox-ChaosZone/siyuan-font-studio/refs/heads/community-catalog/catalog.json";
export const MAX_CATALOG_BYTES = 1024 * 1024;

export interface CommunityCatalog {
    version: 1;
    updatedAt: string;
    presets: PresetCatalogItem[];
}

const TARGETS = new Set(["ui", "content", "mono", "inlineCode", "codeBlock", "math", "inlineFormula", "formulaBlock", "graph", "emoji", "mermaid"]);
const PACKAGE_PREFIX = "https://github.com/MDfox-ChaosZone/siyuan-font-studio/releases/download/";

function record(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

function safeText(value: unknown, limit: number): value is string {
    return typeof value === "string" && value.trim().length > 0 && value.length <= limit;
}

function safeUrl(value: unknown, host: string, prefix = "/"): value is string {
    if (typeof value !== "string") return false;
    try {
        const url = new URL(value);
        return url.protocol === "https:" && url.hostname === host && url.pathname.startsWith(prefix)
            && !url.username && !url.password;
    } catch {
        return false;
    }
}

function parseRow(value: unknown): PresetCatalogRow {
    if (!record(value) || !TARGETS.has(String(value.target)) || !Array.isArray(value.fonts)
        || value.fonts.length > 12 || !value.fonts.every((font) => safeText(font, 120))
        || !(value.size === null || typeof value.size === "number" && Number.isFinite(value.size) && value.size >= 1 && value.size <= 200)
        || !Array.isArray(value.weights) || value.weights.length !== value.fonts.length
        || !value.weights.every((weight) => record(weight) && (weight.value === null
            || typeof weight.value === "number" && Number.isFinite(weight.value) && weight.value >= 1 && weight.value <= 1000)
            && (weight.variable === undefined || typeof weight.variable === "boolean"))) {
        throw new Error("invalid-catalog");
    }
    return value as unknown as PresetCatalogRow;
}

export function parseCommunityCatalog(value: unknown): CommunityCatalog {
    if (!record(value) || value.version !== 1 || typeof value.updatedAt !== "string"
        || !Array.isArray(value.presets) || value.presets.length > 500) throw new Error("invalid-catalog");
    const ids = new Set<string>();
    const presets = value.presets.map((raw): PresetCatalogItem => {
        if (!record(raw) || !safeText(raw.id, 80) || !/^[a-z0-9][a-z0-9-]*$/.test(raw.id) || ids.has(raw.id)
            || !safeText(raw.name, 100) || !safeText(raw.description, 1000)
            || !safeText(raw.author, 100) || !safeUrl(raw.authorUrl, "github.com")
            || !safeUrl(raw.issueUrl, "github.com", "/MDfox-ChaosZone/siyuan-font-studio/issues/")
            || !safeUrl(raw.packageUrl, "github.com", "/MDfox-ChaosZone/siyuan-font-studio/releases/download/")
            || !raw.packageUrl.startsWith(PACKAGE_PREFIX)
            || typeof raw.packageSize !== "number" || !Number.isSafeInteger(raw.packageSize) || raw.packageSize < 1 || raw.packageSize > 100 * 1024 * 1024
            || typeof raw.packageSha256 !== "string" || !/^[a-f0-9]{64}$/.test(raw.packageSha256)
            || typeof raw.includesFonts !== "boolean" || !Array.isArray(raw.rows) || raw.rows.length < 7 || raw.rows.length > 9) {
            throw new Error("invalid-catalog");
        }
        const rows = raw.rows.map(parseRow);
        const rowTargets = new Set<string>(rows.map((row) => row.target));
        if (rowTargets.size !== rows.length || !["ui", "content", "graph", "emoji", "mermaid"].every((target) => rowTargets.has(target))
            || !(rowTargets.has("mono") !== (rowTargets.has("inlineCode") && rowTargets.has("codeBlock")))
            || !(rowTargets.has("math") !== (rowTargets.has("inlineFormula") && rowTargets.has("formulaBlock")))) throw new Error("invalid-catalog");
        if (raw.previewUrl !== undefined && !safeUrl(raw.previewUrl, "github.com", "/user-attachments/assets/")) throw new Error("invalid-catalog");
        ids.add(raw.id);
        return {
            id: raw.id,
            name: raw.name,
            description: raw.description,
            previewUrl: raw.previewUrl as string | undefined,
            packageUrl: raw.packageUrl,
            packageSize: raw.packageSize,
            packageSha256: raw.packageSha256,
            includesFonts: raw.includesFonts,
            issueUrl: raw.issueUrl,
            author: raw.author,
            authorUrl: raw.authorUrl,
            assetName: new URL(raw.packageUrl).pathname.split("/").at(-1) || "preset.zip",
            releaseUrl: raw.packageUrl,
            releaseApiUrl: "",
            rows,
        };
    });
    return {version: 1, updatedAt: value.updatedAt, presets};
}

export async function fetchCommunityCatalog(fetcher: typeof fetch = fetch): Promise<CommunityCatalog> {
    const response = await fetcher(`${COMMUNITY_CATALOG_URL}?t=${Date.now()}`, {cache: "no-store"});
    if (!response.ok) throw new Error(`catalog-http-${response.status}`);
    const headerSize = Number(response.headers.get("content-length"));
    if (headerSize > MAX_CATALOG_BYTES) throw new Error("catalog-too-large");
    const reader = response.body?.getReader();
    if (!reader) {
        const text = await response.text();
        if (new TextEncoder().encode(text).byteLength > MAX_CATALOG_BYTES) throw new Error("catalog-too-large");
        return parseCommunityCatalog(JSON.parse(text));
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_CATALOG_BYTES) {
            await reader.cancel();
            throw new Error("catalog-too-large");
        }
        chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return parseCommunityCatalog(JSON.parse(new TextDecoder().decode(bytes)));
}
