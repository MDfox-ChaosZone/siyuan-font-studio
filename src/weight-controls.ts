import {FontTarget} from "./types";

// Emoji glyphs and keyboard keys only take a family from SiYuan's variables.
export function supportsAssignedWeight(target: FontTarget): boolean {
    return target !== "emoji" && target !== "kbd";
}
