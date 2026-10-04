import {familyForChoices, runtimeFamily, weightForChoices} from "./font-utils";
import {PluginState} from "./types";

export interface MindmapOverrides {
    fontFamily?: string;
    fontSize?: number;
    fontWeight?: number;
}

export function mindmapOverrides(state: PluginState, loadedIds: Set<string>): MindmapOverrides {
    const settings = state.targets.mindmap;
    const onlyDefault = settings.fonts.length === 1 && settings.fonts[0].kind === "default";
    const family = settings.fonts.length && !onlyDefault
        ? familyForChoices(settings.fonts, state.fonts, loadedIds, runtimeFamily, "sans-serif") : null;
    const weight = weightForChoices(settings.fonts, state.fonts);
    return {
        ...(family ? {fontFamily: `${family}, sans-serif`} : {}),
        ...(settings.size !== null ? {fontSize: settings.size} : {}),
        ...(weight !== null ? {fontWeight: weight} : {}),
    };
}
