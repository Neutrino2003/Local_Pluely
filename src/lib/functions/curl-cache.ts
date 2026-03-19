import curl2Json from "@bany/curl-to-json";

export interface ParsedCurl {
    url: string;
    method: string;
    headers: Record<string, string>;
    data: any;
    form: any;
    params: any;
    /** Whether the original curl used -F / --form (multipart upload) */
    isFormUpload: boolean;
    /** Whether the original curl used --data-binary (raw binary body) */
    isBinaryUpload: boolean;
}

/** In-memory cache: providerId → ParsedCurl */
const cache = new Map<string, ParsedCurl>();

function tryParseJsonPayload(value: string): any | null {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const candidates: string[] = [trimmed];

    if (
        (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
        (trimmed.startsWith('"') && trimmed.endsWith('"'))
    ) {
        candidates.push(trimmed.slice(1, -1));
    }

    // Some Windows curl forms produce escaped JSON like {\"model\":\"...\"}
    candidates.push(trimmed.replace(/\\"/g, '"'));

    for (const candidate of candidates) {
        try {
            const parsed = JSON.parse(candidate);
            if (typeof parsed === "string") {
                try {
                    return JSON.parse(parsed);
                } catch {
                    return parsed;
                }
            }
            return parsed;
        } catch {
            // Try next candidate
        }
    }

    return null;
}

function normalizeCurlData(data: any): any {
    if (typeof data === "string") {
        return tryParseJsonPayload(data) ?? data;
    }

    // @bany/curl-to-json may parse escaped JSON into an object like:
    // { '{\\"model\\":...}': undefined }
    if (data && typeof data === "object" && !Array.isArray(data)) {
        const entries = Object.entries(data);
        if (entries.length === 1) {
            const [maybeJson, value] = entries[0];
            if (value === undefined || value === null) {
                const recovered = tryParseJsonPayload(maybeJson);
                if (recovered !== null) {
                    return recovered;
                }
            }
        }
    }

    return data;
}

/**
 * Parse a cURL template string into a structured object.
 * Results are cached by providerId so the expensive parse only runs once
 * per provider, not on every request.
 *
 * Throws a clear, actionable error if the curl string is malformed.
 */
export function getParsedCurl(providerId: string, curl: string): ParsedCurl {
    if (cache.has(providerId)) {
        return cache.get(providerId)!;
    }

    let raw: any;
    try {
        raw = curl2Json(curl);
    } catch (err) {
        const hint =
            "Check for unescaped quotes, Windows-style line continuations (^), or missing variables.";
        throw new Error(
            `Provider "${providerId}" has an invalid cURL template. ${hint}\n` +
            `Original error: ${err instanceof Error ? err.message : String(err)}`
        );
    }

    const parsed: ParsedCurl = {
        url: raw.url ?? "",
        method: (raw.method ?? "POST").toUpperCase(),
        headers: raw.header ?? {},
        data: normalizeCurlData(raw.data ?? null),
        form: raw.form ?? null,
        params: raw.params ?? {},
        isFormUpload: curl.includes("-F ") || curl.includes("--form"),
        isBinaryUpload: curl.includes("--data-binary"),
    };

    cache.set(providerId, parsed);
    return parsed;
}

/**
 * Invalidate a cached provider (call this when the user edits a custom provider).
 */
export function invalidateParsedCurl(providerId: string): void {
    cache.delete(providerId);
}

/**
 * Clear the entire cache (useful for testing or full reload).
 */
export function clearParsedCurlCache(): void {
    cache.clear();
}
