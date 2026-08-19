import {FontChoice, FontCoverage, ImportedFont} from "./types";
import {create as createFont} from "fontkit";

export const SUPPORTED_EXTENSIONS = new Set(["woff2", "woff", "ttf", "otf"]);
export const MAX_FONT_BYTES = 100 * 1024 * 1024;
export const EMOJI_UNICODE_RANGE = [
    "U+231A-231B", "U+23E9-23EC", "U+23F0", "U+23F3", "U+25FD-25FE",
    "U+2600-2604", "U+2614-2615", "U+2618", "U+261D", "U+2620", "U+2622-2623", "U+2626", "U+262A",
    "U+262E-262F", "U+2638-263A", "U+2640", "U+2642", "U+2648-2653", "U+265F-2660", "U+2663",
    "U+2665-2666", "U+2668", "U+267B", "U+267E-267F", "U+2692-2697", "U+2699", "U+269B-269C",
    "U+26A0-26A1", "U+26A7", "U+26AA-26AB", "U+26B0-26B1", "U+26BD-26BE", "U+26C4-26C5", "U+26C8",
    "U+26CE-26CF", "U+26D1", "U+26D3-26D4", "U+26E9-26EA", "U+26F0-26F5", "U+26F7-26FA", "U+26FD",
    "U+2702", "U+2705", "U+2708-270D", "U+270F", "U+2712", "U+2714", "U+2716", "U+271D", "U+2721",
    "U+2728", "U+2733-2734", "U+2744", "U+2747", "U+274C", "U+274E", "U+2753-2755", "U+2757",
    "U+2763-2764", "U+2795-2797", "U+27A1", "U+27B0", "U+27BF", "U+2B05-2B07", "U+2B1B-2B1C",
    "U+200D", "U+2B50", "U+2B55", "U+3030", "U+303D", "U+3297", "U+3299", "U+FE0F", "U+E0020-E007E",
    "U+1F1E6-1F1FF", "U+1F200-1F2FF", "U+1F300-1F6FF", "U+1F900-1FAFF",
].join(", ");

// The Emoji tag represents fonts that can replace the common face-style
// emoji surfaced by SiYuan's `:keyword` picker. Unicode's broad Emoji
// property also includes digits, enclosed ideographs, arrows, and symbols.
const COMMON_EMOJI_FACES = new Set([
    0x1f600, 0x1f601, 0x1f602, 0x1f603, 0x1f604, 0x1f605, 0x1f606, 0x1f607,
    0x1f609, 0x1f60a, 0x1f60b, 0x1f60d, 0x1f618, 0x1f61c, 0x1f622, 0x1f62d,
    0x1f631, 0x1f633, 0x1f642, 0x1f643, 0x1f923, 0x1f970, 0x1f972, 0x1f979,
]);

export interface FontMetadata {
    fontName: string;
    fontVersion: string;
    coverage: FontCoverage;
}

export function extractFontMetadata(buffer: ArrayBuffer, fallbackName: string): FontMetadata {
    try {
        const parsed = createFont(new Uint8Array(buffer)) as {
            familyName?: string | null;
            fullName?: string | null;
            postscriptName?: string | null;
            version?: string | null;
            characterSet?: number[];
            name?: {
                records?: {
                    fontFamily?: Record<string, string | null | undefined>;
                    preferredFamily?: Record<string, string | null | undefined>;
                };
            };
            directory?: {
                tables?: Record<string, unknown>;
            };
        };
        return {
            fontName: localizedFamilyName(parsed) || cleanMetadata(parsed.familyName || parsed.fullName || parsed.postscriptName) || fallbackName,
            fontVersion: cleanMetadata(parsed.version) || "—",
            coverage: detectFontCoverage(parsed.characterSet || [], hasColorEmojiTables(parsed.directory?.tables)),
        };
    } catch {
        return {fontName: fallbackName, fontVersion: "—", coverage: {chinese: false, english: false, emoji: false, math: false}};
    }
}

