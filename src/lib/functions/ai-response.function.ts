import {
  buildDynamicMessages,
  deepVariableReplacer,
  extractVariables,
  getByPath,
  getStreamingContent,
} from "./common.function";
import { Message, TYPE_PROVIDER } from "@/types";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getParsedCurl } from "./curl-cache";
import { shouldUsePluelyAPI } from "./pluely.api";
import { CHUNK_POLL_INTERVAL_MS } from "../chat-constants";
import { getResponseSettings, RESPONSE_LENGTHS, LANGUAGES } from "@/lib";
import { MARKDOWN_FORMATTING_INSTRUCTIONS } from "@/config/constants";

function buildEnhancedSystemPrompt(baseSystemPrompt?: string): string {
  const responseSettings = getResponseSettings();
  const prompts: string[] = [];

  if (baseSystemPrompt) {
    prompts.push(baseSystemPrompt);
  }

  const lengthOption = RESPONSE_LENGTHS.find(
    (l) => l.id === responseSettings.responseLength
  );
  if (lengthOption?.prompt?.trim()) {
    prompts.push(lengthOption.prompt);
  }

  const languageOption = LANGUAGES.find(
    (l) => l.id === responseSettings.language
  );
  if (languageOption?.prompt?.trim()) {
    prompts.push(languageOption.prompt);
  }

  // Add markdown formatting instructions
  prompts.push(MARKDOWN_FORMATTING_INSTRUCTIONS);

  return prompts.join(" ");
}

