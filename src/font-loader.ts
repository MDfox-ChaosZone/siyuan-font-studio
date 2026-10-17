import {EMOJI_UNICODE_RANGE, emojiRuntimeFamily, extractFontMetadata, FONT_METADATA_VERSION, nameWithoutExtension, runtimeFamily} from "./font-utils";
import {readFontFile} from "./storage";
import {FontRuntimeStatus, FontTarget, ImportedFont, PluginState} from "./types";

// Secondary settings are dormant until code/formula settings are separated.
export function selectedFontRequests(state: PluginState): Array<{id: string; emoji: boolean}> {
    const requests = new Map<string, {id: string; emoji: boolean}>();
    for (const [target, settings] of Object.entries(state.targets) as [FontTarget, PluginState["targets"][FontTarget]][]) {
        const choices = [...settings.fonts, ...(settings.decoupled ? settings.secondary?.fonts || [] : [])];
        for (const choice of choices) {
            if (choice.kind === "imported") requests.set(`${target === "emoji" ? "emoji" : "normal"}:${choice.id}`, {id: choice.id, emoji: target === "emoji"});
        }
    }
    return [...requests.values()];
}

interface FontSource {
    users: number;
    promise: Promise<ArrayBuffer>;
}

export class FontLoader {
    readonly faces = new Map<string, FontFace>();
    readonly emojiFaces = new Map<string, FontFace>();
    readonly statuses = new Map<string, FontRuntimeStatus>();
    private emojiStatuses = new Map<string, FontRuntimeStatus>();
    private pending = new Map<string, Promise<boolean>>();
    private sources = new Map<string, FontSource>();
    private disposed = false;

    constructor(private readonly metadataChanged: () => void) {}

    async ensure(font: ImportedFont, emoji = false): Promise<boolean> {
        if (this.disposed) return false;
        const key = `${emoji ? "emoji" : "normal"}:${font.id}`;
        const statuses = emoji ? this.emojiStatuses : this.statuses;
        // A failed font is retried after a plugin reload, not on every settings change.
        if (statuses.has(font.id)) return false;
        const pending = this.pending.get(key);
        if (pending) {
            await pending;
            return false;
        }
        const source = this.acquireSource(font);
        const operation = this.loadFace(font, emoji, source).finally(() => {
            if (this.pending.get(key) === operation) this.pending.delete(key);
            if (--source.users === 0 && this.sources.get(font.id) === source) this.sources.delete(font.id);
        });
        this.pending.set(key, operation);
        return operation;
    }

    private acquireSource(font: ImportedFont): FontSource {
        let source = this.sources.get(font.id);
        if (!source) {
            source = {users: 0, promise: Promise.resolve(new ArrayBuffer(0))};
            const current = source;
            this.sources.set(font.id, source);
            source.promise = readFontFile(font).then(buffer => {
                if (this.sources.get(font.id) !== current || this.disposed) return buffer;
                if (!hasCachedMetadata(font)) {
                    Object.assign(font, extractFontMetadata(buffer, font.displayName || nameWithoutExtension(font.originalName)));
                    this.metadataChanged();
                }
                return buffer;
            });
        }
        source.users++;
        return source;
    }

    private async loadFace(font: ImportedFont, emoji: boolean, source: FontSource): Promise<boolean> {
        const current = () => !this.disposed && this.sources.get(font.id) === source;
        const statuses = emoji ? this.emojiStatuses : this.statuses;
        try {
            const buffer = await source.promise;
            if (!current()) return false;
            const style = (font.fontStyle || "").toLocaleLowerCase();
            const axis = font.variationAxes?.wght;
            const face = new FontFace(emoji ? emojiRuntimeFamily(font.id) : runtimeFamily(font.id), buffer, emoji
                ? {unicodeRange: EMOJI_UNICODE_RANGE}
                : {style: style.includes("italic") ? "italic" : style.includes("oblique") ? "oblique" : "normal",
                    weight: axis ? `${axis.min} ${axis.max}` : String(font.fontWeight || 400)});
            await face.load();
            if (!current()) return false;
            document.fonts.add(face);
            (emoji ? this.emojiFaces : this.faces).set(font.id, face);
            statuses.set(font.id, {loaded: true});
        } catch (error) {
            if (!current()) return false;
            statuses.set(font.id, {loaded: false, error: error instanceof Error ? error.message : String(error)});
        }
        return true;
    }

    remove(id: string): void {
        this.sources.delete(id);
        for (const faces of [this.faces, this.emojiFaces]) {
            const face = faces.get(id);
            if (face) document.fonts.delete(face);
            faces.delete(id);
        }
        this.pending.delete(`normal:${id}`);
        this.pending.delete(`emoji:${id}`);
        this.statuses.delete(id);
        this.emojiStatuses.delete(id);
    }

    destroy(): void {
        this.disposed = true;
        for (const id of new Set([...this.sources.keys(), ...this.faces.keys(), ...this.emojiFaces.keys()])) this.remove(id);
        this.pending.clear();
        this.statuses.clear();
        this.emojiStatuses.clear();
    }
}

function hasCachedMetadata(font: ImportedFont): boolean {
    return font.metadataVersion === FONT_METADATA_VERSION && typeof font.fontName === "string"
        && typeof font.fontStyle === "string" && Number.isFinite(font.fontWeight)
        && Boolean(font.variationAxes) && typeof font.fontVersion === "string"
        && ["chinese", "english", "emoji", "math"].every(key => typeof font.coverage?.[key as keyof NonNullable<ImportedFont["coverage"]>] === "boolean");
}
