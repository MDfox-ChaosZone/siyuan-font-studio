import {strFromU8, strToU8, unzipSync, zip} from "fflate";
import {parseState} from "./state";
import {FontChoice, FontPreset, FontTarget, ImportedFont, TARGETS, TargetSettings} from "./types";

export const PRESET_FILE_FORMAT = "siyuan-font-studio-preset";
export const PRESET_FILE_VERSION = 1;
export const MAX_PRESET_PACKAGE_BYTES = 500 * 1024 * 1024;

type PortableFontChoice =
    | {kind: "default"}
    | {kind: "system"; family: string; displayName: string; weight: number}
    | {kind: "imported"; sha256: string; displayName: string};

interface PortableTargetSettings {
    fonts: PortableFontChoice[];
    size: number | null;
    decoupled?: boolean;
    secondary?: {
        fonts: PortableFontChoice[];
        size: number | null;
    };
}

export interface BundledFontDescriptor {
    path: string;
    sha256: string;
    displayName: string;
    originalName: string;
    extension: string;
    size: number;
}

interface PresetFile {
    format: typeof PRESET_FILE_FORMAT;
    version: typeof PRESET_FILE_VERSION;
    name: string;
    exportedAt: string;
    targets: Record<FontTarget, PortableTargetSettings>;
    bundledFonts?: BundledFontDescriptor[];
}

export interface ImportedPresetData {
    name: string;
    targets: FontPreset["targets"];
    missingFonts: string[];
}

export interface ReadPresetContainer {
    config: unknown;
    bundledFonts: Array<{descriptor: BundledFontDescriptor; data: Uint8Array<ArrayBuffer>}>;
}

export function importedFontIdsInTargets(targets: FontPreset["targets"]): Set<string> {
    const ids = new Set<string>();
    for (const target of TARGETS) {
        for (const choice of targets[target].fonts) if (choice.kind === "imported") ids.add(choice.id);
        for (const choice of targets[target].secondary?.fonts || []) if (choice.kind === "imported") ids.add(choice.id);
    }
    return ids;
}

export function serializePreset(preset: FontPreset, fonts: ImportedFont[], displayName = preset.name): string {
    return JSON.stringify(createPresetFile(preset, fonts, displayName), null, 2);
}

export async function createPresetPackage(
    preset: FontPreset,
    fonts: ImportedFont[],
    includedFonts: Array<{font: ImportedFont; data: ArrayBuffer}>,
    displayName = preset.name,
): Promise<Uint8Array<ArrayBuffer>> {
    const bundledFonts: BundledFontDescriptor[] = includedFonts.map(({font}) => ({
        path: `fonts/${font.sha256}.${font.extension.toLocaleLowerCase()}`,
        sha256: font.sha256,
        displayName: font.displayName,
        originalName: font.originalName,
        extension: font.extension,
        size: font.size,
    }));
    const manifest = createPresetFile(preset, fonts, displayName, bundledFonts);
    const entries: Record<string, Uint8Array<ArrayBuffer>> = {
        "preset.json": strToU8(JSON.stringify(manifest, null, 2)),
    };
    for (let index = 0; index < includedFonts.length; index++) {
        entries[bundledFonts[index].path] = new Uint8Array(includedFonts[index].data);
    }
    return new Promise((resolve, reject) => {
        zip(entries, {level: 6}, (error, data) => error ? reject(error) : resolve(data));
    });
}

function createPresetFile(
    preset: FontPreset,
    fonts: ImportedFont[],
    displayName: string,
    bundledFonts?: BundledFontDescriptor[],
): PresetFile {
    const targets = {} as Record<FontTarget, PortableTargetSettings>;
    for (const target of TARGETS) targets[target] = serializeTarget(preset.targets[target], fonts);
    return {
        format: PRESET_FILE_FORMAT,
        version: PRESET_FILE_VERSION,
        name: displayName,
        exportedAt: new Date().toISOString(),
        targets,
        ...(bundledFonts ? {bundledFonts} : {}),
    };
}

function serializeTarget(settings: TargetSettings, fonts: ImportedFont[]): PortableTargetSettings {
    return {
        fonts: settings.fonts.flatMap((choice) => {
            const portable = serializeChoice(choice, fonts);
            return portable ? [portable] : [];
        }),
        size: settings.size,
        ...(settings.decoupled !== undefined ? {decoupled: settings.decoupled} : {}),
        ...(settings.secondary ? {
            secondary: {
                fonts: settings.secondary.fonts.flatMap((choice) => {
                    const portable = serializeChoice(choice, fonts);
                    return portable ? [portable] : [];
                }),
                size: settings.secondary.size,
            },
        } : {}),
    };
}

