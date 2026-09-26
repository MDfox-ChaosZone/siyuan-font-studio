import {sha256} from "./font-utils";

export const EXAMPLE_PRESET_ASSET_NAME = "siyuan-font-studio-preset.zip";
export const EXAMPLE_PRESET_RELEASE_URL = "https://github.com/MDfox-ChaosZone/siyuan-font-studio/releases/tag/%E7%A4%BA%E4%BE%8B%E5%AD%97%E4%BD%93%E6%96%B9%E6%A1%88";
export const COMMUNITY_PRESET_ASSET_NAME = "sungas444-community-font-preset.siyuan-font-studio-preset.zip";
export const COMMUNITY_PRESET_RELEASE_URL = "https://github.com/MDfox-ChaosZone/siyuan-font-studio/releases/tag/%E7%A4%BE%E5%8C%BA%E5%AD%97%E4%BD%93%E6%96%B9%E6%A1%88";
export const MAX_EXAMPLE_PRESET_BYTES = 100 * 1024 * 1024;

export type PresetCatalogId = string;
export type PresetCatalogTarget = "ui" | "content" | "mono" | "inlineCode" | "codeBlock" | "math" | "inlineFormula" | "formulaBlock" | "graph" | "emoji" | "mermaid";

export interface PresetCatalogRow {
    target: PresetCatalogTarget;
    fonts: string[];
    size: number | null;
    weights: Array<{value: number | null; variable?: boolean}>;
}

export interface PresetCatalogItem {
    id: PresetCatalogId;
    name?: string;
    description?: string;
    previewUrl?: string;
    packageUrl?: string;
    packageSize?: number;
    packageSha256?: string;
    includesFonts?: boolean;
    issueUrl?: string;
    author: string;
    authorUrl: string;
    assetName: string;
    releaseUrl: string;
    releaseApiUrl: string;
    rows: PresetCatalogRow[];
}

export const PRESET_CATALOG: PresetCatalogItem[] = [
    {
        id: "example",
        author: "MDfox",
        authorUrl: "https://github.com/MDfox-ChaosZone",
        assetName: EXAMPLE_PRESET_ASSET_NAME,
        releaseUrl: EXAMPLE_PRESET_RELEASE_URL,
        releaseApiUrl: "https://api.github.com/repos/MDfox-ChaosZone/siyuan-font-studio/releases/tags/%E7%A4%BA%E4%BE%8B%E5%AD%97%E4%BD%93%E6%96%B9%E6%A1%88",
        rows: [
            {target: "ui", fonts: ["LXGWWenKaiScreen"], size: null, weights: [{value: 400}]},
            {target: "content", fonts: ["AlibabaPuHuiTi-3-55-Regular"], size: null, weights: [{value: 400}]},
            {target: "mono", fonts: ["MapleMonoNormal-Regular"], size: null, weights: [{value: 400}]},
            {target: "math", fonts: ["SiYuan", "MiSansVF"], size: null, weights: [{value: null}, {value: 400, variable: true}]},
            {target: "graph", fonts: ["MiSansVF"], size: null, weights: [{value: 400, variable: true}]},
            {target: "emoji", fonts: ["twemoji-colr"], size: null, weights: [{value: 400}]},
            {target: "mermaid", fonts: ["MiSansVF"], size: null, weights: [{value: 400, variable: true}]},
        ],
    },
    {
        id: "community",
        author: "sungas444",
        authorUrl: "https://github.com/sungas444",
        issueUrl: "https://github.com/MDfox-ChaosZone/siyuan-font-studio/issues/8",
        assetName: COMMUNITY_PRESET_ASSET_NAME,
        releaseUrl: COMMUNITY_PRESET_RELEASE_URL,
        releaseApiUrl: "https://api.github.com/repos/MDfox-ChaosZone/siyuan-font-studio/releases/tags/%E7%A4%BE%E5%8C%BA%E5%AD%97%E4%BD%93%E6%96%B9%E6%A1%88",
        rows: [
            {target: "ui", fonts: ["HarmonyOS_SansSC_Regular"], size: 14, weights: [{value: 400}]},
            {target: "content", fonts: ["MapleFakeMono-NF-CN-Medium"], size: null, weights: [{value: 500}]},
            {target: "mono", fonts: ["MapleMono-NF-CN-Medium"], size: null, weights: [{value: 500}]},
            {target: "math", fonts: ["SiYuan", "SourceHanSerifCN-Medium"], size: null, weights: [{value: null}, {value: 500}]},
            {target: "graph", fonts: ["HarmonyOS_SansSC_Regular"], size: null, weights: [{value: 400}]},
            {target: "emoji", fonts: ["twemoji-colr0-17.0.3"], size: null, weights: [{value: 400}]},
            {target: "mermaid", fonts: ["SourceHanSerifCN-Medium"], size: null, weights: [{value: 500}]},
        ],
    },
];

