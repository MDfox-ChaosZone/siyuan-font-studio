import {describe, expect, it} from "vitest";
import {errorMessage, isSiyuanErrorCode} from "../src/error-message";

describe("structured SiYuan errors", () => {
    it("shows the API message instead of [object Object]", () => {
        expect(errorMessage({code: 410, msg: "Plugin lifecycle has ended", data: null}))
            .toBe("Plugin lifecycle has ended");
        expect(errorMessage({code: 403, msg: "Readonly mode or publish mode", data: null}))
            .toBe("Readonly mode or publish mode");
        expect(isSiyuanErrorCode({code: 410, msg: "Plugin lifecycle has ended"}, 410)).toBe(true);
        expect(errorMessage({reason: "unknown"})).toBe('{"reason":"unknown"}');
    });
});
