import * as SiyuanAPI from "siyuan";
import {confirm, Dialog, getAllModels, Menu, Plugin, Setting, showMessage} from "siyuan";
import "./index.scss";
import {
    createId,
    EMOJI_UNICODE_RANGE,
    emojiRuntimeFamily,
    extractFontMetadata,
    extensionOf,
    fontWeightName,
    groupImportedFonts,
    groupSystemFonts,
    hasDuplicateHash,
    MAX_FONT_BYTES,
    nameWithoutExtension,
    runtimeFamily,
    sha256,
    SUPPORTED_EXTENSIONS,
} from "./font-utils";
import {
    downloadExamplePreset,
    EXAMPLE_PRESET_ASSET_NAME,
    EXAMPLE_PRESET_RELEASE_URL,
    ExamplePresetAsset,
    fetchExamplePresetViaSiyuanProxy,
    resolveExamplePresetAsset,
} from "./example-preset";
import {activatePreset, clampLibraryPreviewWidth, cloneTargets, parseState, removeFontFromState, syncActivePreset} from "./state";
import {mergeMermaidConfig, mermaidOverrides} from "./mermaid";
import {applyGraphCanvasFontWeight} from "./graph-font";
import {errorMessage, isSiyuanErrorCode} from "./error-message";
import {
    BundledFontDescriptor,
    createPresetPackage,
    importedFontIdsInTargets,
    MAX_PRESET_PACKAGE_BYTES,
    parsePresetConfig,
    PRESET_FILE_FORMAT,
    readPresetContainer,
    serializePreset,
} from "./preset-io";
import {deleteFontFile, deletePluginStorage, ensureFontDirectory, FONT_STORAGE_ROOT, readFontFile, storedFontFileName, writeFontFile} from "./storage";
import {StyleManager} from "./style-manager";
import {ADVANCED_TARGETS, FontChoice, FontPreset, FontRuntimeStatus, FontTarget, ImportedFont, PluginState, SIMPLE_TARGETS, SystemFont} from "./types";
import {supportsAssignedWeight} from "./weight-controls";

const STATE_FILE = "font-manager.json";

interface MermaidRuntime {
    initialize(options?: Record<string, unknown>): unknown;
}

interface ProtyleRenderAPI {
    mermaidRender(element: Element): void;
}

class ManagerSetting extends Setting {
    constructor(private readonly openManager: () => void) {
        super({});
    }

    open(_name: string): void {
        this.openManager();
    }
}

export default class SiYuanFontStudio extends Plugin {
    private state: PluginState = parseState(null);
    private styleManager?: StyleManager;
    private faces = new Map<string, FontFace>();
    private emojiFaces = new Map<string, FontFace>();
    private statuses = new Map<string, FontRuntimeStatus>();
    private systemFonts: SystemFont[] = [];
    private managerDialog?: Dialog;
    private renameDialog?: Dialog;
    private presetTransferDialog?: Dialog;
    private exampleDownloadDialog?: Dialog;
    private exampleDownloadAbort?: AbortController;
    private themeObserver?: MutationObserver;
    private graphObserver?: MutationObserver;
    private mermaidScriptObserver?: MutationObserver;
    private saveChain: Promise<void> = Promise.resolve();
    private activeSecondaryTab: Partial<Record<FontTarget, boolean>> = {};
    private selectedLibraryVariants = new Map<string, string>();
    private selectedLibraryWeights = new Map<string, number>();
    private fontPreviewObservers = new Map<HTMLElement, IntersectionObserver>();
    private mermaidRuntime?: MermaidRuntime;
    private mermaidOriginalInitialize?: MermaidRuntime["initialize"];
    private mermaidWrappedInitialize?: MermaidRuntime["initialize"];
    private mermaidRefreshTimer?: number;
    private lastMermaidSignature = "";
    private disposed = false;