export function detectFontCoverage(characterSet: readonly number[], hasColorEmoji = false): FontCoverage {
    let chinese = false;
    let english = false;
    let commonEmojiFaces = 0;
    let math = false;
    for (const codePoint of characterSet) {
        if (!english && ((codePoint >= 0x41 && codePoint <= 0x5a) || (codePoint >= 0x61 && codePoint <= 0x7a))) {
            english = true;
        }
        if (!chinese && isHanCodePoint(codePoint)) chinese = true;
        if (COMMON_EMOJI_FACES.has(codePoint)) commonEmojiFaces++;
        if (!math && isMathCodePoint(codePoint)) math = true;
    }
    const emoji = commonEmojiFaces >= (hasColorEmoji ? 8 : 12);
    return {chinese, english, emoji, math};
}

function hasColorEmojiTables(tables: Record<string, unknown> | undefined): boolean {
    return Boolean(tables && (tables.sbix || (tables.COLR && tables.CPAL) || (tables.CBDT && tables.CBLC) || tables["SVG "]));
}

export function localizedFamilyName(parsed: {name?: {records?: {fontFamily?: Record<string, string | null | undefined>; preferredFamily?: Record<string, string | null | undefined>}}}): string {
    const records = parsed.name?.records;
    const names = records?.preferredFamily || records?.fontFamily;
    if (!names) return "";
    for (const language of ["zh-Hans", "zh_CN", "zh-CN", "zh", "en"]) {
        const name = cleanMetadata(names[language]);
        if (name) return name;
    }
    return cleanMetadata(Object.values(names).find(Boolean));
}

function isHanCodePoint(codePoint: number): boolean {
    return codePoint === 0x3007
        || (codePoint >= 0x3400 && codePoint <= 0x4dbf)
        || (codePoint >= 0x4e00 && codePoint <= 0x9fff)
        || (codePoint >= 0xf900 && codePoint <= 0xfaff)
        || (codePoint >= 0x20000 && codePoint <= 0x2ee5f)
        || (codePoint >= 0x2f800 && codePoint <= 0x2fa1f)
        || (codePoint >= 0x30000 && codePoint <= 0x323af);
}

function isMathCodePoint(codePoint: number): boolean {
    return (codePoint >= 0x2200 && codePoint <= 0x22ff)
        || (codePoint >= 0x27c0 && codePoint <= 0x27ef)
        || (codePoint >= 0x2980 && codePoint <= 0x29ff)
        || (codePoint >= 0x2a00 && codePoint <= 0x2aff)
        || (codePoint >= 0x1d400 && codePoint <= 0x1d7ff);
}

function cleanMetadata(value: string | null | undefined): string {
    return (value || "").replace(/\0/g, "").trim();
}

export function extensionOf(filename: string): string {
    const index = filename.lastIndexOf(".");
    return index < 0 ? "" : filename.slice(index + 1).toLowerCase();
}

export function nameWithoutExtension(filename: string): string {
    const index = filename.lastIndexOf(".");
    return (index < 1 ? filename : filename.slice(0, index)).trim() || "Unnamed font";
}

export async function sha256(buffer: ArrayBuffer): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function runtimeFamily(id: string): string {
    return `BFM_${id.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

export function emojiRuntimeFamily(id: string): string {
    return `BFM_EMOJI_${id.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

export function quoteFamily(family: string): string {
    return `"${family.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function familyForChoice(choice: FontChoice, fonts: ImportedFont[], loadedIds: Set<string>, importedFamily = runtimeFamily, defaultFamily: string | null = null): string | null {
    if (choice.kind === "default") return defaultFamily;
    if (choice.kind === "system") return quoteFamily(choice.family);
    if (!fonts.some((font) => font.id === choice.id) || !loadedIds.has(choice.id)) return null;
    return quoteFamily(importedFamily(choice.id));
}

export function familyForChoices(choices: FontChoice[], fonts: ImportedFont[], loadedIds: Set<string>, importedFamily = runtimeFamily, defaultFamily: string | null = null): string | null {
    const families = choices.map((choice) => familyForChoice(choice, fonts, loadedIds, importedFamily, defaultFamily)).filter((family): family is string => Boolean(family));
    return families.length ? families.join(", ") : null;
}

export function createId(): string {
    return typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function hasDuplicateHash(fonts: Pick<ImportedFont, "sha256">[], hash: string): boolean {
    return fonts.some((font) => font.sha256 === hash);
}
