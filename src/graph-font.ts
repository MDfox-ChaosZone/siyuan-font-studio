interface PatchedContextState {
    weight: number | null;
    descriptor: PropertyDescriptor;
}

const patchedContexts = new WeakMap<CanvasRenderingContext2D, PatchedContextState>();

export function applyGraphCanvasFontWeight(canvas: HTMLCanvasElement, weight: number | null): void {
    const context = canvas.getContext("2d");
    if (!context) return;
    const existing = patchedContexts.get(context);
    if (existing) {
        if (weight === null) {
            Reflect.deleteProperty(context, "font");
            patchedContexts.delete(context);
            return;
        }
        existing.weight = weight;
        return;
    }
    if (weight === null) return;

    const descriptor = findPropertyDescriptor(context, "font");
    if (!descriptor?.get || !descriptor.set) return;
    const state: PatchedContextState = {weight, descriptor};
    patchedContexts.set(context, state);
    Object.defineProperty(context, "font", {
        configurable: true,
        get() {
            return state.descriptor.get!.call(this);
        },
        set(value: string) {
            const weighted = state.weight === null ? value : injectCanvasFontWeight(value, state.weight);
            state.descriptor.set!.call(this, weighted);
        },
    });
}

function findPropertyDescriptor(value: object, property: PropertyKey): PropertyDescriptor | undefined {
    let current: object | null = value;
    while (current) {
        const descriptor = Object.getOwnPropertyDescriptor(current, property);
        if (descriptor) return descriptor;
        current = Object.getPrototypeOf(current) as object | null;
    }
    return undefined;
}

function injectCanvasFontWeight(font: string, weight: number): string {
    return /^\s*\d+(?:\.\d+)?px(?:\/\S+)?\s/.test(font) ? `${weight} ${font.trimStart()}` : font;
}
