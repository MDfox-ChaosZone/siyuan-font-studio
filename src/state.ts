import {DEFAULT_STATE, FontChoice, FontPreset, FontTarget, ImportedFont, PluginState, TARGETS, TargetSettings} from "./types";

const cloneDefault = (): PluginState => JSON.parse(JSON.stringify(DEFAULT_STATE)) as PluginState;
export const cloneTargets = (targets: Record<FontTarget, TargetSettings>): Record<FontTarget, TargetSettings> =>
    JSON.parse(JSON.stringify(targets)) as Record<FontTarget, TargetSettings>;

export function parseState(value: unknown): PluginState {
    const fallback = cloneDefault();
    if (!value || typeof value !== "object" || (value as {version?: unknown}).version !== DEFAULT_STATE.version) {
        fallback.presets = [{id: "default", name: "", targets: cloneTargets(fallback.targets)}];
        fallback.activePresetId = "default";
        return fallback;
    }
    const source = value as Partial<PluginState>;
    const fonts = Array.isArray(source.fonts)
        ? source.fonts.filter(isImportedFont).map((font) => ({...font}))
        : [];
    fallback.layout.libraryPreviewWidth = clampLibraryPreviewWidth(source.layout?.libraryPreviewWidth);

    for (const target of TARGETS) {
        fallback.targets[target] = parseTargetSettings(source.targets?.[target], target);
    }
    fallback.fonts = fonts;
    const sourcePresets = (source as {presets?: unknown}).presets;
    if (Array.isArray(sourcePresets)) {
        fallback.presets = sourcePresets.flatMap((value): FontPreset[] => {
            if (!value || typeof value !== "object") return [];
            const preset = value as {id?: unknown; name?: unknown; targets?: Partial<Record<FontTarget, unknown>>};
            if (typeof preset.id !== "string" || !preset.id || typeof preset.name !== "string" || !preset.targets || typeof preset.targets !== "object") return [];
            const targets = cloneTargets(DEFAULT_STATE.targets);
            for (const target of TARGETS) targets[target] = parseTargetSettings(preset.targets[target], target);
            return [{id: preset.id, name: preset.name.slice(0, 100), targets}];
        });
    }
    if (!fallback.presets.length) {
        fallback.presets = [{id: "default", name: "", targets: cloneTargets(fallback.targets)}];
    }
    const requestedActiveId = (source as {activePresetId?: unknown}).activePresetId;
    fallback.activePresetId = typeof requestedActiveId === "string" && fallback.presets.some((preset) => preset.id === requestedActiveId)
        ? requestedActiveId
        : fallback.presets[0].id;
    return sanitizeAssignments(fallback);
}

function parseTargetSettings(value: unknown, target: FontTarget): TargetSettings {
    const candidate = value && typeof value === "object" ? value as {fonts?: unknown; size?: unknown; decoupled?: unknown; secondary?: unknown} : {};
    const fonts = Array.isArray(candidate.fonts)
        ? candidate.fonts.filter(isFontChoice).map((choice) => ({...choice}))
        : [];
    const secondary = candidate.secondary && typeof candidate.secondary === "object"
        ? candidate.secondary as {fonts?: unknown; size?: unknown}
        : {};
    const secondaryFonts = Array.isArray(secondary.fonts)
        ? secondary.fonts.filter(isFontChoice).map((choice) => ({...choice}))
        : [];
    return {
        fonts,
        size: typeof candidate.size === "number" && Number.isFinite(candidate.size) ? candidate.size : null,
        ...(target === "mono" || target === "math" ? {
            decoupled: candidate.decoupled === true,
            secondary: {
                fonts: secondaryFonts,
                size: typeof secondary.size === "number" && Number.isFinite(secondary.size) ? secondary.size : null,
            },
        } : {}),
    };
}

export function clampLibraryPreviewWidth(value: unknown): number {
    return typeof value === "number" && Number.isFinite(value)
        ? Math.min(420, Math.max(140, Math.round(value)))
        : DEFAULT_STATE.layout.libraryPreviewWidth;
}

function isImportedFont(value: unknown): value is ImportedFont {
    if (!value || typeof value !== "object") return false;
    const font = value as ImportedFont;
    return [font.id, font.displayName, font.originalName, font.storageName, font.extension, font.sha256, font.importedAt]
        .every((item) => typeof item === "string") && typeof font.size === "number";
}

function isFontChoice(value: unknown): value is FontChoice {
    if (!value || typeof value !== "object") return false;
    const choice = value as FontChoice;
    if (choice.kind === "default") return true;
    if (choice.kind === "imported") return typeof choice.id === "string";
    return choice.kind === "system"
        && typeof choice.family === "string"
        && typeof choice.displayName === "string"
        && typeof choice.weight === "number";
}

export function sanitizeAssignments(state: PluginState): PluginState {
    const ids = new Set(state.fonts.map((font) => font.id));
    sanitizeTargets(state.targets, ids);
    for (const preset of state.presets) sanitizeTargets(preset.targets, ids);
    return state;
}

function sanitizeTargets(targets: Record<FontTarget, TargetSettings>, ids: Set<string>): void {
    for (const target of TARGETS) {
        targets[target].fonts = uniqueChoices(targets[target].fonts.filter((choice) => choice.kind !== "imported" || ids.has(choice.id)));
        targets[target].size = clampSize(target, targets[target].size);
        // Raw emoji share text nodes with document content, while SiYuan 3.8+
        // does not expose an independent graph font-size API.
        if (target === "emoji" || target === "graph") targets[target].size = null;
        if (targets[target].secondary) {
            targets[target].secondary!.fonts = uniqueChoices(targets[target].secondary!.fonts.filter((choice) => choice.kind !== "imported" || ids.has(choice.id)));
            targets[target].secondary!.size = clampSize(target, targets[target].secondary!.size);
        }
    }
}

export function clampSize(target: FontTarget, size: number | null): number | null {
    if (size === null || !Number.isFinite(size)) return null;
    const min = target === "ui" || target === "mermaid" ? 10 : target === "emoji" || target === "math" ? 8 : 9;
    const max = target === "ui" ? 24 : target === "mermaid" ? 32 : 72;
    return Math.min(max, Math.max(min, Math.round(size)));
}

export function removeFontFromState(state: PluginState, id: string): PluginState {
    const next = parseState(state);
    next.fonts = next.fonts.filter((font) => font.id !== id);
    const allTargets = [next.targets, ...next.presets.map((preset) => preset.targets)];
    for (const targets of allTargets) {
        for (const target of TARGETS) {
            targets[target].fonts = targets[target].fonts.filter((choice) => choice.kind !== "imported" || choice.id !== id);
            if (targets[target].secondary) targets[target].secondary!.fonts = targets[target].secondary!.fonts.filter((choice) => choice.kind !== "imported" || choice.id !== id);
        }
    }
    return next;
}

export function syncActivePreset(state: PluginState): void {
    const preset = state.presets.find((item) => item.id === state.activePresetId);
    if (preset) preset.targets = cloneTargets(state.targets);
}

export function activatePreset(state: PluginState, id: string): boolean {
    const preset = state.presets.find((item) => item.id === id);
    if (!preset) return false;
    state.activePresetId = preset.id;
    state.targets = cloneTargets(preset.targets);
    return true;
}

function uniqueChoices(choices: FontChoice[]): FontChoice[] {
    const seen = new Set<string>();
    return choices.filter((choice) => {
        const key = choice.kind === "imported" ? `i:${choice.id}` : choice.kind === "system" ? `s:${choice.family}:${choice.weight}` : "d";
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}
