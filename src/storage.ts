import {ImportedFont} from "./types";

export const PLUGIN_STORAGE_ROOT = "/data/storage/petal/siyuan-font-studio";
export const FONT_STORAGE_ROOT = `${PLUGIN_STORAGE_ROOT}/fonts`;

type StoredFont = Pick<ImportedFont, "storageName">;

function fontPath(font: StoredFont): string {
    return `${FONT_STORAGE_ROOT}/${font.storageName}`;
}

export function storedFontFileName(font: Pick<ImportedFont, "id" | "originalName" | "extension">): string {
    const extensionLength = font.originalName.toLocaleLowerCase().endsWith(`.${font.extension.toLocaleLowerCase()}`)
        ? font.extension.length + 1
        : 0;
    const rawBase = (extensionLength ? font.originalName.slice(0, -extensionLength) : font.originalName).normalize("NFC");
    let safeBase = rawBase
        .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
        .replace(/[. ]+$/g, "")
        .trim()
        .slice(0, 100);
    if (!safeBase) safeBase = "font";
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(safeBase)) safeBase = `_${safeBase}`;
    const shortId = font.id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8) || "font";
    return `${safeBase}__${shortId}.${font.extension}`;
}

async function parseKernelResponse(response: Response): Promise<void> {
    const payload = await response.json() as {code: number; msg?: string};
    if (!response.ok || payload.code !== 0) throw new Error(payload.msg || `Kernel API error ${payload.code}`);
}

export async function writeFontFile(font: StoredFont, file: File, appId: string): Promise<void> {
    const body = new FormData();
    body.append("path", fontPath(font));
    body.append("file", file, font.storageName);
    body.append("isDir", "false");
    body.append("app", appId);
    await parseKernelResponse(await fetch("/api/file/putFile", {method: "POST", body}));
}

export async function ensureFontDirectory(appId: string): Promise<void> {
    const body = new FormData();
    body.append("path", FONT_STORAGE_ROOT);
    body.append("isDir", "true");
    body.append("app", appId);
    await parseKernelResponse(await fetch("/api/file/putFile", {method: "POST", body}));
}

export async function readFontFile(font: StoredFont): Promise<ArrayBuffer> {
    const response = await fetch("/api/file/getFile", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({path: fontPath(font)}),
    });
    if (!response.ok || response.status === 202) throw new Error(`Unable to read font (${response.status})`);
    const type = response.headers.get("content-type") || "";
    if (type.includes("application/json")) {
        const error = await response.json() as {msg?: string};
        throw new Error(error.msg || "Unable to read font");
    }
    return response.arrayBuffer();
}

export async function deleteFontFile(font: StoredFont, appId: string): Promise<void> {
    await parseKernelResponse(await fetch("/api/file/removeFile", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({path: fontPath(font), app: appId}),
    }));
}

export async function deletePluginStorage(appId: string): Promise<void> {
    await parseKernelResponse(await fetch("/api/file/removeFile", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({path: PLUGIN_STORAGE_ROOT, app: appId}),
    }));
}
