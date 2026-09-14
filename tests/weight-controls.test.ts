import {describe, expect, it} from "vitest";
import {supportsAssignedWeight} from "../src/weight-controls";

describe("assigned font weight controls", () => {
    it.each(["ui", "content", "mono", "math", "graph", "mermaid"] as const)(
        "allows weight selection for the %s target",
        (target) => {
            expect(supportsAssignedWeight(target)).toBe(true);
        },
    );

    it("does not offer a weight control for emoji fonts", () => {
        expect(supportsAssignedWeight("emoji")).toBe(false);
    });
});
