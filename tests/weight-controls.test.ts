import {describe, expect, it} from "vitest";
import {supportsAssignedWeight} from "../src/weight-controls";

describe("assigned font weight controls", () => {
    it.each(["ui", "content", "mono", "math", "graph", "mermaid"] as const)(
        "allows weight selection for the %s target",
        (target) => {
            expect(supportsAssignedWeight(target)).toBe(true);
        },
    );

    it.each(["emoji", "kbd"] as const)("does not offer a weight control for %s fonts", (target) => {
        expect(supportsAssignedWeight(target)).toBe(false);
    });
});