    async onload(): Promise<void> {
        this.disposed = false;
        this.addIcons(`<symbol id="iconSiYuanFontStudio" viewBox="0 0 32 32">
  <path fill-rule="evenodd" d="M8 4h4l7 24h-4.2l-1.6-5.5H6.8L5.2 28H1L8 4zm0 14.5h4l-2-7.3-2 7.3z"></path>
  <rect x="19" y="9" width="12" height="2" rx="1"></rect>
  <circle cx="23" cy="10" r="3"></circle>
  <rect x="19" y="21" width="12" height="2" rx="1"></rect>
  <circle cx="27" cy="22" r="3"></circle>
</symbol>`);
        this.styleManager = new StyleManager();
        this.state = parseState(await this.loadData(STATE_FILE));
        if (this.disposed) return;
        this.observeMermaidRuntime();
        const metadataChanged = (await Promise.all(this.state.fonts.map((font) => this.loadStoredFont(font)))).some(Boolean);
        if (this.disposed) return;
        if (metadataChanged) await this.persist();
        this.applySettings();
        void this.loadSystemFonts();

        this.addCommand({
            langKey: "openManager",
            hotkey: "",
            callback: () => this.openManager(),
        });

        this.setting = new ManagerSetting(() => this.openManager());

        this.themeObserver = new MutationObserver(() => {
            if (this.disposed) return;
            this.styleManager?.refreshBaselines();
            this.applySettings();
            if (this.managerDialog) this.renderManager();
        });
        this.themeObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["data-theme-mode", "data-light-theme", "data-dark-theme"],
        });
    }

    onLayoutReady(): void {
        if (this.disposed) return;
        this.styleManager?.refreshBaselines();
        this.applySettings();
        this.graphObserver = new MutationObserver((records) => {
            const graphAdded = records.some((record) => Array.from(record.addedNodes).some((node) => node instanceof Element
                && (node.matches(".graph__svg, .graph__labels") || Boolean(node.querySelector(".graph__svg, .graph__labels")))));
            if (graphAdded) {
                window.setTimeout(() => this.updateGraphModels(), 300);
                window.setTimeout(() => this.updateGraphModels(), 1200);
            }
        });
        this.graphObserver.observe(document.body, {childList: true, subtree: true});
        this.addTopBar({
            icon: "iconSiYuanFontStudio",
            title: this.i18n.openManager,
            position: "right",
            callback: (event) => this.openPresetMenu(event),
        });
    }

    onunload(): void {
        this.disposed = true;
        this.themeObserver?.disconnect();
        this.graphObserver?.disconnect();
        this.mermaidScriptObserver?.disconnect();
        if (this.mermaidRefreshTimer !== undefined) window.clearTimeout(this.mermaidRefreshTimer);
        this.restoreMermaidRuntime();
        this.renameDialog?.destroy();
        this.presetTransferDialog?.destroy();
        this.exampleDownloadAbort?.abort();
        this.exampleDownloadDialog?.destroy();
        this.managerDialog?.destroy();
        this.styleManager?.destroy();
        document.querySelectorAll<HTMLCanvasElement>("canvas.graph__labels")
            .forEach((canvas) => applyGraphCanvasFontWeight(canvas, null));
        for (const face of this.faces.values()) document.fonts.delete(face);
        for (const face of this.emojiFaces.values()) document.fonts.delete(face);
        this.faces.clear();
        this.emojiFaces.clear();
    }

    async uninstall(): Promise<void> {
        try {
            await deletePluginStorage(this.app.appId);
        } catch (error) {
            console.warn(`[${this.name}] failed to remove plugin data`, error);
        }
    }

    private async loadStoredFont(font: ImportedFont): Promise<boolean> {
        try {
            const buffer = await readFontFile(font);
            const metadata = extractFontMetadata(buffer, font.displayName || nameWithoutExtension(font.originalName));
            const changed = font.fontName !== metadata.fontName
                || font.fontStyle !== metadata.fontStyle
                || font.fontWeight !== metadata.fontWeight
                || JSON.stringify(font.variationAxes) !== JSON.stringify(metadata.variationAxes)
                || font.fontVersion !== metadata.fontVersion
                || JSON.stringify(font.coverage) !== JSON.stringify(metadata.coverage);
            font.fontName = metadata.fontName;
            font.fontStyle = metadata.fontStyle;
            font.fontWeight = metadata.fontWeight;
            font.variationAxes = metadata.variationAxes;
            font.fontVersion = metadata.fontVersion;
            font.coverage = metadata.coverage;
            await this.registerFont(font, buffer);
            this.statuses.set(font.id, {loaded: true});
            return changed;
        } catch (error) {
            this.statuses.set(font.id, {loaded: false, error: error instanceof Error ? error.message : String(error)});
            return false;
        }
    }

    private async registerFont(font: ImportedFont, buffer: ArrayBuffer): Promise<void> {
        const previous = this.faces.get(font.id);
        if (previous) document.fonts.delete(previous);
        const previousEmoji = this.emojiFaces.get(font.id);
        if (previousEmoji) document.fonts.delete(previousEmoji);
        const normalizedStyle = (font.fontStyle || "").toLocaleLowerCase();
        const weightAxis = font.variationAxes?.wght;
        const face = new FontFace(runtimeFamily(font.id), buffer.slice(0), {
            style: normalizedStyle.includes("italic") ? "italic" : normalizedStyle.includes("oblique") ? "oblique" : "normal",
            weight: weightAxis ? `${weightAxis.min} ${weightAxis.max}` : String(font.fontWeight || 400),
        });
        const emojiFace = new FontFace(emojiRuntimeFamily(font.id), buffer.slice(0), {unicodeRange: EMOJI_UNICODE_RANGE});
        await Promise.all([face.load(), emojiFace.load()]);
        if (this.disposed) return;
        document.fonts.add(face);
        document.fonts.add(emojiFace);
        this.faces.set(font.id, face);
        this.emojiFaces.set(font.id, emojiFace);
    }

    private applySettings(): void {
        if (this.disposed) return;
        const loadedIds = new Set(Array.from(this.statuses.entries()).filter(([, status]) => status.loaded).map(([id]) => id));
        this.styleManager?.apply(this.state, loadedIds);
        this.updateGraphModels();
        const mermaidSignature = JSON.stringify(mermaidOverrides(this.state, loadedIds));
        if (mermaidSignature !== this.lastMermaidSignature) {
            this.lastMermaidSignature = mermaidSignature;
            this.scheduleMermaidRefresh();
        }
    }

    private updateGraphModels(): void {
        if (this.disposed) return;
        const family = getComputedStyle(document.body).getPropertyValue("--b3-font-family-graph").trim();
        if (!family) return;
        const rawWeight = getComputedStyle(document.body).getPropertyValue("--bfm-font-weight-graph").trim();
        const parsedWeight = Number(rawWeight);
        const weight = rawWeight && Number.isFinite(parsedWeight) ? parsedWeight : null;
        document.querySelectorAll<HTMLCanvasElement>("canvas.graph__labels")
            .forEach((canvas) => applyGraphCanvasFontWeight(canvas, weight));
        type GraphModel = {
            onGraph?: (highlight: boolean, resetLayout?: boolean) => void;
        };
        for (const model of getAllModels().graph as GraphModel[]) {
            try {
                model.onGraph?.(false);
            } catch (error) {
                console.warn(`[${this.name}] unable to refresh graph font`, error);
            }
        }
    }

    private observeMermaidRuntime(): void {
        if (this.disposed) return;
        this.patchMermaidRuntime();
        const attachLoadListener = (script: HTMLScriptElement) => {
            script.addEventListener("load", () => this.patchMermaidRuntime(), {once: true});
        };
        document.querySelectorAll<HTMLScriptElement>("#protyleMermaidScript").forEach(attachLoadListener);
        this.mermaidScriptObserver = new MutationObserver((records) => {
            for (const record of records) {
                for (const node of Array.from(record.addedNodes)) {
                    if (node instanceof HTMLScriptElement && node.id === "protyleMermaidScript") attachLoadListener(node);
                }
            }
        });
        this.mermaidScriptObserver.observe(document.head, {childList: true});
    }

    private patchMermaidRuntime(): boolean {
        if (this.disposed) return false;
        const runtime = (window as typeof window & {mermaid?: MermaidRuntime}).mermaid;
        if (!runtime) return false;
        if (this.mermaidRuntime === runtime && runtime.initialize === this.mermaidWrappedInitialize) return true;
        this.restoreMermaidRuntime();
        const original = runtime.initialize;
        const wrapped: MermaidRuntime["initialize"] = (options) => {
            const loadedIds = new Set(Array.from(this.statuses.entries()).filter(([, status]) => status.loaded).map(([id]) => id));
            return original.call(runtime, mergeMermaidConfig(options, mermaidOverrides(this.state, loadedIds)));
        };
        runtime.initialize = wrapped;
        this.mermaidRuntime = runtime;
        this.mermaidOriginalInitialize = original;
        this.mermaidWrappedInitialize = wrapped;
        return true;
    }

    private restoreMermaidRuntime(): void {
        if (this.mermaidRuntime && this.mermaidOriginalInitialize && this.mermaidRuntime.initialize === this.mermaidWrappedInitialize) {
            this.mermaidRuntime.initialize = this.mermaidOriginalInitialize;
        }
        this.mermaidRuntime = undefined;
        this.mermaidOriginalInitialize = undefined;
        this.mermaidWrappedInitialize = undefined;
    }

    private scheduleMermaidRefresh(): void {
        if (this.mermaidRefreshTimer !== undefined) window.clearTimeout(this.mermaidRefreshTimer);
        this.mermaidRefreshTimer = window.setTimeout(() => {
            this.mermaidRefreshTimer = undefined;
            if (this.disposed) return;
            void this.refreshMermaidDiagrams();
        }, 240);
    }

    private async refreshMermaidDiagrams(): Promise<void> {
        if (this.disposed) return;
        const diagrams = Array.from(document.querySelectorAll<HTMLElement>('[data-subtype="mermaid"]'));
        if (!diagrams.length) {
            this.patchMermaidRuntime();
            return;
        }
        await document.fonts.ready;
        if (this.disposed) return;
        this.patchMermaidRuntime();
        diagrams.forEach((diagram) => diagram.removeAttribute("data-render"));
        const renderer = (SiyuanAPI as unknown as {ProtyleMethod?: ProtyleRenderAPI}).ProtyleMethod;
        if (renderer) renderer.mermaidRender(document.body);
    }

    private async loadSystemFonts(): Promise<void> {
        try {
            const response = await fetch("/api/system/getSysFonts", {method: "POST", body: "{}"});
            const payload = await response.json() as {code: number; data?: SystemFont[]};
            if (this.disposed) return;
            if (payload.code === 0 && Array.isArray(payload.data)) {
                const unique = new Map<string, SystemFont>();
                for (const font of payload.data) unique.set(`${font.family}\u0000${font.weight}`, font);
                this.systemFonts = Array.from(unique.values()).sort((a, b) => a.displayName.localeCompare(b.displayName));
                if (this.managerDialog) this.renderManager();
            }
        } catch (error) {
            console.warn(`[${this.name}] unable to load system fonts`, error);
        }
    }

    private openManager(): void {
        this.styleManager?.refreshBaselines();
        this.applySettings();
        if (this.managerDialog) {
            this.managerDialog.destroy();
        }
        this.managerDialog = new Dialog({
            title: this.i18n.managerTitle,
            width: "900px",
            height: "80vh",
            content: `<div class="b3-dialog__content bfm-manager"></div><div class="b3-dialog__action"><button class="b3-button b3-button--text">${this.i18n.close}</button></div>`,
            destroyCallback: () => {
                this.disconnectFontPreviewObservers();
                this.managerDialog = undefined;
            },
        });
        this.managerDialog.element.querySelector<HTMLButtonElement>(".b3-dialog__action button")?.addEventListener("click", () => this.managerDialog?.destroy());
        this.renderManager();
    }

    private renderManager(): void {
        const root = this.managerDialog?.element.querySelector<HTMLElement>(".bfm-manager");
        if (!root) return;
        this.disconnectFontPreviewObservers();
        root.style.setProperty("--bfm-library-preview-width", `${this.state.layout.libraryPreviewWidth}px`);
        const primaryOpen = root.querySelector<HTMLDetailsElement>(".bfm-primary")?.open ?? true;
        const advancedOpen = root.querySelector<HTMLDetailsElement>(".bfm-secondary")?.open ?? false;
        const openMenuElement = root.querySelector<HTMLElement>("[data-font-menu]:not([hidden])");
        const openMenu = openMenuElement?.dataset.fontMenu;
        const openMenuScrollTop = openMenuElement?.querySelector<HTMLElement>(".bfm-font-menu__options")?.scrollTop ?? 0;
        const managerScrollTop = root.scrollTop;
        const searchValues = new Map(Array.from(root.querySelectorAll<HTMLInputElement>("input[data-role='font-search']"))
            .map((input) => [`${input.dataset.target}-${input.dataset.secondary}`, input.value]));
        root.innerHTML = `
<section class="bfm-section">
  <div class="sfs-preset-bar">
    <h2>${this.i18n.presets}</h2>
    <div class="sfs-preset-bar__controls">
      <select class="b3-select" data-role="preset-select" aria-label="${escapeHtml(this.i18n.presets)}">${this.state.presets.map((preset) => `<option value="${escapeHtml(preset.id)}" ${preset.id === this.state.activePresetId ? "selected" : ""}>${escapeHtml(this.presetDisplayName(preset))}</option>`).join("")}</select>
      <button type="button" class="b3-button b3-button--outline" data-action="new-preset">＋ ${this.i18n.newPresetAction}</button>
      <button type="button" class="b3-button b3-button--outline" data-action="import-preset">${this.i18n.importPresetAction}</button>
      <button type="button" class="b3-button b3-button--outline" data-action="export-preset">${this.i18n.exportPresetAction}</button>
      <button type="button" class="b3-button b3-button--outline" data-action="rename-preset">${this.i18n.rename}</button>
      <button type="button" class="b3-button b3-button--cancel" data-action="delete-preset" ${this.state.presets.length <= 1 ? "disabled" : ""}>${this.i18n.delete}</button>
    </div>
    <button type="button" class="b3-button b3-button--text sfs-preset-bar__example" data-action="download-example-preset" title="${escapeHtml(this.i18n.downloadExamplePresetDescription)}">${this.i18n.downloadExamplePreset}</button>
    <input class="fn__none" type="file" data-role="preset-input" accept=".json,.zip,application/json,application/zip" multiple>
  </div>
  <details class="bfm-advanced bfm-primary" ${primaryOpen ? "open" : ""}>
    <summary><span>${this.i18n.primaryFonts}</span><small>${this.i18n.primaryFontsDescription}</small></summary>
    <div class="bfm-targets">${SIMPLE_TARGETS.map((target) => this.targetHtml(target)).join("")}</div>
  </details>
  <details class="bfm-advanced bfm-secondary" ${advancedOpen ? "open" : ""}>
    <summary><span>${this.i18n.advancedFonts}</span><small>${this.i18n.advancedFontsDescription}</small></summary>
    <div class="bfm-targets bfm-targets--advanced">${ADVANCED_TARGETS.map((target) => this.targetHtml(target)).join("")}</div>
  </details>
</section>
<section class="bfm-section">
  <div class="bfm-section__header">
    <div class="bfm-section__heading">
      <h2>${this.i18n.fontLibrary}</h2>
      <span class="bfm-info-tip bfm-info-tip--wide" tabindex="0" aria-label="${escapeHtml(`${this.i18n.fontFormatHintPrefix}CloudConvert${this.i18n.fontFormatHintMiddle}FontConvert${this.i18n.fontFormatHintSuffix}`)}">
        <span aria-hidden="true">i</span>
        <span class="bfm-info-tip__content" role="tooltip">${this.i18n.fontFormatHintPrefix}<a href="https://cloudconvert.com/ttf-to-woff2" target="_blank" rel="noopener noreferrer">CloudConvert</a>${this.i18n.fontFormatHintMiddle}<a href="https://github.com/MDfox-ChaosZone/Font-Converter" target="_blank" rel="noopener noreferrer">FontConvert</a>${this.i18n.fontFormatHintSuffix}</span>
      </span>
    </div>
    <div class="bfm-section__actions"><button class="b3-button b3-button--outline" data-action="open-folder">${this.i18n.openFontFolder}</button><button class="b3-button b3-button--text" data-action="import">${this.i18n.importFonts}</button></div>
  </div>
  <input class="fn__none" type="file" data-role="font-input" accept=".woff2,.woff,.ttf,.otf" multiple>
  <div class="bfm-library">${this.libraryHtml()}</div>
</section>`;
        this.applyFontPreviews(root);

        root.querySelectorAll<HTMLButtonElement>("button[data-font-trigger]").forEach((button) => {
            button.addEventListener("click", (event) => {
                event.stopPropagation();
                const menu = root.querySelector<HTMLElement>(`[data-font-menu="${button.dataset.fontTrigger}"]`);
                root.querySelectorAll<HTMLElement>("[data-font-menu]").forEach((item) => {
                    if (item !== menu) this.closeFontMenu(item);
                });
                if (menu) {
                    if (menu.hidden) {
                        menu.hidden = false;
                        this.populateFontMenu(menu);
                        requestAnimationFrame(() => menu.querySelector<HTMLInputElement>("input")?.focus());
                    } else {
                        this.closeFontMenu(menu);
                    }
                }
            });
        });
        root.querySelector<HTMLSelectElement>("select[data-role='preset-select']")?.addEventListener("change", (event) => {
            void this.activatePresetById((event.currentTarget as HTMLSelectElement).value);
        });
        root.querySelector<HTMLButtonElement>("button[data-action='new-preset']")?.addEventListener("click", () => this.openPresetNameDialog());
        root.querySelector<HTMLButtonElement>("button[data-action='import-preset']")?.addEventListener("click", () => root.querySelector<HTMLInputElement>("input[data-role='preset-input']")?.click());
        root.querySelector<HTMLButtonElement>("button[data-action='download-example-preset']")?.addEventListener("click", () => void this.confirmExamplePresetDownload());
        root.querySelector<HTMLButtonElement>("button[data-action='export-preset']")?.addEventListener("click", () => this.openPresetExportDialog());
        root.querySelector<HTMLButtonElement>("button[data-action='rename-preset']")?.addEventListener("click", () => this.openPresetNameDialog(this.state.activePresetId));
        root.querySelector<HTMLButtonElement>("button[data-action='delete-preset']")?.addEventListener("click", () => this.confirmDeletePreset(this.state.activePresetId));
        root.querySelector<HTMLInputElement>("input[data-role='preset-input']")?.addEventListener("change", (event) => {
            const input = event.currentTarget as HTMLInputElement;
            void this.importPresetFiles(Array.from(input.files || [])).finally(() => { input.value = ""; });
        });
        root.querySelectorAll<HTMLInputElement>("input[data-role='font-search']").forEach((input) => {
            input.addEventListener("click", (event) => event.stopPropagation());
            input.addEventListener("input", () => this.filterFontOptions(root, input.dataset.target as FontTarget, input.value));
        });
        root.querySelectorAll<HTMLElement>("[data-font-menu]").forEach((menu) => {
            menu.addEventListener("click", (event) => {
                const button = (event.target as Element).closest<HTMLButtonElement>("button[data-font-value]");
                if (!button || !menu.contains(button)) return;
                event.stopPropagation();
                void this.toggleFont(button.dataset.target as FontTarget, button.dataset.secondary === "true", button.dataset.fontValue!);
            });
        });
        root.querySelectorAll<HTMLButtonElement>("button[data-remove-font]").forEach((button) => {
            button.addEventListener("click", () => void this.removeAssignedFont(button.dataset.target as FontTarget, button.dataset.secondary === "true", Number(button.dataset.index)));
        });
        root.querySelectorAll<HTMLInputElement>("input[data-variable-weight]").forEach((input) => {
            input.addEventListener("input", () => {
                const target = input.dataset.target as FontTarget;
                const secondary = input.dataset.secondary === "true";
                const index = Number(input.dataset.index);
                this.setAssignedVariableWeight(target, secondary, index, Number(input.value));
                const number = root.querySelector<HTMLInputElement>(`input[data-variable-weight-number][data-target="${target}"][data-secondary="${secondary}"][data-index="${index}"]`);
                if (number) number.value = input.value;
            });
            input.addEventListener("change", () => void this.persist());
        });
        root.querySelectorAll<HTMLInputElement>("input[data-variable-weight-number]").forEach((input) => {
            input.addEventListener("change", () => {
                const target = input.dataset.target as FontTarget;
                const secondary = input.dataset.secondary === "true";
                const index = Number(input.dataset.index);
                this.setAssignedVariableWeight(target, secondary, index, Number(input.value));
                void this.persist();
                this.renderManager();
            });
        });
        root.querySelectorAll<HTMLSelectElement>("select[data-imported-variant]").forEach((select) => {
            select.addEventListener("change", () => void this.setAssignedImportedVariant(select.dataset.target as FontTarget, select.dataset.secondary === "true", Number(select.dataset.index), select.value));
        });
        root.querySelectorAll<HTMLSelectElement>("select[data-system-weight]").forEach((select) => {
            select.addEventListener("change", () => void this.setAssignedSystemWeight(select.dataset.target as FontTarget, select.dataset.secondary === "true", Number(select.dataset.index), Number(select.value)));
        });
        root.querySelectorAll<HTMLInputElement>("input[data-role='decouple']").forEach((input) => {
            input.addEventListener("change", () => void this.setDecoupled(input.dataset.target as FontTarget, input.checked));
        });
        root.querySelectorAll<HTMLButtonElement>("button[data-setting-tab]").forEach((button) => {
            button.addEventListener("click", () => {
                const target = button.dataset.target as FontTarget;
                this.activeSecondaryTab[target] = button.dataset.secondary === "true";
                this.renderManager();
            });
        });
        this.bindAssignmentDragging(root);
        this.bindLibraryDragging(root);
        this.bindLibraryColumnResizing(root);
        root.addEventListener("click", () => root.querySelectorAll<HTMLElement>("[data-font-menu]").forEach((menu) => this.closeFontMenu(menu)));
        root.querySelectorAll<HTMLInputElement>("input[data-role='size']").forEach((input) => {
            input.addEventListener("input", () => {
                const output = root.querySelector<HTMLElement>(`[data-size-output="${input.dataset.target}-${input.dataset.secondary === "true"}"]`);
                if (output) output.textContent = `${input.value}px`;
                const target = input.dataset.target as FontTarget;
                const secondary = input.dataset.secondary === "true";
                this.settingsFor(target, secondary).size = Number(input.value);
                root.querySelector<HTMLButtonElement>(`button[data-reset-size="${target}"][data-secondary="${secondary}"]`)?.classList.add("bfm-reset--active");
                this.applySettings();
            });
            input.addEventListener("change", () => void this.commitSize(input.dataset.target as FontTarget, input.dataset.secondary === "true", Number(input.value)));
        });
        root.querySelectorAll<HTMLButtonElement>("button[data-reset-font]").forEach((button) => {
            button.addEventListener("click", () => void this.resetFont(button.dataset.resetFont as FontTarget, button.dataset.secondary === "true"));
        });
        root.querySelectorAll<HTMLButtonElement>("button[data-reset-size]").forEach((button) => {
            button.addEventListener("click", () => void this.resetSize(button.dataset.resetSize as FontTarget, button.dataset.secondary === "true"));
        });
        root.querySelector<HTMLButtonElement>("button[data-action='open-folder']")?.addEventListener("click", () => void this.openFontFolder());
        root.querySelector<HTMLButtonElement>("button[data-action='import']")?.addEventListener("click", () => {
            root.querySelector<HTMLInputElement>("input[data-role='font-input']")?.click();
        });
        root.querySelector<HTMLInputElement>("input[data-role='font-input']")?.addEventListener("change", (event) => {
            const input = event.currentTarget as HTMLInputElement;
            void this.importFiles(Array.from(input.files || [])).finally(() => { input.value = ""; });
        });
        root.querySelectorAll<HTMLButtonElement>("button[data-rename]").forEach((button) => {
            button.addEventListener("click", () => this.openRenameDialog(button.dataset.rename!));
        });
        root.querySelectorAll<HTMLButtonElement>("button[data-delete]").forEach((button) => {
            button.addEventListener("click", () => this.confirmDelete(button.dataset.delete!));
        });
        root.querySelectorAll<HTMLSelectElement>("select[data-library-variant]").forEach((select) => {
            select.addEventListener("change", () => {
                this.selectedLibraryVariants.set(select.dataset.libraryVariant!, select.value);
                this.renderManager();
            });
        });
        root.querySelectorAll<HTMLInputElement>("input[data-library-variable-weight]").forEach((input) => {
            input.addEventListener("input", () => this.setLibraryPreviewWeight(root, input.dataset.libraryVariableWeight!, Number(input.value)));
        });
        root.querySelectorAll<HTMLInputElement>("input[data-library-variable-weight-number]").forEach((input) => {
            input.addEventListener("change", () => this.setLibraryPreviewWeight(root, input.dataset.libraryVariableWeightNumber!, Number(input.value)));
        });
        for (const input of root.querySelectorAll<HTMLInputElement>("input[data-role='font-search']")) {
            const value = searchValues.get(`${input.dataset.target}-${input.dataset.secondary}`);
            if (value) {
                input.value = value;
                this.filterFontOptions(root, input.dataset.target as FontTarget, value);
            }
        }
        if (openMenu) {
            const menu = root.querySelector<HTMLElement>(`[data-font-menu="${openMenu}"]`);
            if (menu) {
                menu.hidden = false;
                this.populateFontMenu(menu);
                root.scrollTop = managerScrollTop;
                const options = menu.querySelector<HTMLElement>(".bfm-font-menu__options");
                const input = menu.querySelector<HTMLInputElement>("input[data-role='font-search']");
                if (input?.value) this.filterFontOptions(root, input.dataset.target as FontTarget, input.value);
                if (options) options.scrollTop = openMenuScrollTop;
                requestAnimationFrame(() => {
                    root.scrollTop = managerScrollTop;
                    if (options) options.scrollTop = openMenuScrollTop;
                    menu.querySelector<HTMLInputElement>("input")?.focus({preventScroll: true});
                });
            }
        }
    }

    private targetHtml(target: FontTarget): string {
        const config = this.state.targets[target];
        const label = this.i18n[`${target}Font`];
        const description = this.i18n[`${target}Description`];
        const bounds = target === "ui" ? {min: 10, max: 24, fallback: 14}
            : target === "content" ? {min: 9, max: 72, fallback: window.siyuan.config?.editor.fontSize || 16}
                : target === "emoji" || target === "graph" ? {min: 8, max: 72, fallback: 19}
                    : target === "mermaid" ? {min: 10, max: 32, fallback: 16}
                    : target === "math" ? {min: 8, max: 72, fallback: window.siyuan.config?.editor.fontSize || 16}
                        : {min: 9, max: 72, fallback: 14};
        const supportsDecoupling = target === "mono" || target === "math";
        const decouple = supportsDecoupling ? `<label class="bfm-decouple"><input type="checkbox" data-role="decouple" data-target="${target}" ${config.decoupled ? "checked" : ""}><span>${this.i18n.separateSettings}</span></label>` : "";
        const primaryLabel = target === "mono" ? this.i18n.inlineCode : target === "math" ? this.i18n.inlineFormula : "";
        const secondaryLabel = target === "mono" ? this.i18n.codeBlock : this.i18n.formulaBlock;
        const secondaryActive = Boolean(this.activeSecondaryTab[target]);
        const controls = config.decoupled && supportsDecoupling
            ? `<div class="bfm-setting-tabs" role="tablist" aria-label="${escapeHtml(label)}">
  <button type="button" role="tab" class="${secondaryActive ? "" : "bfm-setting-tabs--active"}" data-setting-tab data-target="${target}" data-secondary="false" aria-selected="${!secondaryActive}">${primaryLabel}</button>
  <button type="button" role="tab" class="${secondaryActive ? "bfm-setting-tabs--active" : ""}" data-setting-tab data-target="${target}" data-secondary="true" aria-selected="${secondaryActive}">${secondaryLabel}</button>
</div>${this.settingControlsHtml(target, secondaryActive, bounds)}`
            : this.settingControlsHtml(target, false, bounds);
        const hint = target === "math" ? this.i18n.mathFontHint
            : target === "mermaid" ? this.i18n.mermaidSizeHint
                : "";
        const hintPositionClass = target === "math" ? " bfm-info-tip--start" : "";
        const titleHint = hint
            ? `<span class="bfm-info-tip${hintPositionClass}" tabindex="0" aria-label="${escapeHtml(hint)}"><span aria-hidden="true">i</span><span class="bfm-info-tip__content" role="tooltip">${escapeHtml(hint)}</span></span>`
            : "";
        return `<article class="bfm-target">
  <div class="bfm-target__title"><div class="bfm-target__label"><strong>${label}</strong>${titleHint}<span class="bfm-target__description">${description}</span></div>${decouple}</div>
  ${controls}
</article>`;
    }

    private presetDisplayName(preset: FontPreset): string {
        return preset.name || this.i18n.defaultPreset;
    }

    private openPresetMenu(event: MouseEvent): void {
        const menu = new Menu("sfs-preset-menu");
        menu.addItem({
            type: "readonly",
            label: this.i18n.fontPresets,
        });
        menu.addSeparator();
        const orderedPresets = [...this.state.presets].sort((a, b) =>
            Number(b.id === this.state.activePresetId) - Number(a.id === this.state.activePresetId));
        for (const preset of orderedPresets) {
            const active = preset.id === this.state.activePresetId;
            menu.addItem({
                icon: active ? "iconSelect" : undefined,
                label: this.presetDisplayName(preset),
                current: active,
                click: () => this.activatePresetById(preset.id),
            });
        }
        menu.addSeparator();
        menu.addItem({
            icon: "iconSettings",
            label: this.i18n.openSettings,
            click: () => this.openManager(),
        });
        const trigger = event.currentTarget as HTMLElement | null;
        const rect = trigger?.getBoundingClientRect();
        menu.open({
            x: rect?.left ?? event.clientX,
            y: rect?.bottom ?? event.clientY,
            w: rect?.width,
            isLeft: false,
        });
    }

    private async activatePresetById(id: string): Promise<void> {
        if (id === this.state.activePresetId) return;
        syncActivePreset(this.state);
        if (!activatePreset(this.state, id)) return;
        this.activeSecondaryTab = {};
        this.applySettings();
        await this.persist();
        this.renderManager();
    }

    private async confirmExamplePresetDownload(): Promise<void> {
        if (this.exampleDownloadAbort) return;
        try {
            const asset = await resolveExamplePresetAsset();
            const message = asset.size
                ? this.i18n.downloadExamplePresetConfirmWithSize.replace("${size}", formatFileSize(asset.size))
                : this.i18n.downloadExamplePresetConfirm;
            confirm(this.i18n.downloadExamplePreset, message, () => {
                void this.downloadAndImportExamplePreset(asset);
            });
        } catch (error) {
            showMessage(`${this.i18n.examplePresetDownloadFailed}: ${this.examplePresetError(error)}`, 7000, "error");
        }
    }

    private async downloadAndImportExamplePreset(asset: ExamplePresetAsset): Promise<void> {
        if (this.exampleDownloadAbort) return;
        const controller = new AbortController();
        this.exampleDownloadAbort = controller;
        let completed = false;
        this.exampleDownloadDialog?.destroy();
        const dialog = new Dialog({
            title: this.i18n.downloadExamplePreset,
            width: "520px",
            content: `<div class="sfs-example-download">
  <div class="b3-dialog__content">
    <p data-example-download-status>${this.i18n.downloadingExamplePreset}</p>
    <progress max="100" data-example-download-progress></progress>
  </div>
  <div class="b3-dialog__action"><button class="b3-button b3-button--outline" type="button" data-open-example-release>${this.i18n.openExamplePresetRelease}</button><div class="fn__space"></div><button class="b3-button b3-button--cancel" type="button" data-cancel-example-download>${this.i18n.cancel}</button></div>
</div>`,
            destroyCallback: () => {
                if (!completed) controller.abort();
                if (this.exampleDownloadDialog === dialog) this.exampleDownloadDialog = undefined;
                if (this.exampleDownloadAbort === controller) this.exampleDownloadAbort = undefined;
            },
        });
        this.exampleDownloadDialog = dialog;
        dialog.element.querySelector<HTMLButtonElement>("[data-cancel-example-download]")?.addEventListener("click", () => dialog.destroy());
        dialog.element.querySelector<HTMLButtonElement>("[data-open-example-release]")?.addEventListener("click", () => {
            window.open(EXAMPLE_PRESET_RELEASE_URL, "_blank", "noopener,noreferrer");
        });
        const status = dialog.element.querySelector<HTMLElement>("[data-example-download-status]");
        const progress = dialog.element.querySelector<HTMLProgressElement>("[data-example-download-progress]");

        try {
            if (status) status.textContent = asset.size
                ? this.i18n.downloadingExamplePresetTotal.replace("${total}", formatFileSize(asset.size))
                : this.i18n.downloadingExamplePreset;
            const reportProgress = ({received, total}: {received: number; total: number | null}) => {
                if (controller.signal.aborted) return;
                if (progress) {
                    if (total) {
                        progress.value = Math.min(100, received / total * 100);
                        progress.setAttribute("value", String(progress.value));
                    } else {
                        progress.removeAttribute("value");
                    }
                }
                if (status) status.textContent = total
                    ? this.i18n.examplePresetDownloadProgress
                        .replace("${received}", formatFileSize(received))
                        .replace("${total}", formatFileSize(total))
                        .replace("${percent}", String(Math.min(100, Math.round(received / total * 100))))
                    : this.i18n.examplePresetDownloadProgressUnknown.replace("${received}", formatFileSize(received));
            };
            let data: Uint8Array<ArrayBuffer>;
            try {
                data = await downloadExamplePreset(asset, controller.signal, reportProgress);
            } catch (error) {
                if (!(error instanceof TypeError) || controller.signal.aborted) throw error;
                if (status) status.textContent = this.i18n.downloadingExamplePresetViaProxy;
                progress?.removeAttribute("value");
                data = await downloadExamplePreset(asset, controller.signal, reportProgress, (input, init) => fetchExamplePresetViaSiyuanProxy(input, init));
            }
            if (controller.signal.aborted) return;
            if (status) status.textContent = this.i18n.importingExamplePreset;
            progress?.removeAttribute("value");
            await this.importPresetFiles([new File([data], EXAMPLE_PRESET_ASSET_NAME, {type: "application/zip"})]);
            completed = true;
            dialog.destroy();
        } catch (error) {
            if (controller.signal.aborted || error instanceof DOMException && error.name === "AbortError") return;
            completed = true;
            dialog.destroy();
            showMessage(`${this.i18n.examplePresetDownloadFailed}: ${this.examplePresetError(error)}`, 7000, "error");
        } finally {
            if (this.exampleDownloadAbort === controller) this.exampleDownloadAbort = undefined;
        }
    }

    private examplePresetError(error: unknown): string {
        const message = errorMessage(error);
        if (message === "example-package-too-large") return this.i18n.examplePresetTooLarge;
        if (message === "example-download-integrity" || message === "example-download-size-mismatch") return this.i18n.examplePresetIntegrityFailed;
        const httpStatus = /^example-(?:download|proxy)-http-(\d+)$/.exec(message)?.[1];
        if (httpStatus) return this.i18n.examplePresetHttpFailed.replace("${status}", httpStatus);
        if (message === "example-proxy-invalid-response") return this.i18n.examplePresetNetworkFailed;
        return message || this.i18n.examplePresetNetworkFailed;
    }

    private openPresetExportDialog(): void {
        const preset = this.state.presets.find((item) => item.id === this.state.activePresetId);
        if (!preset) return;
        this.presetTransferDialog?.destroy();
        this.presetTransferDialog = new Dialog({
            title: this.i18n.exportPreset,
            width: "520px",
            content: `<form class="sfs-preset-export">
  <div class="b3-dialog__content">
    <label class="sfs-preset-export__option"><input type="radio" name="export-mode" value="config" checked><span><strong>${this.i18n.exportConfigOnly}</strong><small>${this.i18n.exportConfigOnlyDescription}</small></span></label>
    <label class="sfs-preset-export__option"><input type="radio" name="export-mode" value="package"><span><strong>${this.i18n.exportWithFonts}</strong><small>${this.i18n.exportWithFontsDescription}</small></span></label>
    <label class="sfs-preset-export__unused"><input type="checkbox" data-role="include-unused-fonts" disabled><span>${this.i18n.includeUnusedFonts}</span></label>
    <p class="sfs-preset-export__notice">${this.i18n.exportFontExclusionNotice}</p>
  </div>
  <div class="b3-dialog__action"><button class="b3-button b3-button--cancel" type="button">${this.i18n.cancel}</button><div class="fn__space"></div><button class="b3-button b3-button--text" type="submit">${this.i18n.exportPreset}</button></div>
</form>`,
            destroyCallback: () => { this.presetTransferDialog = undefined; },
        });
        const form = this.presetTransferDialog.element.querySelector<HTMLFormElement>(".sfs-preset-export");
        const includeUnused = form?.querySelector<HTMLInputElement>("input[data-role='include-unused-fonts']");
        form?.querySelectorAll<HTMLInputElement>("input[name='export-mode']").forEach((input) => {
            input.addEventListener("change", () => {
                if (!includeUnused) return;
                includeUnused.disabled = input.value !== "package" || !input.checked;
                if (includeUnused.disabled) includeUnused.checked = false;
            });
        });
        form?.querySelector<HTMLButtonElement>("button[type='button']")?.addEventListener("click", () => this.presetTransferDialog?.destroy());
        form?.addEventListener("submit", (event) => {
            event.preventDefault();
            const submit = form.querySelector<HTMLButtonElement>("button[type='submit']");
            const mode = form.querySelector<HTMLInputElement>("input[name='export-mode']:checked")?.value;
            if (submit) submit.disabled = true;
            void this.exportActivePreset(mode === "package", Boolean(includeUnused?.checked)).finally(() => {
                if (submit && this.presetTransferDialog) submit.disabled = false;
            });
        });
    }

    private async exportActivePreset(withFonts: boolean, includeUnused: boolean): Promise<void> {
        const preset = this.state.presets.find((item) => item.id === this.state.activePresetId);
        if (!preset) return;
        try {
            syncActivePreset(this.state);
            const displayName = this.presetDisplayName(preset);
            if (!withFonts) {
                downloadFile(new Blob([serializePreset(preset, this.state.fonts, displayName)], {type: "application/json;charset=utf-8"}), `${safeFileName(displayName)}.${PRESET_FILE_FORMAT}.json`);
            } else {
                const includedIds = importedFontIdsInTargets(preset.targets);
                if (includeUnused) {
                    const usedByAnyPreset = new Set<string>();
                    for (const item of this.state.presets) {
                        for (const id of importedFontIdsInTargets(item.targets)) usedByAnyPreset.add(id);
                    }
                    for (const font of this.state.fonts) if (!usedByAnyPreset.has(font.id)) includedIds.add(font.id);
                }
                const includedFonts = this.state.fonts.filter((font) => includedIds.has(font.id));
                const totalSize = includedFonts.reduce((sum, font) => sum + font.size, 0);
                if (totalSize > MAX_PRESET_PACKAGE_BYTES) throw new Error(this.i18n.presetPackageTooLarge);
                const files = await Promise.all(includedFonts.map(async (font) => ({font, data: await readFontFile(font)})));
                const archive = await createPresetPackage(preset, this.state.fonts, files, displayName);
                downloadFile(new Blob([archive], {type: "application/zip"}), `${safeFileName(displayName)}.${PRESET_FILE_FORMAT}.zip`);
            }
            this.presetTransferDialog?.destroy();
            showMessage(this.i18n.exportPresetSuccess, 3500, "info");
        } catch (error) {
            showMessage(`${this.i18n.exportPresetFailed}: ${error instanceof Error ? error.message : error}`, 6000, "error");
        }
    }

    private async importPresetFiles(files: File[]): Promise<void> {
        if (!files.length) return;
        syncActivePreset(this.state);
        let importedPresets = 0;
        let importedFonts = 0;
        const notices: string[] = [];
        const failures: string[] = [];
        for (const file of files) {
            try {
                if (file.size > MAX_PRESET_PACKAGE_BYTES) throw new Error(this.i18n.presetPackageTooLarge);
                const container = readPresetContainer(new Uint8Array(await file.arrayBuffer()), file.name);
                parsePresetConfig(container.config, this.state.fonts);
                for (const bundled of container.bundledFonts) {
                    try {
                        await this.validateBundledFont(bundled.descriptor, bundled.data);
                    } catch (error) {
                        throw new Error(`${bundled.descriptor.displayName}: ${error instanceof Error ? error.message : error}`);
                    }
                }
                for (const bundled of container.bundledFonts) {
                    if (hasDuplicateHash(this.state.fonts, bundled.descriptor.sha256)) continue;
                    try {
                        if (await this.installBundledFont(bundled.descriptor, bundled.data)) importedFonts++;
                    } catch (error) {
                        notices.push(`${bundled.descriptor.displayName}: ${error instanceof Error ? error.message : error}`);
                    }
                }
                const parsed = parsePresetConfig(container.config, this.state.fonts);
                const preset: FontPreset = {
                    id: `preset-${createId()}`,
                    name: this.uniquePresetName(parsed.name),
                    targets: parsed.targets,
                };
                this.state.presets.push(preset);
                this.state.activePresetId = preset.id;
                importedPresets++;
                if (parsed.missingFonts.length) {
                    notices.push(this.i18n.presetMissingFonts
                        .replace("${name}", preset.name)
                        .replace("${fonts}", parsed.missingFonts.join("、")));
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : "";
                const detail = message === "package-too-large" ? this.i18n.presetPackageTooLarge
                    : message === "invalid-preset" || message === "invalid-json" || !message ? this.i18n.invalidPresetFile
                        : message;
                failures.push(`${file.name}: ${detail}`);
            }
        }
        if (importedPresets || importedFonts) {
            if (importedPresets) {
                activatePreset(this.state, this.state.activePresetId);
                this.activeSecondaryTab = {};
                this.applySettings();
            }
            await this.persist();
            this.renderManager();
        }
        const summary = [
            importedPresets ? `${this.i18n.importPresetSuccess}: ${importedPresets}` : "",
            importedFonts ? `${this.i18n.importFontsSuccess}: ${importedFonts}` : "",
            ...notices,
            ...failures,
        ].filter(Boolean).join("<br>");
        if (summary) showMessage(summary, failures.length || notices.length ? 8000 : 4000, failures.length ? "error" : "info");
    }

    private async validateBundledFont(descriptor: BundledFontDescriptor, data: Uint8Array<ArrayBuffer>): Promise<void> {
        const extension = descriptor.extension.toLocaleLowerCase();
        if (!SUPPORTED_EXTENSIONS.has(extension) || data.byteLength > MAX_FONT_BYTES || descriptor.size !== data.byteLength) {
            throw new Error(this.i18n.invalidFont);
        }
        if (await sha256(data.buffer) !== descriptor.sha256) throw new Error(this.i18n.invalidFont);
    }

    private async installBundledFont(descriptor: BundledFontDescriptor, data: Uint8Array<ArrayBuffer>): Promise<boolean> {
        if (hasDuplicateHash(this.state.fonts, descriptor.sha256)) return false;
        const extension = descriptor.extension.toLocaleLowerCase();
        const metadata = extractFontMetadata(data.buffer, descriptor.displayName || nameWithoutExtension(descriptor.originalName));
        const id = createId();
        const font: ImportedFont = {
            id,
            displayName: descriptor.displayName || nameWithoutExtension(descriptor.originalName),
            originalName: descriptor.originalName,
            storageName: storedFontFileName({id, originalName: descriptor.originalName, extension}),
            extension,
            size: data.byteLength,
            sha256: descriptor.sha256,
            importedAt: new Date().toISOString(),
            ...metadata,
        };
        const file = new File([data], descriptor.originalName);
        const testFace = new FontFace(`BFM_VALIDATE_${font.id}`, data.buffer.slice(0));
        await testFace.load();
        await writeFontFile(font, file, this.app.appId);
        try {
            await this.registerFont(font, data.buffer);
            this.statuses.set(font.id, {loaded: true});
            this.state.fonts.push(font);
            return true;
        } catch (error) {
            await deleteFontFile(font, this.app.appId).catch(() => undefined);
            throw error;
        }
    }

    private uniquePresetName(rawName: string): string {
        const base = rawName.trim().slice(0, 100) || this.i18n.importedPreset;
        const names = new Set(this.state.presets.map((preset) => this.presetDisplayName(preset).toLocaleLowerCase()));
        if (!names.has(base.toLocaleLowerCase())) return base;
        let index = 2;
        while (names.has(`${base} (${index})`.toLocaleLowerCase())) index++;
        return `${base} (${index})`.slice(0, 100);
    }

    private openPresetNameDialog(id?: string): void {
        const preset = id ? this.state.presets.find((item) => item.id === id) : undefined;
        if (id && !preset) return;
        this.renameDialog?.destroy();
        const title = preset ? this.i18n.renamePreset : this.i18n.newPreset;
        const value = preset ? this.presetDisplayName(preset) : "";
        this.renameDialog = new Dialog({
            title,
            width: "480px",
            content: `<form class="bfm-rename"><div class="b3-dialog__content"><label>${this.i18n.presetNamePrompt}</label><input class="b3-text-field fn__block" maxlength="100" value="${escapeHtml(value)}"></div><div class="b3-dialog__action"><button class="b3-button b3-button--cancel" type="button">${this.i18n.cancel}</button><div class="fn__space"></div><button class="b3-button b3-button--text" type="submit">${this.i18n.save}</button></div></form>`,
            destroyCallback: () => { this.renameDialog = undefined; },
        });
        const form = this.renameDialog.element.querySelector<HTMLFormElement>(".bfm-rename");
        const input = form?.querySelector<HTMLInputElement>("input");
        form?.querySelector<HTMLButtonElement>("button[type='button']")?.addEventListener("click", () => this.renameDialog?.destroy());
        form?.addEventListener("submit", (event) => {
            event.preventDefault();
            if (input) void this.savePresetName(preset?.id, input.value);
        });
        requestAnimationFrame(() => {
            input?.focus();
            input?.select();
        });
    }

    private async savePresetName(id: string | undefined, rawValue: string): Promise<void> {
        const name = rawValue.trim().slice(0, 100);
        if (!name) return;
        if (this.state.presets.some((preset) => preset.id !== id && this.presetDisplayName(preset).toLocaleLowerCase() === name.toLocaleLowerCase())) {
            showMessage(this.i18n.presetNameExists, 4000, "error");
            return;
        }
        if (id) {
            const preset = this.state.presets.find((item) => item.id === id);
            if (!preset) return;
            preset.name = name;
        } else {
            syncActivePreset(this.state);
            const preset: FontPreset = {id: `preset-${createId()}`, name, targets: cloneTargets(this.state.targets)};
            this.state.presets.push(preset);
            this.state.activePresetId = preset.id;
        }
        await this.persist();
        this.renameDialog?.destroy();
        this.renderManager();
    }

    private confirmDeletePreset(id: string): void {
        const preset = this.state.presets.find((item) => item.id === id);
        if (!preset || this.state.presets.length <= 1) return;
        confirm(this.i18n.deletePreset, this.i18n.confirmDeletePreset.replace("${name}", this.presetDisplayName(preset)), () => void this.deletePreset(id));
    }

    private async deletePreset(id: string): Promise<void> {
        const index = this.state.presets.findIndex((preset) => preset.id === id);
        if (index < 0 || this.state.presets.length <= 1) return;
        const wasActive = this.state.activePresetId === id;
        this.state.presets.splice(index, 1);
        if (wasActive) {
            const next = this.state.presets[Math.min(index, this.state.presets.length - 1)];
            activatePreset(this.state, next.id);
            this.activeSecondaryTab = {};
            this.applySettings();
        }
        await this.persist();
        this.renderManager();
    }

    private settingControlsHtml(target: FontTarget, secondary: boolean, bounds: {min: number; max: number; fallback: number}): string {
        const config = this.settingsFor(target, secondary);
        const size = config.size ?? bounds.fallback;
        const supportsSize = target !== "emoji" && target !== "graph";
        const sizeControls = supportsSize ? `<div class="bfm-size"><input type="range" data-role="size" data-target="${target}" data-secondary="${secondary}" min="${bounds.min}" max="${bounds.max}" step="1" value="${size}"><output data-size-output="${target}-${secondary}">${size}px</output></div>` : "";
        const resetSize = supportsSize ? `<button class="b3-button bfm-reset ${config.size === null ? "" : "bfm-reset--active"}" data-reset-size="${target}" data-secondary="${secondary}">${this.i18n.resetSize}</button>` : "";
        return `<div class="bfm-setting-pane">${this.fontPickerHtml(target, secondary, config.fonts)}
  ${sizeControls}
  <div class="bfm-target__actions"><button class="b3-button bfm-reset ${config.fonts.length ? "bfm-reset--active" : ""}" data-reset-font="${target}" data-secondary="${secondary}">${this.i18n.resetFont}</button>${resetSize}</div></div>`;
    }

    private fontPickerHtml(target: FontTarget, secondary: boolean, selected: FontChoice[]): string {
        const followLabel = `${this.i18n.followSiyuan}（${this.baselineDisplayName(target)}）`;
        const labelFor = (choice: FontChoice) => choice.kind === "imported" ? this.importedGroupFor(choice.id)?.familyName || this.state.fonts.find((font) => font.id === choice.id)?.displayName || this.i18n.missing : choice.kind === "system" ? this.systemFontGroups().find((group) => group.family === choice.family)?.displayName || choice.displayName : followLabel;
        const stack = selected.length ? selected.map((choice, index) => `<div class="bfm-stack__item" draggable="false" data-stack-item data-target="${target}" data-secondary="${secondary}" data-index="${index}"><span class="bfm-drag" draggable="true" title="${this.i18n.dragToSort}">⠿</span><div class="bfm-stack__main"><span>${escapeHtml(labelFor(choice))}</span>${this.assignedWeightControlHtml(choice, target, secondary, index)}</div><button type="button" data-remove-font data-target="${target}" data-secondary="${secondary}" data-index="${index}" aria-label="${this.i18n.remove}">×</button></div>`).join("") : `<div class="bfm-stack__default">${escapeHtml(followLabel)}</div>`;
        const scope = `${target}-${secondary}`;
        return `<div class="bfm-stack" data-stack="${scope}">${stack}</div><div class="bfm-font-picker">
  <button type="button" class="b3-button b3-button--outline bfm-font-picker__trigger" data-font-trigger="${scope}"><span>＋ ${this.i18n.selectFonts}</span><span class="bfm-font-picker__chevron" aria-hidden="true"></span></button>
  <div class="bfm-font-menu" data-font-menu="${scope}" data-target="${target}" data-secondary="${secondary}" hidden>
    <input class="b3-text-field fn__block" type="search" data-role="font-search" data-target="${target}" data-secondary="${secondary}" placeholder="${this.i18n.searchFonts}">
    <p class="bfm-font-menu__hint">${this.i18n.fontSelectionHint}</p>
    <div class="bfm-font-menu__options"></div>
  </div>
</div>`;
    }

    private importedGroupFor(fontId: string) {
        return groupImportedFonts(this.state.fonts).find((group) => group.fonts.some((font) => font.id === fontId));
    }

    private preferredImportedFont(fonts: ImportedFont[]): ImportedFont {
        return fonts.find((font) => (font.fontWeight || 400) === 400) || fonts[0];
    }

    private systemFontGroups() {
        return groupSystemFonts(this.systemFonts);
    }

    private fontChoiceKey(choice: FontChoice): string {
        if (choice.kind === "default") return "default";
        if (choice.kind === "imported") {
            const group = this.importedGroupFor(choice.id);
            return `imported:${group ? this.preferredImportedFont(group.fonts).id : choice.id}`;
        }
        const group = this.systemFontGroups().find((item) => item.family === choice.family);
        return `system:${group?.preferred.index ?? this.systemFonts.findIndex((font) => font.family === choice.family && font.weight === choice.weight)}`;
    }

    private assignedWeightControlHtml(choice: FontChoice, target: FontTarget, secondary: boolean, index: number): string {
        if (choice.kind === "default") return "";
        const supportsWeight = supportsAssignedWeight(target);
        if (choice.kind === "imported") {
            const font = this.state.fonts.find((item) => item.id === choice.id);
            if (!font) return "";
            const axis = font.variationAxes?.wght;
            if (axis && supportsWeight) {
                const weight = Math.min(axis.max, Math.max(axis.min, choice.weight ?? axis.default));
                return `<div class="bfm-stack__weight bfm-stack__weight--variable"><input type="range" min="${axis.min}" max="${axis.max}" step="1" value="${weight}" data-variable-weight data-target="${target}" data-secondary="${secondary}" data-index="${index}" aria-label="${escapeHtml(axis.name)}"><input class="b3-text-field" type="number" min="${axis.min}" max="${axis.max}" step="1" value="${weight}" data-variable-weight-number data-target="${target}" data-secondary="${secondary}" data-index="${index}" aria-label="${escapeHtml(axis.name)}"></div>`;
            }
            if (axis) return `<select class="b3-select bfm-stack__weight" disabled aria-label="${escapeHtml(axis.name)}"><option>${this.i18n.variableWeight} · ${axis.min}–${axis.max}</option></select>`;
            const group = this.importedGroupFor(choice.id);
            if (group && group.fonts.length > 1) return `<select class="b3-select bfm-stack__weight" data-imported-variant data-target="${target}" data-secondary="${secondary}" data-index="${index}" aria-label="${escapeHtml(group.familyName)}">${group.fonts.map((variant) => `<option value="${escapeHtml(variant.id)}" ${variant.id === choice.id ? "selected" : ""}>${escapeHtml(variant.fontStyle || "Regular")} · ${variant.fontWeight || 400}</option>`).join("")}</select>`;
            if (group) return `<select class="b3-select bfm-stack__weight" disabled aria-label="${escapeHtml(group.familyName)}"><option>${escapeHtml(font.fontStyle || fontWeightName(font.fontWeight || 400))} · ${font.fontWeight || 400}</option></select>`;
            return "";
        }
        const group = this.systemFontGroups().find((item) => item.family === choice.family);
        if (!group) return "";
        const disabled = !supportsWeight || group.fonts.length < 2;
        return `<select class="b3-select bfm-stack__weight" ${disabled ? "disabled" : `data-system-weight data-target="${target}" data-secondary="${secondary}" data-index="${index}"`} aria-label="${escapeHtml(choice.family)}">${group.fonts.map(({font}) => `<option value="${font.weight}" ${font.weight === choice.weight ? "selected" : ""}>${fontWeightName(font.weight)} · ${font.weight}</option>`).join("")}</select>`;
    }

    private fontOptionHtml(target: FontTarget, secondary: boolean, selected: FontChoice[], value: string, label: string, preview: {family?: string; weight?: number; importedId?: string; searchText?: string; weightCount?: number; variableWeight?: boolean} = {}): string {
        const selectedIndex = selected.findIndex((choice) => this.fontChoiceKey(choice) === value);
        const isSelected = selectedIndex >= 0;
        const previewData = preview.importedId ? ` data-preview-font-id="${escapeHtml(preview.importedId)}"`
            : preview.family ? ` data-preview-family="${escapeHtml(preview.family)}" data-preview-weight="${preview.weight || 400}"` : "";
        const weightNote = preview.variableWeight ? this.i18n.variableWeight
            : (preview.weightCount || 0) > 1 ? this.i18n.fontWeightsCount.replace("${count}", String(preview.weightCount)) : "";
        return `<button type="button" class="bfm-font-option ${isSelected ? "bfm-font-option--selected" : ""}" data-font-value="${escapeHtml(value)}" data-target="${target}" data-secondary="${secondary}" data-search-text="${escapeHtml(preview.searchText || label.toLocaleLowerCase())}" aria-pressed="${isSelected}"><span class="bfm-font-option__main"><span class="bfm-font-option__label"${previewData}>${escapeHtml(label)}</span>${weightNote ? `<small class="bfm-font-option__weights">${escapeHtml(weightNote)}</small>` : ""}</span><span class="bfm-font-option__selection"><span class="bfm-font-option__order">${isSelected ? selectedIndex + 1 : ""}</span><span class="bfm-font-option__check" aria-hidden="true">${isSelected ? "✓" : ""}</span></span></button>`;
    }

    private systemFontOptionsHtml(target: FontTarget, secondary: boolean, selected: FontChoice[], start: number, end: number): string {
        return this.systemFontGroups().slice(start, end).map((group) => this.fontOptionHtml(target, secondary, selected, `system:${group.preferred.index}`, group.displayName, {family: group.family, weight: group.preferred.font.weight, searchText: group.searchText, weightCount: group.fonts.length})).join("");
    }

    private fontOptionsHtml(target: FontTarget, secondary: boolean, selected: FontChoice[], initialSystemCount: number): string {
        const followLabel = `${this.i18n.followSiyuan}（${this.baselineDisplayName(target)}）`;
        const imported = groupImportedFonts(this.state.fonts).map((group) => {
            const font = this.preferredImportedFont(group.fonts);
            return this.fontOptionHtml(target, secondary, selected, `imported:${font.id}`, group.familyName, {importedId: font.id, weight: font.variationAxes?.wght?.default ?? font.fontWeight, weightCount: group.fonts.length, variableWeight: Boolean(font.variationAxes?.wght)});
        }).join("");
        const system = this.systemFontOptionsHtml(target, secondary, selected, 0, initialSystemCount);
        const siyuanDefault = this.fontOptionHtml(target, secondary, selected, "default", followLabel);
        const group = (label: string, content: string) => content ? `<section class="bfm-font-group"><small>${label}</small>${content}</section>` : "";
        const systemGroup = this.systemFontGroups().length ? `<section class="bfm-font-group" data-system-font-group><small>${this.i18n.systemFonts}</small>${system}</section>` : "";
        return `${group(this.i18n.defaultFonts, siyuanDefault)}${group(this.i18n.importedFonts, imported)}${systemGroup}`;
    }

    private populateFontMenu(menu: HTMLElement): void {
        if (menu.dataset.populated === "true") return;
        const target = menu.dataset.target as FontTarget;
        const secondary = menu.dataset.secondary === "true";
        const options = menu.querySelector<HTMLElement>(".bfm-font-menu__options");
        if (!options) return;
        const selected = this.settingsFor(target, secondary).fonts;
        const chunkSize = 64;
        options.innerHTML = this.fontOptionsHtml(target, secondary, selected, chunkSize);
        menu.dataset.populated = "true";
        this.observeFontPreviews(menu, options);
        const input = menu.querySelector<HTMLInputElement>("input[data-role='font-search']");
        if (input?.value) this.filterFontOptions(menu.closest<HTMLElement>(".bfm-manager") || menu, target, input.value);
        let offset = chunkSize;
        const systemFontCount = this.systemFontGroups().length;
        const appendChunk = () => {
            if (menu.dataset.populated !== "true" || !menu.isConnected || offset >= systemFontCount) return;
            const systemGroup = options.querySelector<HTMLElement>("[data-system-font-group]");
            if (!systemGroup) return;
            const end = Math.min(systemFontCount, offset + chunkSize);
            systemGroup.insertAdjacentHTML("beforeend", this.systemFontOptionsHtml(target, secondary, selected, offset, end));
            offset = end;
            this.observeFontPreviews(menu, options);
            if (input?.value) this.filterFontOptions(menu.closest<HTMLElement>(".bfm-manager") || menu, target, input.value);
            if (offset < systemFontCount) requestAnimationFrame(appendChunk);
        };
        if (offset < systemFontCount) requestAnimationFrame(appendChunk);
    }

    private closeFontMenu(menu: HTMLElement): void {
        menu.hidden = true;
        this.fontPreviewObservers.get(menu)?.disconnect();
        this.fontPreviewObservers.delete(menu);
        const options = menu.querySelector<HTMLElement>(".bfm-font-menu__options");
        if (options) options.replaceChildren();
        delete menu.dataset.populated;
    }

    private observeFontPreviews(menu: HTMLElement, options: HTMLElement): void {
        const previews = options.querySelectorAll<HTMLElement>("[data-preview-font-id]:not([data-preview-observed]), [data-preview-family]:not([data-preview-observed])");
        if (!("IntersectionObserver" in window)) {
            this.applyFontPreviews(options);
            return;
        }
        let observer = this.fontPreviewObservers.get(menu);
        if (!observer) observer = new IntersectionObserver((entries) => {
            for (const entry of entries) {
                const element = entry.target as HTMLElement;
                if (!entry.isIntersecting) {
                    element.style.removeProperty("font-family");
                    element.style.removeProperty("font-weight");
                    continue;
                }
                this.applyFontPreview(element);
            }
        }, {root: options, rootMargin: "60px 0px"});
        previews.forEach((element) => {
            element.dataset.previewObserved = "true";
            observer.observe(element);
        });
        this.fontPreviewObservers.set(menu, observer);
    }

    private disconnectFontPreviewObservers(): void {
        this.fontPreviewObservers.forEach((observer) => observer.disconnect());
        this.fontPreviewObservers.clear();
    }

    private filterFontOptions(root: HTMLElement, target: FontTarget, query: string): void {
        const input = root.querySelector<HTMLInputElement>(`input[data-role="font-search"][data-target="${target}"]:focus`)
            || root.querySelector<HTMLInputElement>(`input[data-role="font-search"][data-target="${target}"]`);
        const secondary = input?.dataset.secondary === "true";
        const menu = root.querySelector<HTMLElement>(`[data-font-menu="${target}-${secondary}"]`);
        if (!menu) return;
        const normalized = query.trim().toLocaleLowerCase();
        menu.querySelectorAll<HTMLButtonElement>("[data-font-value]").forEach((option) => {
            option.hidden = Boolean(normalized) && !option.dataset.searchText?.includes(normalized);
        });
        menu.querySelectorAll<HTMLElement>(".bfm-font-group").forEach((group) => {
            group.hidden = Array.from(group.querySelectorAll<HTMLButtonElement>("[data-font-value]")).every((option) => option.hidden);
        });
    }

    private baselineDisplayName(target: FontTarget): string {
        const stack = this.styleManager?.getBaselineFamily(target) || "默认字体";
        const candidates = stack.split(",").map((item) => item.trim().replace(/^['"]|['"]$/g, ""));
        return candidates.find((item) => item && !/^Emojis (Additional|Reset)$/i.test(item)) || candidates[0] || "默认字体";
    }

    private setLibraryPreviewWeight(root: HTMLElement, fontId: string, rawWeight: number): void {
        const font = this.state.fonts.find((item) => item.id === fontId);
        const axis = font?.variationAxes?.wght;
        if (!axis) return;
        const weight = Math.round(Math.min(axis.max, Math.max(axis.min, Number.isFinite(rawWeight) ? rawWeight : axis.default)));
        this.selectedLibraryWeights.set(fontId, weight);
        root.querySelectorAll<HTMLInputElement>(`[data-library-variable-weight="${fontId}"], [data-library-variable-weight-number="${fontId}"]`).forEach((input) => {
            input.value = String(weight);
        });
        root.querySelectorAll<HTMLElement>(`[data-preview-font-id="${fontId}"]`).forEach((preview) => {
            preview.dataset.previewWeight = String(weight);
            preview.style.fontWeight = String(weight);
        });
    }

    private libraryHtml(): string {
        if (!this.state.fonts.length) return `<div class="bfm-empty">${this.i18n.noFonts}</div>`;
        return groupImportedFonts(this.state.fonts).map((group) => {
            const preferredFont = group.fonts.find((font) => (font.fontWeight || 400) === 400) || group.fonts[0];
            const selectedId = this.selectedLibraryVariants.get(group.key);
            const selectedFont = group.fonts.find((font) => font.id === selectedId) || preferredFont;
            const status = this.statuses.get(selectedFont.id) || {loaded: false};
            const coverageTags = [
                selectedFont.coverage?.chinese ? this.i18n.coverageChinese : "",
                selectedFont.coverage?.english ? this.i18n.coverageEnglish : "",
                selectedFont.coverage?.emoji ? this.i18n.coverageEmoji : "",
                selectedFont.coverage?.math ? this.i18n.coverageMath : "",
            ].filter(Boolean).map((label) => `<span class="bfm-font__tag">${escapeHtml(label)}</span>`).join("");
            const metadata = `${selectedFont.fontVersion || "—"} · ${selectedFont.extension.toLocaleUpperCase()} · ${formatFileSize(selectedFont.size)}`;
            const variableAxis = selectedFont.variationAxes?.wght;
            const previewWeight = variableAxis
                ? Math.min(variableAxis.max, Math.max(variableAxis.min, this.selectedLibraryWeights.get(selectedFont.id) ?? variableAxis.default))
                : selectedFont.fontWeight ?? 400;
            const selector = variableAxis
                ? `<div class="bfm-stack__weight bfm-stack__weight--variable bfm-font__variable-weight"><input type="range" min="${variableAxis.min}" max="${variableAxis.max}" step="1" value="${previewWeight}" data-library-variable-weight="${escapeHtml(selectedFont.id)}" aria-label="${escapeHtml(variableAxis.name)}"><input class="b3-text-field" type="number" min="${variableAxis.min}" max="${variableAxis.max}" step="1" value="${previewWeight}" data-library-variable-weight-number="${escapeHtml(selectedFont.id)}" aria-label="${escapeHtml(variableAxis.name)}"></div>`
                : `<select class="b3-select bfm-font__variant-picker" data-library-variant="${escapeHtml(group.key)}" aria-label="${escapeHtml(this.i18n.fontWeightsCount.replace("${count}", String(group.fonts.length)))}" ${group.fonts.length === 1 ? "disabled" : ""}>${group.fonts.map((font) => {
                    const optionLabel = `${font.fontStyle || fontWeightName(font.fontWeight || 400)} · ${font.fontWeight || 400}`;
                    return `<option value="${escapeHtml(font.id)}" ${font.id === selectedFont.id ? "selected" : ""}>${escapeHtml(optionLabel)}</option>`;
                }).join("")}</select>`;
            return `<article class="bfm-font ${status.loaded ? "" : "bfm-font--error"}" draggable="false" data-library-group="${selectedFont.id}">
  <span class="bfm-drag bfm-font__handle" draggable="true" title="${this.i18n.dragToSort}">⠿</span>
  <div class="bfm-font__name" data-preview-font-id="${escapeHtml(selectedFont.id)}" data-preview-weight="${previewWeight}"><strong>${escapeHtml(group.familyName)}</strong>${selector}</div>
  <div class="bfm-font__column-resizer" data-library-column-resizer draggable="false" role="separator" aria-orientation="vertical" aria-label="${escapeHtml(this.i18n.resizeFontColumns)}" title="${escapeHtml(this.i18n.resizeFontColumns)}"></div>
  <div class="bfm-font__info">
    <div class="bfm-font__header">
      <div class="bfm-font__selected"><strong data-preview-font-id="${escapeHtml(selectedFont.id)}" data-preview-weight="${previewWeight}">${escapeHtml(selectedFont.displayName)}</strong><span title="${escapeHtml(metadata)}">${escapeHtml(metadata)}</span></div>
      <div class="bfm-font__actions"><button class="b3-button b3-button--outline" data-rename="${selectedFont.id}">${this.i18n.rename}</button><button class="b3-button b3-button--cancel" data-delete="${selectedFont.id}">${this.i18n.delete}</button></div>
    </div>
    ${coverageTags ? `<div class="bfm-font__tags">${coverageTags}</div>` : ""}
  </div>
</article>`;
        }).join("");
    }

    private applyFontPreviews(root: HTMLElement): void {
        root.querySelectorAll<HTMLElement>("[data-preview-font-id], [data-preview-family]").forEach((element) => this.applyFontPreview(element));
    }

    private applyFontPreview(element: HTMLElement): void {
        if (element.dataset.previewFontId) {
            element.style.fontFamily = `"${runtimeFamily(element.dataset.previewFontId)}", var(--b3-font-family)`;
            if (element.dataset.previewWeight) element.style.fontWeight = element.dataset.previewWeight;
        } else if (element.dataset.previewFamily) {
            element.style.fontFamily = element.dataset.previewFamily!;
            element.style.fontWeight = element.dataset.previewWeight || "400";
        }
    }

    private settingsFor(target: FontTarget, secondary: boolean): {fonts: FontChoice[]; size: number | null} {
        const targetSettings = this.state.targets[target];
        if (!secondary) return targetSettings;
        targetSettings.secondary ||= {fonts: [], size: null};
        return targetSettings.secondary;
    }

    private async toggleFont(target: FontTarget, secondary: boolean, value: string): Promise<void> {
        let choice: FontChoice | undefined;
        if (value === "default") choice = {kind: "default"};
        if (value.startsWith("imported:")) {
            const id = value.slice(9);
            const font = this.state.fonts.find((item) => item.id === id);
            if (font) choice = {kind: "imported", id, weight: font.variationAxes?.wght?.default ?? font.fontWeight};
        }
        if (value.startsWith("system:")) {
            const font = this.systemFonts[Number(value.slice(7))];
            if (font) choice = {kind: "system", family: font.family, displayName: font.displayName, weight: font.weight};
        }
        if (!choice) return;
        const settings = this.settingsFor(target, secondary);
        const key = this.fontChoiceKey(choice);
        const selectedIndex = settings.fonts.findIndex((item) => this.fontChoiceKey(item) === key);
        if (selectedIndex >= 0) settings.fonts.splice(selectedIndex, 1);
        else settings.fonts.push(choice);
        this.applySettings();
        this.renderManager();
        await this.persist();
    }

    private setAssignedVariableWeight(target: FontTarget, secondary: boolean, index: number, rawWeight: number): void {
        const choice = this.settingsFor(target, secondary).fonts[index];
        if (choice?.kind !== "imported") return;
        const font = this.state.fonts.find((item) => item.id === choice.id);
        const axis = font?.variationAxes?.wght;
        if (!axis || !Number.isFinite(rawWeight)) return;
        choice.weight = Math.round(Math.min(axis.max, Math.max(axis.min, rawWeight)));
        this.applySettings();
    }

    private async setAssignedImportedVariant(target: FontTarget, secondary: boolean, index: number, fontId: string): Promise<void> {
        const choice = this.settingsFor(target, secondary).fonts[index];
        const font = this.state.fonts.find((item) => item.id === fontId);
        if (choice?.kind !== "imported" || !font) return;
        choice.id = font.id;
        choice.weight = font.variationAxes?.wght?.default ?? font.fontWeight;
        this.applySettings();
        await this.persist();
        this.renderManager();
    }

    private async setAssignedSystemWeight(target: FontTarget, secondary: boolean, index: number, weight: number): Promise<void> {
        const choice = this.settingsFor(target, secondary).fonts[index];
        if (choice?.kind !== "system") return;
        const font = this.systemFonts.find((item) => item.family === choice.family && item.weight === weight);
        if (!font) return;
        choice.displayName = font.displayName;
        choice.weight = font.weight;
        this.applySettings();
        await this.persist();
        this.renderManager();
    }

    private async removeAssignedFont(target: FontTarget, secondary: boolean, index: number): Promise<void> {
        this.settingsFor(target, secondary).fonts.splice(index, 1);
        this.applySettings();
        await this.persist();
        this.renderManager();
    }

    private async commitSize(target: FontTarget, secondary: boolean, size: number): Promise<void> {
        this.settingsFor(target, secondary).size = size;
        this.applySettings();
        await this.persist();
        this.renderManager();
    }

    private async resetFont(target: FontTarget, secondary: boolean): Promise<void> {
        this.settingsFor(target, secondary).fonts = [];
        this.applySettings();
        await this.persist();
        this.renderManager();
    }

    private async resetSize(target: FontTarget, secondary: boolean): Promise<void> {
        this.settingsFor(target, secondary).size = null;
        this.applySettings();
        await this.persist();
        this.renderManager();
    }

    private async setDecoupled(target: FontTarget, value: boolean): Promise<void> {
        this.state.targets[target].decoupled = value;
        this.activeSecondaryTab[target] = false;
        this.applySettings();
        await this.persist();
        this.renderManager();
    }

    private bindAssignmentDragging(root: HTMLElement): void {
        let source: {target: FontTarget; secondary: boolean; index: number} | undefined;
        root.querySelectorAll<HTMLElement>("[data-stack-item]").forEach((item) => {
            item.draggable = false;
            const handle = item.querySelector<HTMLElement>(".bfm-drag");
            if (!handle) return;
            handle.draggable = true;
            handle.addEventListener("dragstart", (event) => {
                source = {target: item.dataset.target as FontTarget, secondary: item.dataset.secondary === "true", index: Number(item.dataset.index)};
                item.classList.add("bfm-dragging");
                event.dataTransfer?.setData("text/plain", "font-stack");
            });
            handle.addEventListener("dragend", () => {
                item.classList.remove("bfm-dragging");
                source = undefined;
            });
            item.addEventListener("dragover", (event) => event.preventDefault());
            item.addEventListener("drop", (event) => {
                event.preventDefault();
                const destination = {target: item.dataset.target as FontTarget, secondary: item.dataset.secondary === "true", index: Number(item.dataset.index)};
                if (!source || source.target !== destination.target || source.secondary !== destination.secondary || source.index === destination.index) return;
                const fonts = this.settingsFor(source.target, source.secondary).fonts;
                const [moved] = fonts.splice(source.index, 1);
                fonts.splice(destination.index, 0, moved);
                this.applySettings();
                void this.persist();
                this.renderManager();
            });
        });
    }

    private bindLibraryDragging(root: HTMLElement): void {
        let sourceId = "";
        root.querySelectorAll<HTMLElement>("[data-library-group]").forEach((item) => {
            item.draggable = false;
            const handle = item.querySelector<HTMLElement>(".bfm-font__handle");
            if (!handle) return;
            handle.draggable = true;
            handle.addEventListener("dragstart", (event) => {
                sourceId = item.dataset.libraryGroup || "";
                item.classList.add("bfm-dragging");
                event.dataTransfer?.setData("text/plain", sourceId);
            });
            handle.addEventListener("dragend", () => {
                item.classList.remove("bfm-dragging");
                sourceId = "";
            });
            item.addEventListener("dragover", (event) => event.preventDefault());
            item.addEventListener("drop", (event) => {
                event.preventDefault();
                const destinationId = item.dataset.libraryGroup || "";
                const groups = groupImportedFonts(this.state.fonts);
                const from = groups.findIndex((group) => group.fonts.some((font) => font.id === sourceId));
                const to = groups.findIndex((group) => group.fonts.some((font) => font.id === destinationId));
                if (from < 0 || to < 0 || from === to) return;
                const [moved] = groups.splice(from, 1);
                groups.splice(to, 0, moved);
                this.state.fonts = groups.flatMap((group) => group.fonts);
                void this.persist();
                this.renderManager();
            });
        });
    }

    private bindLibraryColumnResizing(root: HTMLElement): void {
        const library = root.querySelector<HTMLElement>(".bfm-library");
        if (!library) return;
        root.querySelectorAll<HTMLElement>("[data-library-column-resizer]").forEach((resizer) => {
            resizer.addEventListener("pointerdown", (event) => {
                if (event.button !== 0) return;
                event.preventDefault();
                event.stopPropagation();
                const startX = event.clientX;
                const startWidth = this.state.layout.libraryPreviewWidth;
                const maximum = Math.min(420, Math.max(140, library.clientWidth - 390));
                const previousCursor = document.body.style.cursor;
                const previousUserSelect = document.body.style.userSelect;
                document.body.style.cursor = "col-resize";
                document.body.style.userSelect = "none";
                root.classList.add("bfm-resizing-columns");
                resizer.setPointerCapture(event.pointerId);

                const move = (moveEvent: PointerEvent) => {
                    const width = Math.min(maximum, Math.max(140, startWidth + moveEvent.clientX - startX));
                    this.state.layout.libraryPreviewWidth = clampLibraryPreviewWidth(width);
                    root.style.setProperty("--bfm-library-preview-width", `${this.state.layout.libraryPreviewWidth}px`);
                };
                const finish = () => {
                    resizer.removeEventListener("pointermove", move);
                    resizer.removeEventListener("pointerup", finish);
                    resizer.removeEventListener("pointercancel", finish);
                    root.classList.remove("bfm-resizing-columns");
                    document.body.style.cursor = previousCursor;
                    document.body.style.userSelect = previousUserSelect;
                    void this.persist();
                };
                resizer.addEventListener("pointermove", move);
                resizer.addEventListener("pointerup", finish);
                resizer.addEventListener("pointercancel", finish);
            });
        });
    }

    private async openFontFolder(): Promise<void> {
        try {
            await ensureFontDirectory(this.app.appId);
            const workspace = window.siyuan.config?.system?.workspaceDir;
            if (!workspace) throw new Error("Workspace path unavailable");
            const filePath = `${workspace.replace(/[\\/]$/, "")}${FONT_STORAGE_ROOT}`;
            const ipcRenderer = window.require?.("electron")?.ipcRenderer;
            if (!ipcRenderer) throw new Error(filePath);
            ipcRenderer.send("siyuan-cmd", {cmd: "openPath", filePath});
        } catch (error) {
            showMessage(`${this.i18n.folderOpenFailed}: ${error instanceof Error ? error.message : error}`, 7000, "error");
        }
    }

    private async importFiles(files: File[]): Promise<void> {
        let imported = 0;
        let duplicates = 0;
        const failures: string[] = [];
        for (const file of files) {
            try {
                const extension = extensionOf(file.name);
                if (!SUPPORTED_EXTENSIONS.has(extension)) throw new Error(this.i18n.invalidFont);
                if (file.size > MAX_FONT_BYTES) throw new Error(this.i18n.unsupportedSize);
                const buffer = await file.arrayBuffer();
                const hash = await sha256(buffer);
                if (hasDuplicateHash(this.state.fonts, hash)) {
                    duplicates++;
                    continue;
                }
                const fallbackName = nameWithoutExtension(file.name);
                const metadata = extractFontMetadata(buffer, fallbackName);
                const id = createId();
                const font: ImportedFont = {
                    id,
                    displayName: fallbackName,
                    originalName: file.name,
                    storageName: storedFontFileName({id, originalName: file.name, extension}),
                    extension,
                    size: file.size,
                    sha256: hash,
                    importedAt: new Date().toISOString(),
                    ...metadata,
                };
                const testFace = new FontFace(`BFM_VALIDATE_${font.id}`, buffer.slice(0));
                await testFace.load();
                await writeFontFile(font, file, this.app.appId);
                try {
                    await this.registerFont(font, buffer);
                    this.statuses.set(font.id, {loaded: true});
                    this.state.fonts.push(font);
                    await this.persist();
                    imported++;
                } catch (error) {
                    this.state.fonts = this.state.fonts.filter((item) => item.id !== font.id);
                    const registered = this.faces.get(font.id);
                    if (registered) document.fonts.delete(registered);
                    const registeredEmoji = this.emojiFaces.get(font.id);
                    if (registeredEmoji) document.fonts.delete(registeredEmoji);
                    this.faces.delete(font.id);
                    this.emojiFaces.delete(font.id);
                    this.statuses.delete(font.id);
                    await deleteFontFile(font, this.app.appId).catch(() => undefined);
                    throw error;
                }
            } catch (error) {
                failures.push(`${file.name}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        this.applySettings();
        this.renderManager();
        const summary = [imported ? `${this.i18n.importSuccess}: ${imported}` : "", duplicates ? `${this.i18n.duplicateSkipped}: ${duplicates}` : "", ...failures].filter(Boolean).join("<br>");
        if (summary) showMessage(summary, failures.length ? 7000 : 4000, failures.length ? "error" : "info");
    }

    private openRenameDialog(id: string): void {
        const font = this.state.fonts.find((item) => item.id === id);
        if (!font) return;
        this.renameDialog?.destroy();
        this.renameDialog = new Dialog({
            title: this.i18n.rename,
            width: "480px",
            content: `<form class="bfm-rename"><div class="b3-dialog__content"><label>${this.i18n.renamePrompt}</label><input class="b3-text-field fn__block" maxlength="100" value="${escapeHtml(font.displayName)}"></div><div class="b3-dialog__action"><button class="b3-button b3-button--cancel" type="button">${this.i18n.cancel}</button><div class="fn__space"></div><button class="b3-button b3-button--text" type="submit">${this.i18n.save}</button></div></form>`,
            destroyCallback: () => { this.renameDialog = undefined; },
        });
        const form = this.renameDialog.element.querySelector<HTMLFormElement>(".bfm-rename");
        const input = form?.querySelector<HTMLInputElement>("input");
        form?.querySelector<HTMLButtonElement>("button[type='button']")?.addEventListener("click", () => this.renameDialog?.destroy());
        form?.addEventListener("submit", (event) => {
            event.preventDefault();
            if (input) void this.renameFont(id, input.value);
        });
        requestAnimationFrame(() => {
            input?.focus();
            input?.select();
        });
    }

    private async renameFont(id: string, rawValue: string): Promise<void> {
        const font = this.state.fonts.find((item) => item.id === id);
        if (!font) return;
        const value = rawValue.trim();
        if (!value) return;
        if (value === font.displayName) {
            this.renameDialog?.destroy();
            return;
        }
        font.displayName = value.slice(0, 100);
        await this.persist();
        this.renameDialog?.destroy();
        this.renderManager();
    }

    private confirmDelete(id: string): void {
        const font = this.state.fonts.find((item) => item.id === id);
        if (!font) return;
        confirm(this.i18n.delete, this.i18n.confirmDelete.replace("${name}", font.displayName), () => void this.deleteFont(font));
    }

    private async deleteFont(font: ImportedFont): Promise<void> {
        const previous = this.state;
        this.state = removeFontFromState(this.state, font.id);
        try {
            await this.persist();
            await deleteFontFile(font, this.app.appId).catch((error) => console.warn(`[${this.name}] orphaned font file`, error));
            const face = this.faces.get(font.id);
            if (face) document.fonts.delete(face);
            const emojiFace = this.emojiFaces.get(font.id);
            if (emojiFace) document.fonts.delete(emojiFace);
            this.faces.delete(font.id);
            this.emojiFaces.delete(font.id);
            this.statuses.delete(font.id);
            this.applySettings();
            this.renderManager();
        } catch (error) {
            this.state = previous;
            this.applySettings();
            showMessage(`${this.i18n.deleteFailed}: ${error instanceof Error ? error.message : error}`, 5000, "error");
        }
    }

    private persist(): Promise<void> {
        syncActivePreset(this.state);
        const operation = this.saveChain.catch(() => undefined).then(async () => {
            await this.saveData(STATE_FILE, this.state);
        });
        this.saveChain = operation.catch((error) => {
            if (this.disposed || isSiyuanErrorCode(error, 410)) return;
            showMessage(`${this.i18n.saveFailed}: ${errorMessage(error)}`, 5000, "error");
        });
        return operation;
    }
}

function escapeHtml(value: string): string {
    return value.replace(/[&<>"]/g, (character) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"})[character]!);
}

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

function safeFileName(value: string): string {
    return value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/[. ]+$/g, "").trim().slice(0, 100) || "preset";
}

function downloadFile(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