export interface ExamplePresetAsset {
    downloadUrl: string;
    size: number | null;
    sha256: string | null;
}

export interface DownloadProgress {
    received: number;
    total: number | null;
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export async function resolveExamplePresetAsset(fetcher: Fetcher = fetch): Promise<ExamplePresetAsset> {
    return resolvePresetAsset(PRESET_CATALOG[0], fetcher);
}

export async function resolvePresetAsset(item: PresetCatalogItem, fetcher: Fetcher = fetch): Promise<ExamplePresetAsset> {
    if (item.packageUrl) return {
        downloadUrl: item.packageUrl,
        size: item.packageSize ?? null,
        sha256: item.packageSha256 ?? null,
    };
    try {
        const response = await fetcher(item.releaseApiUrl, {
            headers: {
                Accept: "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
        });
        if (!response.ok) return fallbackAsset(item);
        const release = await response.json() as {assets?: unknown};
        if (!Array.isArray(release.assets)) return fallbackAsset(item);
        const asset = release.assets.find((value) => isReleaseAsset(value) && value.name === item.assetName);
        if (!asset || !isReleaseAsset(asset)) return fallbackAsset(item);
        if (asset.size > MAX_EXAMPLE_PRESET_BYTES) throw new Error("example-package-too-large");
        return {
            downloadUrl: safeGitHubDownloadUrl(asset.browser_download_url) || directDownloadUrl(item),
            size: asset.size,
            sha256: parseDigest(asset.digest),
        };
    } catch (error) {
        if (error instanceof Error && error.message === "example-package-too-large") throw error;
        return fallbackAsset(item);
    }
}

export async function downloadExamplePreset(
    asset: ExamplePresetAsset,
    signal: AbortSignal,
    onProgress: (progress: DownloadProgress) => void,
    fetcher: Fetcher = fetch,
): Promise<Uint8Array<ArrayBuffer>> {
    if (asset.size !== null && asset.size > MAX_EXAMPLE_PRESET_BYTES) throw new Error("example-package-too-large");
    const response = await fetcher(asset.downloadUrl, {signal});
    if (!response.ok) throw new Error(`example-download-http-${response.status}`);
    const headerSize = positiveInteger(response.headers.get("content-length"));
    const expectedSize = asset.size || headerSize;
    if (headerSize !== null && headerSize > MAX_EXAMPLE_PRESET_BYTES) throw new Error("example-package-too-large");
    if (asset.size !== null && headerSize !== null && asset.size !== headerSize) throw new Error("example-download-size-mismatch");

    const chunks: Uint8Array[] = [];
    let received = 0;
    onProgress({received, total: expectedSize});
    if (response.body) {
        const reader = response.body.getReader();
        while (true) {
            const {done, value} = await reader.read();
            if (done) break;
            if (!value?.byteLength) continue;
            received += value.byteLength;
            if (received > MAX_EXAMPLE_PRESET_BYTES) {
                await reader.cancel();
                throw new Error("example-package-too-large");
            }
            chunks.push(value);
            onProgress({received, total: expectedSize});
        }
    } else {
        const value = new Uint8Array(await response.arrayBuffer());
        received = value.byteLength;
        if (received > MAX_EXAMPLE_PRESET_BYTES) throw new Error("example-package-too-large");
        chunks.push(value);
        onProgress({received, total: expectedSize});
    }
    if (asset.size !== null && received !== asset.size) throw new Error("example-download-size-mismatch");

    const data = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
        data.set(chunk, offset);
        offset += chunk.byteLength;
    }
    if (asset.sha256 && await sha256(data.buffer) !== asset.sha256) throw new Error("example-download-integrity");
    return data;
}

export async function fetchExamplePresetViaSiyuanProxy(
    input: RequestInfo | URL,
    init: RequestInit | undefined,
    fetcher: Fetcher = fetch,
): Promise<Response> {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const response = await fetcher("/api/network/forwardProxy", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        signal: init?.signal,
        body: JSON.stringify({
            url,
            method: "GET",
            timeout: 300000,
            contentType: "application/octet-stream",
            headers: [],
            payload: {},
            payloadEncoding: "text",
            responseEncoding: "base64",
        }),
    });
    if (!response.ok) throw new Error(`example-proxy-http-${response.status}`);
    const envelope = await response.json() as {
        code?: unknown;
        msg?: unknown;
        data?: {body?: unknown; bodyEncoding?: unknown; contentType?: unknown; status?: unknown};
    };
    if (envelope.code !== 0 || !envelope.data || typeof envelope.data.body !== "string"
        || envelope.data.bodyEncoding !== "base64" || typeof envelope.data.status !== "number") {
        throw new Error(typeof envelope.msg === "string" && envelope.msg ? envelope.msg : "example-proxy-invalid-response");
    }
    const estimatedSize = Math.floor(envelope.data.body.length * 3 / 4);
    if (estimatedSize > MAX_EXAMPLE_PRESET_BYTES + 2) throw new Error("example-package-too-large");
    const bytes = decodeBase64(envelope.data.body);
    if (bytes.byteLength > MAX_EXAMPLE_PRESET_BYTES) throw new Error("example-package-too-large");
    return new Response(bytes, {
        status: envelope.data.status,
        headers: {
            "content-length": String(bytes.byteLength),
            "content-type": typeof envelope.data.contentType === "string" ? envelope.data.contentType : "application/octet-stream",
        },
    });
}