function serializeChoice(choice: FontChoice, fonts: ImportedFont[]): PortableFontChoice | undefined {
    if (choice.kind !== "imported") return {...choice};
    const font = fonts.find((item) => item.id === choice.id);
    return font ? {kind: "imported", sha256: font.sha256, displayName: font.displayName} : undefined;
}

export function readPresetContainer(data: Uint8Array<ArrayBuffer>, filename: string): ReadPresetContainer {
    if (filename.toLocaleLowerCase().endsWith(".json")) {
        return {config: parseJson(strFromU8(data)), bundledFonts: []};
    }
    let totalSize = 0;
    const files = unzipSync(data, {
        filter: (file) => {
            const allowed = file.name === "preset.json" || /^fonts\/[a-zA-Z0-9._-]+$/.test(file.name);
            if (!allowed) return false;
            totalSize += file.originalSize;
            if (totalSize > MAX_PRESET_PACKAGE_BYTES) throw new Error("package-too-large");
            return true;
        },
    });
    const manifestBytes = files["preset.json"];
    if (!manifestBytes) throw new Error("invalid-preset");
    const config = parseJson(strFromU8(manifestBytes)) as Partial<PresetFile>;
    const bundledFonts: ReadPresetContainer["bundledFonts"] = [];
    if (Array.isArray(config.bundledFonts)) {
        for (const value of config.bundledFonts) {
            if (!isBundledFontDescriptor(value) || !files[value.path]) throw new Error("invalid-preset");
            bundledFonts.push({descriptor: value, data: files[value.path]});
        }
    }
    return {config, bundledFonts};
}

function parseJson(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        throw new Error("invalid-json");
    }
}

function isBundledFontDescriptor(value: unknown): value is BundledFontDescriptor {
    if (!value || typeof value !== "object") return false;
    const font = value as Partial<BundledFontDescriptor>;
    return [font.path, font.sha256, font.displayName, font.originalName, font.extension]
        .every((item) => typeof item === "string") && typeof font.size === "number"
        && /^fonts\/[a-zA-Z0-9._-]+$/.test(font.path!);
}

export function parsePresetConfig(value: unknown, fonts: ImportedFont[]): ImportedPresetData {
    if (!value || typeof value !== "object") throw new Error("invalid-preset");
    const source = value as Partial<PresetFile>;
    if (source.format !== PRESET_FILE_FORMAT || source.version !== PRESET_FILE_VERSION
        || typeof source.name !== "string" || !source.name.trim()
        || !source.targets || typeof source.targets !== "object") {
        throw new Error("invalid-preset");
    }
    const missingFonts: string[] = [];
    const targets = {} as Record<FontTarget, TargetSettings>;
    for (const target of TARGETS) {
        const settings = source.targets[target];
        if (!settings || typeof settings !== "object" || !Array.isArray(settings.fonts)) throw new Error("invalid-preset");
        targets[target] = deserializeTarget(settings, fonts, missingFonts);
    }
    return {
        name: source.name.trim().slice(0, 100),
        targets: parseState({version: 3, fonts, targets}).targets,
        missingFonts: Array.from(new Set(missingFonts)),
    };
}

function deserializeTarget(value: PortableTargetSettings, fonts: ImportedFont[], missingFonts: string[]): TargetSettings {
    const secondary = value.secondary && typeof value.secondary === "object" && Array.isArray(value.secondary.fonts)
        ? {
            fonts: value.secondary.fonts.flatMap((choice) => {
                const local = deserializeChoice(choice, fonts, missingFonts);
                return local ? [local] : [];
            }),
            size: value.secondary.size,
        }
        : undefined;
    return {
        fonts: value.fonts.flatMap((choice) => {
            const local = deserializeChoice(choice, fonts, missingFonts);
            return local ? [local] : [];
        }),
        size: value.size,
        ...(typeof value.decoupled === "boolean" ? {decoupled: value.decoupled} : {}),
        ...(secondary ? {secondary} : {}),
    };
}

function deserializeChoice(value: unknown, fonts: ImportedFont[], missingFonts: string[]): FontChoice | undefined {
    if (!value || typeof value !== "object") return undefined;
    const choice = value as Record<string, unknown>;
    if (choice.kind === "default") return {kind: "default"};
    if (choice.kind === "system" && typeof choice.family === "string" && typeof choice.displayName === "string" && typeof choice.weight === "number") {
        return {kind: "system", family: choice.family, displayName: choice.displayName, weight: choice.weight};
    }
    if (choice.kind === "imported" && typeof choice.sha256 === "string") {
        const font = fonts.find((item) => item.sha256 === choice.sha256);
        if (font) return {kind: "imported", id: font.id};
        missingFonts.push(typeof choice.displayName === "string" && choice.displayName ? choice.displayName : choice.sha256);
    }
    return undefined;
}
