import {ContentOptions, DEFAULT_CONTENT_OPTIONS} from "./types";

// SiYuan's fixed editor line height (_typography.scss), also used by code blocks.
export const SIYUAN_LINE_HEIGHT = 1.625;
export const BOLD_WEIGHTS = [500, 600, 700, 800, 900];

export function parseContentOptions(value: unknown): ContentOptions {
    const source = value && typeof value === "object" ? value as Partial<Record<keyof ContentOptions, unknown>> : {};
    return {
        boldWeight: typeof source.boldWeight === "number" && BOLD_WEIGHTS.includes(source.boldWeight) ? source.boldWeight : DEFAULT_CONTENT_OPTIONS.boldWeight,
        noSynthesis: source.noSynthesis === true,
    };
}

