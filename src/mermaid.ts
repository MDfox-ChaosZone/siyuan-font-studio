import {familyForChoices, runtimeFamily, weightForChoices} from "./font-utils";
import {PluginState} from "./types";

export interface MermaidOverrides {
    fontFamily?: string;
    fontSize?: number;
    fontWeight?: number;
}

export function mermaidOverrides(state: PluginState, loadedIds: Set<string>): MermaidOverrides {
    const settings = state.targets.mermaid;
    const onlyDefault = settings.fonts.length === 1 && settings.fonts[0].kind === "default";
    const selectedFamily = settings.fonts.length && !onlyDefault
        ? familyForChoices(settings.fonts, state.fonts, loadedIds, runtimeFamily, "sans-serif")
        : null;
    const fontFamily = selectedFamily && /(^|,\s*)sans-serif(?:\s*,|$)/i.test(selectedFamily)
        ? selectedFamily
        : selectedFamily ? `${selectedFamily}, sans-serif` : undefined;
    const fontWeight = weightForChoices(settings.fonts, state.fonts);
    return {
        ...(fontFamily ? {fontFamily} : {}),
        ...(settings.size !== null ? {fontSize: settings.size} : {}),
        ...(fontWeight !== null ? {fontWeight} : {}),
    };
}

export function mergeMermaidConfig(base: Record<string, unknown> | undefined, overrides: MermaidOverrides): Record<string, unknown> {
    const merged = {...(base || {})};
    if (overrides.fontFamily) {
        merged.fontFamily = overrides.fontFamily;
        merged.altFontFamily = overrides.fontFamily;
    }
    if (overrides.fontSize !== undefined) merged.fontSize = overrides.fontSize;
    if (overrides.fontWeight !== undefined) {
        const weightRule = `* { font-weight: ${overrides.fontWeight} !important; }`;
        merged.themeCSS = [typeof merged.themeCSS === "string" ? merged.themeCSS : "", weightRule].filter(Boolean).join("\n");
    }
    return merged;
}