function fallbackAsset(item: PresetCatalogItem): ExamplePresetAsset {
    return {downloadUrl: directDownloadUrl(item), size: null, sha256: null};
}

function directDownloadUrl(item: PresetCatalogItem): string {
    return `${item.releaseUrl.replace("/tag/", "/download/")}/${item.assetName}`;
}

function isReleaseAsset(value: unknown): value is {name: string; size: number; browser_download_url: string; digest?: unknown} {
    if (!value || typeof value !== "object") return false;
    const asset = value as Record<string, unknown>;
    return typeof asset.name === "string"
        && typeof asset.browser_download_url === "string"
        && typeof asset.size === "number"
        && Number.isSafeInteger(asset.size)
        && asset.size > 0;
}

function safeGitHubDownloadUrl(value: string): string | null {
    try {
        const url = new URL(value);
        return url.protocol === "https:" && url.hostname === "github.com"
            && url.pathname.startsWith("/MDfox-ChaosZone/siyuan-font-studio/releases/download/")
            ? url.href
            : null;
    } catch {
        return null;
    }
}

function parseDigest(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const match = /^sha256:([a-f0-9]{64})$/i.exec(value.trim());
    return match ? match[1].toLocaleLowerCase() : null;
}

function positiveInteger(value: string | null): number | null {
    if (!value) return null;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
    try {
        const binary = atob(value);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
        return bytes;
    } catch {
        throw new Error("example-proxy-invalid-response");
    }
}
