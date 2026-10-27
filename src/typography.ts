import {ContentOptions, DEFAULT_CONTENT_OPTIONS, FontTarget, HEADING_TARGETS} from "./types";

export const LETTER_SPACING_RANGE = {min: -0.05, max: 0.3, step: 0.005};
export const LINE_HEIGHT_RANGE = {min: 1, max: 3, step: 0.025};
// SiYuan's fixed editor line height (_typography.scss), also used by code blocks.
export const SIYUAN_LINE_HEIGHT = 1.625;
export const BOLD_WEIGHTS = [500, 600, 700, 800, 900];

const isHeading = (target: FontTarget) => HEADING_TARGETS.includes(target as typeof HEADING_TARGETS[number]);

export function supportsLetterSpacing(target: FontTarget): boolean {
    return target === "ui" || target === "content" || target === "mono" || isHeading(target);
}

// Spacing is independent of the font tab's "set separately" switch: the
// primary mono settings are inline code, the secondary ones code blocks.
// Inline code shares its paragraph's lines, so only code blocks get a line height.
export function supportsLineHeight(target: FontTarget, secondary: boolean): boolean {
    if (target === "content" || isHeading(target)) return !secondary;
    return target === "mono" && secondary;
}

export function clampLetterSpacing(value: unknown): number | null {
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    return Math.round(Math.min(LETTER_SPACING_RANGE.max, Math.max(LETTER_SPACING_RANGE.min, value)) * 1000) / 1000;
}

export function clampLineHeight(value: unknown): number | null {
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    return Math.round(Math.min(LINE_HEIGHT_RANGE.max, Math.max(LINE_HEIGHT_RANGE.min, value)) * 1000) / 1000;
}

export function parseContentOptions(value: unknown): ContentOptions {
    const source = value && typeof value === "object" ? value as Partial<Record<keyof ContentOptions, unknown>> : {};
    return {
        boldWeight: typeof source.boldWeight === "number" && BOLD_WEIGHTS.includes(source.boldWeight) ? source.boldWeight : DEFAULT_CONTENT_OPTIONS.boldWeight,
        indent: source.indent === true,
        autospace: source.autospace === true,
        noSynthesis: source.noSynthesis === true,
    };
}

export function hasContentOptions(options: ContentOptions | undefined): boolean {
    return Boolean(options && (options.boldWeight !== null || options.indent || options.autospace || options.noSynthesis));
}

export function formatLetterSpacing(value: number): string {
    return `${Number(value.toFixed(3))}em`;
}

export function formatLineHeight(value: number): string {
    return String(Number(value.toFixed(3)));
}
