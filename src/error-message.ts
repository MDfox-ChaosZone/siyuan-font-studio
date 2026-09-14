interface StructuredError {
    code?: unknown;
    msg?: unknown;
}

export function errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (isStructuredError(error) && typeof error.msg === "string" && error.msg) return error.msg;
    if (typeof error === "string") return error;
    try {
        const serialized = JSON.stringify(error);
        if (serialized && serialized !== "{}") return serialized;
    } catch {
        // Fall through to the safe generic conversion.
    }
    return String(error);
}

export function isSiyuanErrorCode(error: unknown, code: number): boolean {
    return isStructuredError(error) && error.code === code;
}

function isStructuredError(error: unknown): error is StructuredError {
    return typeof error === "object" && error !== null;
}
