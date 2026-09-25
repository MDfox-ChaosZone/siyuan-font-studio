import {strToU8, zipSync} from "fflate";

export const SHARE_PART_BYTES = 24_000_000;
export const SHARE_UPLOAD_LIMIT_BYTES = 25_000_000;
export const SHARE_PACKAGE_LIMIT_BYTES = 100 * 1024 * 1024;

export interface PresetPart {
    name: string;
    bytes: Uint8Array<ArrayBuffer>;
}

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function splitPresetPackage(archive: Uint8Array<ArrayBuffer>, baseName: string): Promise<PresetPart[]> {
    if (!archive.length || archive.length > SHARE_PACKAGE_LIMIT_BYTES) throw new Error("share-package-too-large");
    const total = Math.ceil(archive.length / SHARE_PART_BYTES);
    if (total < 2) throw new Error("share-package-too-small");
    const archiveSha256 = await sha256Hex(archive);
    const parts: PresetPart[] = [];
    for (let index = 0; index < total; index++) {
        const chunk = archive.slice(index * SHARE_PART_BYTES, (index + 1) * SHARE_PART_BYTES);
        const manifest = {
            format: "siyuan-font-studio-preset-part", version: 1, index: index + 1, total,
            archiveSize: archive.length, archiveSha256, chunkSha256: await sha256Hex(chunk),
        };
        const bytes = zipSync({"part.json": strToU8(JSON.stringify(manifest)), "data.bin": chunk}, {level: 0});
        if (bytes.length >= SHARE_UPLOAD_LIMIT_BYTES) throw new Error("share-part-too-large");
        parts.push({name: `${baseName}.part${String(index + 1).padStart(2, "0")}-of-${String(total).padStart(2, "0")}.zip`, bytes});
    }
    return parts;
}
