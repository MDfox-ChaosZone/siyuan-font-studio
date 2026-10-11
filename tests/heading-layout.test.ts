import {afterEach, describe, expect, it, vi} from "vitest";
import {HeadingLayout, measuredHeadingOffset} from "../src/heading-layout";

afterEach(() => vi.unstubAllGlobals());

describe("heading number measurements", () => {
    it("replaces the stale width while preserving native spacing", () => {
        expect(measuredHeadingOffset("calc(49.109375px + .5em)", 98.21875)).toBe("calc(98.21875px + .5em)");
        expect(measuredHeadingOffset("calc(49.109375px + .5em)", 12.5)).toBe("calc(12.5px + .5em)");
    });

    it("preserves Chinese punctuation and leading parenthesis adjustments", () => {
        expect(measuredHeadingOffset("24px", 36)).toBe("36px");
        expect(measuredHeadingOffset("calc(24px - .5em)", 36)).toBe("calc(36px - .5em)");
        expect(measuredHeadingOffset("calc(24px + .5em - .5em)", 36)).toBe("calc(36px + .5em - .5em)");
    });

    it("handles native unmeasured fallbacks and keeps hidden headings unchanged", () => {
        expect(measuredHeadingOffset("calc(5ch + .5em)", 42)).toBe("calc(42px + .5em)");
        expect(measuredHeadingOffset("calc(24px + .5em)", 0)).toBe("calc(24px + .5em)");
    });

    it("coalesces changes before the next paint without waiting for fonts", async () => {
        vi.stubGlobal("MutationObserver", class { observe() {} disconnect() {} });
        vi.stubGlobal("document", {
            body: {},
            fonts: {ready: new Promise(() => {}), addEventListener: vi.fn(), removeEventListener: vi.fn()},
        });
        const layout = new HeadingLayout();
        const refresh = vi.spyOn(layout, "refresh").mockImplementation(() => {});
        layout.schedule();
        layout.schedule();
        expect(refresh).not.toHaveBeenCalled();
        await Promise.resolve();
        expect(refresh).toHaveBeenCalledTimes(1);
        layout.schedule();
        layout.destroy();
        await Promise.resolve();
        // Destroy measures the restored styles; the queued refresh must be cancelled.
        expect(refresh).toHaveBeenCalledTimes(2);
    });
});
