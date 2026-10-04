import {SystemFont} from "./types";

export const MIN_APP_VERSION = "3.8.0";

// Version checks only disable features. They never load a legacy renderer.
export function siyuanVersionAtLeast(minimum: string, version = typeof window === "undefined"
    ? "" : window.siyuan?.config?.system?.kernelVersion || ""): boolean {
    const current = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(version);
    const required = minimum.split(".").map(Number);
    if (!current) return false;
    for (let index = 0; index < 3; index++) {
        const value = Number(current[index + 1]);
        if (value !== required[index]) return value > required[index];
    }
    return !current[4];
}

export function supportsGraphFonts(): boolean {
    return siyuanVersionAtLeast("3.8.0");
}

export function supportsMindmapFonts(): boolean {
    return siyuanVersionAtLeast("3.8.5");
}

// Older kernels return string[]; only consume the current structured API.
export function currentSystemFonts(value: unknown): SystemFont[] {
    if (!Array.isArray(value)) return [];
    return value.filter((font): font is SystemFont => !!font && typeof font === "object"
        && typeof font.family === "string" && !!font.family.trim()
        && typeof font.displayName === "string" && !!font.displayName.trim()
        && typeof font.weight === "number" && Number.isFinite(font.weight)
        && font.weight >= 1 && font.weight <= 1000);
}
