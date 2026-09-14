import {FontTarget} from "./types";

export function supportsAssignedWeight(target: FontTarget): boolean {
    return target !== "emoji";
}
