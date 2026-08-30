export type FontTarget = "ui" | "content" | "mono" | "graph" | "emoji" | "math" | "mermaid";

export interface ImportedFont {
    id: string;
    displayName: string;
    originalName: string;
    storageName: string;
    extension: string;
    size: number;
    sha256: string;
    importedAt: string;
    fontName?: string;
    fontStyle?: string;
    fontWeight?: number;
    variationAxes?: Record<string, FontVariationAxis>;
    fontVersion?: string;
    coverage?: FontCoverage;
}

export interface FontVariationAxis {
    name: string;
    min: number;
    default: number;
    max: number;
}

export interface FontCoverage {
    chinese: boolean;
    english: boolean;
    emoji: boolean;
    math: boolean;
}

export interface SystemFont {
    family: string;
    displayName: string;
    weight: number;
    aliases?: string[];
    spacing?: "proportional" | "dual" | "monospace" | "character-cell";
}

export type FontChoice =
    | {kind: "default"}
    | {kind: "imported"; id: string; weight?: number}
    | {kind: "system"; family: string; displayName: string; weight: number};

export interface TargetSettings {
    fonts: FontChoice[];
    size: number | null;
    decoupled?: boolean;
    secondary?: {
        fonts: FontChoice[];
        size: number | null;
    };
}

export interface FontPreset {
    id: string;
    name: string;
    targets: Record<FontTarget, TargetSettings>;
}

export interface PluginState {
    version: 3;
    fonts: ImportedFont[];
    targets: Record<FontTarget, TargetSettings>;
    presets: FontPreset[];
    activePresetId: string;
    layout: {
        libraryPreviewWidth: number;
    };
}

export interface FontRuntimeStatus {
    loaded: boolean;
    error?: string;
}

export const SIMPLE_TARGETS: FontTarget[] = ["ui", "content", "mono", "math"];
export const ADVANCED_TARGETS: FontTarget[] = ["graph", "mermaid", "emoji"];
export const TARGETS: FontTarget[] = [...SIMPLE_TARGETS, ...ADVANCED_TARGETS];

export const DEFAULT_STATE: PluginState = {
    version: 3,
    fonts: [],
    presets: [],
    activePresetId: "",
    layout: {
        libraryPreviewWidth: 250,
    },
    targets: {
        ui: {fonts: [], size: null},
        content: {fonts: [], size: null},
        mono: {fonts: [], size: null, decoupled: false, secondary: {fonts: [], size: null}},
        graph: {fonts: [], size: null},
        emoji: {fonts: [], size: null},
        math: {fonts: [], size: null, decoupled: false, secondary: {fonts: [], size: null}},
        mermaid: {fonts: [], size: null},
    },
};
