import {
  deepVariableReplacer,
  getByPath,
} from "./common.function";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { invoke } from "@tauri-apps/api/core";

import { TYPE_PROVIDER } from "@/types";
import { getParsedCurl } from "./curl-cache";
import { shouldUsePluelyAPI } from "./pluely.api";

/**
 * Safely reads a Blob as an ArrayBuffer without triggering Tauri's
 * "cannot access data blob" CSP error. Tauri's webview blocks
 * FileReader and blob.arrayBuffer() on opaque blobs built from raw bytes.
 * Using new Response(blob).arrayBuffer() bypasses this restriction.
 */
async function safeBlobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  try {
    // Preferred: works in all environments including Tauri webview
    return await new Response(blob).arrayBuffer();
  } catch {
    // Fallback
    return blob.arrayBuffer();
  }
}

/**
 * Converts a Blob to a base64 string without triggering Tauri's
 * "cannot access data blob" CSP error.
 */
async function safeBlobToBase64(blob: Blob): Promise<string> {
  const buffer = await safeBlobToArrayBuffer(blob);
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Pluely STT function
async function fetchPluelySTT(audio: File | Blob): Promise<string> {
  try {
    // Use safeBlobToBase64 to avoid Tauri's "cannot access data blob" error
    const audioBase64 = await safeBlobToBase64(audio);

    // Call Tauri command
    const response = await invoke<{
      success: boolean;
      transcription?: string;
      error?: string;
    }>("transcribe_audio", {
      audioBase64,
    });

    if (response.success && response.transcription) {
      return response.transcription;
    } else {
      return response.error || "Transcription failed";
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return `Pluely STT Error: ${errorMessage}`;
  }
}

export interface STTParams {
  provider: TYPE_PROVIDER | undefined;
  selectedProvider: {
    provider: string;
    variables: Record<string, string>;
  };
  audio: File | Blob;
}

/**
 * Transcribes audio and returns either the transcription or an error/warning message as a single string.
 */
export async function fetchSTT(params: STTParams): Promise<string> {
  let warnings: string[] = [];

  try {
    const { provider, selectedProvider, audio } = params;

    // ── Local on-device Whisper (no HTTP, no cloud) ───────────────────────
    // When the user selects "local-whisper", route directly to the Rust
    // `transcribe_local_whisper` Tauri command which loads the downloaded
    // GGML model file and runs inference in-process.
    if (selectedProvider?.provider === "local-whisper") {
      const modelId = selectedProvider?.variables?.["model"] || "base";
      const audioBase64 = await safeBlobToBase64(audio);
      const response = await invoke<{
        success: boolean;
        transcription?: string;
        error?: string;
      }>("transcribe_local_whisper", { audioBase64, modelId });

      if (response.success && response.transcription !== undefined) {
        return response.transcription;
      }
      throw new Error(
        response.error ||
        "Local Whisper transcription failed. Make sure the model is downloaded."
      );
    }

    // Check if we should use Pluely API instead
    const usePluelyAPI = await shouldUsePluelyAPI();
    if (usePluelyAPI) {
      return await fetchPluelySTT(audio);
    }

    if (!provider) throw new Error("Provider not provided");
    if (!selectedProvider) throw new Error("Selected provider not provided");
    if (!audio) throw new Error("Audio file is required");

    // Parse once and cache — avoids per-request parse failures
    const curlJson = getParsedCurl(provider.id ?? provider.curl.slice(0, 40), provider.curl);

    // Validate audio file
    const file = audio as File;
    if (file.size === 0) throw new Error("Audio file is empty");
    // maximum size of 10MB
    // const maxSize = 10 * 1024 * 1024;
    // if (file.size > maxSize) {
    //   warnings.push("Audio exceeds 10MB limit");
    // }

    // Build variable map
    const allVariables = {
      ...Object.fromEntries(
        Object.entries(selectedProvider.variables).map(([key, value]) => [
          key.toUpperCase(),
          value,
        ])
      ),
    };

    // Prepare request
    let url = deepVariableReplacer(curlJson.url || "", allVariables);
    const headers = deepVariableReplacer(curlJson.headers || {}, allVariables);
    const formData = deepVariableReplacer(curlJson.form || {}, allVariables);

    // Use pre-parsed flags from the cache
    const isBinaryUpload = curlJson.isBinaryUpload;
    const fetchUrlParams = curlJson.params || {};
    const decodedParams = Object.fromEntries(
      Object.entries(fetchUrlParams).map(([key, value]) => [
        key,
        typeof value === "string" ? decodeURIComponent(value) : "",
      ])
    );
    // Get the Parameters from allVariables
    const replacedParams = deepVariableReplacer(decodedParams, allVariables);

    // Add query parameters to URL
    const queryString = new URLSearchParams(replacedParams).toString();
    if (queryString) {
      url += (url.includes("?") ? "&" : "?") + queryString;
    }

    let finalHeaders = { ...headers };
    let body: FormData | string | Blob;

    const isForm = curlJson.isFormUpload;
    if (isForm) {
      const form = new FormData();
      // Use safeBlobToArrayBuffer to avoid Tauri's "cannot access data blob" error
      const freshBlob = new Blob([await safeBlobToArrayBuffer(audio)], {
        type: audio.type,
      });
      form.append("file", freshBlob, "audio.wav");
      const headerKeys = Object.keys(headers).map((k) =>
        k.toUpperCase().replace(/[-_]/g, "")
      );

      for (const [key, val] of Object.entries(formData)) {
        if (typeof val !== "string") {
          if (
            !val ||
            headerKeys.includes(key.toUpperCase()) ||
            key.toUpperCase() === "AUDIO"
          )
            continue;
          form.append(key.toLowerCase(), val as string | Blob);
          continue;
        }

        // Check if key is a number, which indicates array-like parsing from curl2json
        if (!isNaN(parseInt(key, 10))) {
          const [formKey, ...formValueParts] = val.split("=");
          const formValue = formValueParts.join("=");

          if (formKey.toLowerCase() === "file") continue; // Already handled by form.append('file', audio)

          if (
            !formValue ||
            headerKeys.includes(formKey.toUpperCase().replace(/[-_]/g, ""))
          )
            continue;

          form.append(formKey, formValue);
        } else {
          if (key.toLowerCase() === "file") continue; // Already handled by form.append('file', audio)
          if (
            !val ||
            headerKeys.includes(key.toUpperCase()) ||
            key.toUpperCase() === "AUDIO"
          )
            continue;
          form.append(key.toLowerCase(), val as string | Blob);
        }
      }
      delete finalHeaders["Content-Type"];
      body = form;
    } else if (isBinaryUpload) {
      // Deepgram-style: raw binary body
      // Use safeBlobToArrayBuffer to avoid Tauri's "cannot access data blob" error
      body = new Blob([await safeBlobToArrayBuffer(audio)], {
        type: audio.type,
      });
    } else {
      // Google-style: JSON payload with base64
      // Use safeBlobToBase64 to avoid Tauri's "cannot access data blob" error
      allVariables.AUDIO = await safeBlobToBase64(audio);
      const dataObj = curlJson.data ? { ...curlJson.data } : {};
      body = JSON.stringify(deepVariableReplacer(dataObj, allVariables));
    }

    const requestInit = {
      method: curlJson.method || "POST",
      headers: finalHeaders,
      body: curlJson.method === "GET" ? undefined : body,
    };

    // Send request
    let response: Response;
    try {
      if (url?.startsWith("http://") || url?.startsWith("https://")) {
        try {
          response = await fetch(url, requestInit);
        } catch {
          // Webview fetch can fail with CORS/network policy errors.
          // Retry with Tauri HTTP plugin to bypass browser networking limits.
          response = await tauriFetch(url, requestInit);
        }
      } else {
        response = await tauriFetch(url, requestInit);
      }
    } catch (e) {
      throw new Error(`Network error: ${e instanceof Error ? e.message : e}`);
    }

    if (!response.ok) {
      let errText = "";
      try {
        errText = await response.text();
      } catch { }
      let errMsg: string;
      try {
        const errObj = JSON.parse(errText);
        errMsg = errObj.message || errText;
      } catch {
        errMsg = errText || response.statusText;
      }
      throw new Error(`HTTP ${response.status}: ${errMsg}`);
    }

    const responseText = await response.text();
    let data: any;
    try {
      data = JSON.parse(responseText);
    } catch {
      return [...warnings, responseText.trim()].filter(Boolean).join("; ");
    }

    // Extract transcription
    const rawPath = provider.responseContentPath || "text";
    const path = rawPath.charAt(0).toLowerCase() + rawPath.slice(1);
    const transcription = (getByPath(data, path) || "").trim();

    if (!transcription) {
      if (warnings.length > 0) return warnings.join("; ");
      return "";
    }

    // Return transcription with any warnings
    return [...warnings, transcription].filter(Boolean).join("; ");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(msg);
  }
}
