const HEADING_SELECTOR = '[data-type="NodeHeading"][data-node-id]';
const OFFSET_PROPERTY = "--b3-protyle-heading-number-offset";

// Keep SiYuan's spacing/parenthesis adjustments; only replace its cached width.
export function measuredHeadingOffset(offset: string, width: number): string {
    return width > 0 ? offset.replace(/[\d.]+(?:px|ch)/, `${width}px`) : offset;
}

export class HeadingLayout {
    private observer: MutationObserver;
    private scheduled = false;
    private disposed = false;

    constructor() {
        this.observer = new MutationObserver(records => {
            if (records.some(record => {
                const target = record.target instanceof Element ? record.target : record.target.parentElement;
                if (target?.closest("style[data-heading-number-style]")) return true;
                return Array.from(record.addedNodes).some(node => node instanceof Element &&
                    (node.matches(`style[data-heading-number-style], ${HEADING_SELECTOR}`) ||
                        node.querySelector(`style[data-heading-number-style], ${HEADING_SELECTOR}`)));
            })) this.schedule();
        });
        this.observer.observe(document.body, {childList: true, subtree: true, characterData: true});
        document.fonts.addEventListener("loadingdone", this.onFontsLoaded);
    }

    private onFontsLoaded = () => this.schedule();

    schedule(): void {
        if (this.disposed || this.scheduled) return;
        this.scheduled = true;
        // Coalesce this turn's changes and measure before the next paint.
        // Font loading triggers another measurement through loadingdone.
        queueMicrotask(() => {
            this.scheduled = false;
            if (!this.disposed) this.refresh();
        });
    }

    refresh(): void {
        const pending: {rule: CSSStyleRule; measure: HTMLElement; offset: string}[] = [];
        document.querySelectorAll<HTMLStyleElement>("style[data-heading-number-style]").forEach(style => {
            const scope = style.getAttribute("data-heading-number-style");
            const root = document.querySelector(`.protyle-wysiwyg[data-heading-number-scope="${CSS.escape(scope || "")}"]`);
            if (!root || !style.sheet) return;
            for (const rule of Array.from(style.sheet.cssRules)) {
                if (!(rule instanceof CSSStyleRule)) continue;
                const offset = rule.style.getPropertyValue(OFFSET_PROPERTY);
                const number = rule.style.getPropertyValue("--b3-protyle-heading-number");
                if (!offset || !number || number === '""') continue;
                const heading = root.querySelector<HTMLElement>(rule.selectorText);
                if (!heading) continue;
                const measure = document.createElement("span");
                measure.className = "protyle-heading-number__measure";
                measure.setAttribute("aria-hidden", "true");
                // The pseudo-element resolves CSS string escaping for every numbering format.
                const content = getComputedStyle(heading.firstElementChild!, "::before").content;
                try { measure.textContent = JSON.parse(content); } catch { continue; }
                heading.appendChild(measure);
                pending.push({rule, measure, offset});
            }
        });
        pending.forEach(({rule, measure, offset}) => {
            rule.style.setProperty(OFFSET_PROPERTY, measuredHeadingOffset(offset, measure.getBoundingClientRect().width));
        });
        pending.forEach(({measure}) => measure.remove());
    }

    destroy(): void {
        this.disposed = true;
        this.observer.disconnect();
        document.fonts.removeEventListener("loadingdone", this.onFontsLoaded);
        this.refresh();
    }
}