// Pluely AI streaming function
async function* fetchPluelyAIResponse(params: {
  systemPrompt?: string;
  userMessage: string;
  imagesBase64?: string[];
  history?: Message[];
  signal?: AbortSignal;
}): AsyncIterable<string> {
  try {
    const {
      systemPrompt,
      userMessage,
      imagesBase64 = [],
      history = [],
      signal,
    } = params;

    // Check if already aborted before starting
    if (signal?.aborted) {
      return;
    }

    // Convert history to the expected format
    let historyString: string | undefined;
    if (history.length > 0) {
      // Create a copy before reversing to avoid mutating the original array
      const formattedHistory = [...history].reverse().map((msg) => ({
        role: msg.role,
        content: [{ type: "text", text: msg.content }],
      }));
      historyString = JSON.stringify(formattedHistory);
    }

    // Handle images - can be string or array
    let imageBase64: any = undefined;
    if (imagesBase64.length > 0) {
      imageBase64 = imagesBase64.length === 1 ? imagesBase64[0] : imagesBase64;
    }

    // Set up streaming event listener
    let streamComplete = false;
    const streamChunks: string[] = [];

    const unlisten = await listen("chat_stream_chunk", (event) => {
      const chunk = event.payload as string;
      streamChunks.push(chunk);
    });

    const unlistenComplete = await listen("chat_stream_complete", () => {
      streamComplete = true;
    });

    try {
      // Check if aborted before starting invoke
      if (signal?.aborted) {
        unlisten();
        unlistenComplete();
        return;
      }

      // Start the streaming request using the new API response endpoint
      await invoke("chat_stream_response", {
        userMessage,
        systemPrompt,
        imageBase64,
        history: historyString,
      });

      // Yield chunks as they come in
      let lastIndex = 0;
      while (!streamComplete) {
        // Check if aborted during streaming
        if (signal?.aborted) {
          unlisten();
          unlistenComplete();
          return;
        }

        // Wait a bit for chunks to accumulate
        await new Promise((resolve) =>
          setTimeout(resolve, CHUNK_POLL_INTERVAL_MS)
        );

        // Check again after timeout
        if (signal?.aborted) {
          unlisten();
          unlistenComplete();
          return;
        }

        // Yield any new chunks
        for (let i = lastIndex; i < streamChunks.length; i++) {
          yield streamChunks[i];
        }
        lastIndex = streamChunks.length;
      }

      // Final abort check before yielding remaining chunks
      if (signal?.aborted) {
        unlisten();
        unlistenComplete();
        return;
      }

      // Yield any remaining chunks
      for (let i = lastIndex; i < streamChunks.length; i++) {
        yield streamChunks[i];
      }
    } finally {
      unlisten();
      unlistenComplete();
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    yield `Pluely API Error: ${errorMessage}`;
  }
}

// ─── Internal: raw provider streaming ──────────────────────────────────────
// Extracted so it can be called for both primary and fallback providers.
async function* _fetchFromProvider(params: {
  provider: TYPE_PROVIDER;
  selectedProvider: { provider: string; variables: Record<string, string> };
  enhancedSystemPrompt: string;
  history: Message[];
  userMessage: string;
  imagesBase64: string[];
  signal?: AbortSignal;
}): AsyncIterable<string> {
  const {
    provider,
    selectedProvider,
    enhancedSystemPrompt,
    history,
    userMessage,
    imagesBase64,
    signal,
  } = params;

  // Parse once and cache — avoids per-request curl parsing failures
  const providerCacheKey = provider.id
    ? provider.id
    : provider.curl.slice(0, 40);
  const curlJson = getParsedCurl(providerCacheKey, provider.curl);

  const extractedVariables = extractVariables(provider.curl);
  const requiredVars = extractedVariables.filter(
    ({ key }) => key !== "SYSTEM_PROMPT" && key !== "TEXT" && key !== "IMAGE"
  );
  for (const { key } of requiredVars) {
    if (
      !selectedProvider.variables?.[key] ||
      selectedProvider.variables[key].trim() === ""
    ) {
      throw new Error(
        `Missing required variable: ${key}. Please configure it in settings.`
      );
    }
  }

  if (!userMessage) {
    throw new Error("User message is required");
  }
  if (imagesBase64.length > 0 && !provider.curl.includes("{{IMAGE}}")) {
    throw new Error(
      `Provider ${provider?.id ?? "unknown"} does not support image input`
    );
  }

  let bodyObj: any = curlJson.data
    ? JSON.parse(JSON.stringify(curlJson.data))
    : {};
  const messagesKey = Object.keys(bodyObj).find((key) =>
    ["messages", "contents", "conversation", "history"].includes(key)
  );

  if (messagesKey && Array.isArray(bodyObj[messagesKey])) {
    const finalMessages = buildDynamicMessages(
      bodyObj[messagesKey],
      history,
      userMessage,
      imagesBase64
    );
    bodyObj[messagesKey] = finalMessages;
  }

  const allVariables = {
    ...Object.fromEntries(
      Object.entries(selectedProvider.variables).map(([key, value]) => [
        key.toUpperCase(),
        value,
      ])
    ),
    SYSTEM_PROMPT: enhancedSystemPrompt || "",
  };

  bodyObj = deepVariableReplacer(bodyObj, allVariables);
  const url = deepVariableReplacer(curlJson.url || "", allVariables);
  const headers = deepVariableReplacer(curlJson.headers || {}, allVariables);
  headers["Content-Type"] = "application/json";

  if (provider?.streaming) {
    if (typeof bodyObj === "object" && bodyObj !== null) {
      const streamKey = Object.keys(bodyObj).find(
        (k) => k.toLowerCase() === "stream"
      );
      if (streamKey) {
        bodyObj[streamKey] = true;
      } else {
        bodyObj.stream = true;
      }
    }
  }

  const requestInit = {
    method: curlJson.method,
    headers,
    body: curlJson.method === "GET" ? undefined : JSON.stringify(bodyObj),
    signal,
  };

  let response;
  try {
    if (url?.includes("http")) {
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
  } catch (fetchError) {
    if (
      signal?.aborted ||
      (fetchError instanceof Error && fetchError.name === "AbortError")
    ) {
      return;
    }
    throw new Error(
      `Network error: ${fetchError instanceof Error ? fetchError.message : "Unknown error"}`
    );
  }

  if (!response.ok) {
    let errorText = "";
    try {
      errorText = await response.text();
    } catch { }
    throw new Error(
      `API request failed: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ""}`
    );
  }

  if (!provider?.streaming) {
    let json;
    try {
      json = await response.json();
    } catch (parseError) {
      throw new Error(
        `Failed to parse non-streaming response: ${parseError instanceof Error ? parseError.message : "Unknown error"}`
      );
    }
    const content =
      getByPath(json, provider?.responseContentPath || "") || "";
    yield content;
    return;
  }

  if (!response.body) {
    throw new Error("Streaming not supported or response body missing");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let emittedAnyChunk = false;

  while (true) {
    if (signal?.aborted) {
      reader.cancel();
      return;
    }

    let readResult;
    try {
      readResult = await reader.read();
    } catch (readError) {
      if (
        signal?.aborted ||
        (readError instanceof Error && readError.name === "AbortError")
      ) {
        return;
      }
      throw new Error(
        `Error reading stream: ${readError instanceof Error ? readError.message : "Unknown error"}`
      );
    }

    const { done, value } = readResult;
    if (done) break;

    if (signal?.aborted) {
      reader.cancel();
      return;
    }

    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      const raw = line.trim();
      if (!raw) continue;

      const payload = raw.startsWith("data:") ? raw.substring(5).trim() : raw;
      if (!payload || payload === "[DONE]") continue;

      try {
        const parsed = JSON.parse(payload);
        const delta = getStreamingContent(
          parsed,
          provider?.responseContentPath || ""
        );
        if (delta) {
          emittedAnyChunk = true;
          yield delta;
        }
      } catch {
        // Ignore partial JSON chunks
      }
    }
  }

  const remaining = buffer.trim();
  if (remaining) {
    const payload = remaining.startsWith("data:")
      ? remaining.substring(5).trim()
      : remaining;
    if (payload && payload !== "[DONE]") {
      try {
        const parsed = JSON.parse(payload);
        const delta = getStreamingContent(
          parsed,
          provider?.responseContentPath || ""
        );
        if (delta) {
          emittedAnyChunk = true;
          yield delta;
        }
      } catch {
        // Ignore trailing non-JSON
      }
    }
  }

  if (!emittedAnyChunk) {
    throw new Error("No response content received from provider stream.");
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────
export async function* fetchAIResponse(params: {
  provider: TYPE_PROVIDER | undefined;
  selectedProvider: {
    provider: string;
    variables: Record<string, string>;
  };
  systemPrompt?: string;
  history?: Message[];
  userMessage: string;
  imagesBase64?: string[];
  signal?: AbortSignal;
  /** Fallback provider tried if the primary times out or throws */
  fallbackProvider?: TYPE_PROVIDER;
  fallbackSelectedProvider?: {
    provider: string;
    variables: Record<string, string>;
  };
  /**
   * How many milliseconds to wait for the **first** chunk from the primary
   * before aborting it and retrying with the fallback.
   * Ignored when no fallbackProvider is set.
   */
  timeoutMs?: number;
}): AsyncIterable<string> {
  const {
    provider,
    selectedProvider,
    systemPrompt,
    history = [],
    userMessage,
    imagesBase64 = [],
    signal,
    fallbackProvider,
    fallbackSelectedProvider,
    timeoutMs,
  } = params;

  if (signal?.aborted) return;

  const enhancedSystemPrompt = buildEnhancedSystemPrompt(systemPrompt);

  // ── Pluely API shortcut ──────────────────────────────────────────────────
  const usePluelyAPI = await shouldUsePluelyAPI();
  if (usePluelyAPI) {
    yield* fetchPluelyAIResponse({
      systemPrompt: enhancedSystemPrompt,
      userMessage,
      imagesBase64,
      history,
      signal,
    });
    return;
  }

  if (!provider) throw new Error("Provider not provided");
  if (!selectedProvider) throw new Error("Selected provider not provided");

  // ── Helper: run a provider stream and collect the chunks ─────────────────
  const streamArgs = {
    enhancedSystemPrompt,
    history,
    userMessage,
    imagesBase64,
  };

  // ── No fallback configured → stream directly ─────────────────────────────
  if (!fallbackProvider || !fallbackSelectedProvider) {
    yield* _fetchFromProvider({
      provider,
      selectedProvider,
      signal,
      ...streamArgs,
    });
    return;
  }

  // ── Fallback path: race the primary against a timeout ───────────────────
  // We use a dedicated AbortController so we can cancel the primary request
  // without touching the outer signal.
  const primaryController = new AbortController();
  // If the outer signal fires, also abort the primary controller.
  const onOuterAbort = () => primaryController.abort();
  signal?.addEventListener("abort", onOuterAbort, { once: true });

  let timerHandle: ReturnType<typeof setTimeout> | null = null;
  let primaryTimedOut = false;

  // Get the AsyncIterator from the AsyncIterable so we can call .next() directly
  const primaryIter = _fetchFromProvider({
    provider,
    selectedProvider,
    signal: primaryController.signal,
    ...streamArgs,
  })[Symbol.asyncIterator]();

  try {
    // Race: get first chunk or timeout
    const firstChunkPromise = primaryIter.next();

    const timeoutPromise = new Promise<void>((_, reject) => {
      timerHandle = setTimeout(() => {
        primaryTimedOut = true;
        primaryController.abort();
        reject(new Error(`Primary provider timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    let firstResult: IteratorResult<string>;
    try {
      firstResult = await Promise.race([
        firstChunkPromise,
        timeoutPromise.then(() => { throw new Error("timeout"); }),
      ]) as IteratorResult<string>;
      // Primary responded in time — clear the timer
      if (timerHandle !== null) clearTimeout(timerHandle);
    } catch (primaryErr) {
      // Primary failed or timed out — try fallback
      if (timerHandle !== null) clearTimeout(timerHandle);
      console.warn("[AI Fallback] Primary failed, switching to fallback provider.", primaryErr);

      if (signal?.aborted) return;

      // Notify the UI that we switched
      yield "\n\n> ⚡ *Switched to fallback provider*\n\n";

      yield* _fetchFromProvider({
        provider: fallbackProvider,
        selectedProvider: fallbackSelectedProvider,
        signal,
        ...streamArgs,
      });
      return;
    }

    // Primary gave us the first chunk — stream the rest normally
    if (firstResult.done) return;
    yield firstResult.value;

    // Continue streaming remaining chunks from primary
    let result = await primaryIter.next();
    while (!result.done) {
      if (signal?.aborted || primaryController.signal.aborted) return;
      yield result.value;
      result = await primaryIter.next();
    }
  } finally {
    signal?.removeEventListener("abort", onOuterAbort);
    if (timerHandle !== null) clearTimeout(timerHandle);
    // Ensure primary is cleaned up if we switched to fallback
    if (primaryTimedOut) {
      primaryController.abort();
    }
  }
}
