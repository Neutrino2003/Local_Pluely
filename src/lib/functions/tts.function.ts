import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { TYPE_PROVIDER } from "@/types";
import { getParsedCurl } from "./curl-cache";
import { deepVariableReplacer } from "./common.function";

export interface TTSParams {
    provider: TYPE_PROVIDER | undefined;
    selectedProvider: {
        provider: string;
        variables: Record<string, string>;
    };
    text: string;
}

/**
 * Converts text to speech audio using the configured TTS provider.
 * Returns a Blob of the audio (audio/mpeg or audio/wav depending on provider).
 */
export async function fetchTTS(params: TTSParams): Promise<Blob> {
    const { provider, selectedProvider, text } = params;

    if (!provider) throw new Error("TTS provider not provided");
    if (!selectedProvider) throw new Error("Selected TTS provider not provided");
    if (!text?.trim()) throw new Error("Text is required for TTS");

    // Parse once and cache — avoids per-request parse failures
    const curlJson = getParsedCurl(provider.id ?? provider.curl.slice(0, 40), provider.curl);

    // Build variable map — replace {{TEXT}} with the actual text
    const allVariables: Record<string, string> = {
        ...Object.fromEntries(
            Object.entries(selectedProvider.variables).map(([key, value]) => [
                key.toUpperCase(),
                value,
            ])
        ),
        TEXT: text,
    };

    let url = deepVariableReplacer(curlJson.url || "", allVariables);
    const headers = deepVariableReplacer(curlJson.headers || {}, allVariables);
    headers["Content-Type"] = "application/json";

    // Build body — replace all template vars
    let bodyObj: any = curlJson.data
        ? JSON.parse(JSON.stringify(curlJson.data))
        : {};
    bodyObj = deepVariableReplacer(bodyObj, allVariables);

    const fetchFunction = url?.includes("http") ? fetch : tauriFetch;

    let response: Response;
    try {
        response = await fetchFunction(url, {
            method: curlJson.method || "POST",
            headers,
            body: JSON.stringify(bodyObj),
        });
    } catch (e) {
        throw new Error(`TTS network error: ${e instanceof Error ? e.message : e}`);
    }

    if (!response.ok) {
        let errText = "";
        try {
            errText = await response.text();
        } catch { }
        throw new Error(
            `TTS API error ${response.status} ${response.statusText}${errText ? `: ${errText}` : ""
            }`
        );
    }

    const audioBlob = await response.blob();
    if (!audioBlob || audioBlob.size === 0) {
        throw new Error("TTS returned an empty audio response");
    }

    return audioBlob;
}
