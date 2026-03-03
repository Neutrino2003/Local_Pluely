/**
 * Zustand stores for Pluely global state.
 *
 * Split into three focused stores so components only re-render when the
 * specific slice of state they care about changes:
 *
 *   useProviderStore  → AI / STT / TTS provider selection + custom providers
 *   useSettingsStore  → system prompt, screenshot config, image support, Pluely API
 *   useUiStore        → customizable UI state, audio devices, mic-in-system-audio
 *
 * The existing `useApp()` context hook continues to work unchanged:
 * `app.context.tsx` has been updated to delegate to these stores under the hood.
 * No consumer components need to change.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
    AI_PROVIDERS,
    SPEECH_TO_TEXT_PROVIDERS,
    TEXT_TO_SPEECH_PROVIDERS,
    DEFAULT_SYSTEM_PROMPT,
} from "@/config";
import { TYPE_PROVIDER, ScreenshotConfig } from "@/types";
import {
    CustomizableState,
    DEFAULT_CUSTOMIZABLE_STATE,
} from "@/lib/storage";

// ─────────────────────────────────────────────────────────────
// Provider store  (AI + STT + TTS)
// ─────────────────────────────────────────────────────────────
interface ProviderState {
    // AI
    customAiProviders: TYPE_PROVIDER[];
    selectedAIProvider: { provider: string; variables: Record<string, string> };
    aiProviderVariables: Record<string, Record<string, string>>;

    // STT
    customSttProviders: TYPE_PROVIDER[];
    selectedSttProvider: { provider: string; variables: Record<string, string> };
    sttProviderVariables: Record<string, Record<string, string>>;

    // TTS
    customTtsProviders: TYPE_PROVIDER[];
    selectedTtsProvider: { provider: string; variables: Record<string, string> };

    // Actions
    setCustomAiProviders: (providers: TYPE_PROVIDER[]) => void;
    setSelectedAIProvider: (sel: { provider: string; variables: Record<string, string> }) => void;
    setCustomSttProviders: (providers: TYPE_PROVIDER[]) => void;
    setSelectedSttProvider: (sel: { provider: string; variables: Record<string, string> }) => void;
    setCustomTtsProviders: (providers: TYPE_PROVIDER[]) => void;
    setSelectedTtsProvider: (sel: { provider: string; variables: Record<string, string> }) => void;
}

const normalizeProviderSelection = (
    value: unknown
): { provider: string; variables: Record<string, string> } => {
    if (!value || typeof value !== "object") {
        return { provider: "", variables: {} };
    }

    const selection = value as {
        provider?: unknown;
        variables?: unknown;
    };

    const provider =
        typeof selection.provider === "string" ? selection.provider : "";

    const variables: Record<string, string> = {};
    if (selection.variables && typeof selection.variables === "object") {
        Object.entries(selection.variables as Record<string, unknown>).forEach(
            ([key, rawValue]) => {
                if (typeof rawValue === "string") {
                    variables[key] = rawValue;
                }
            }
        );
    }

    return { provider, variables };
};

export const useProviderStore = create<ProviderState>()(
    persist(
        (set) => ({
            customAiProviders: [],
            selectedAIProvider: { provider: "", variables: {} },
            aiProviderVariables: {},
            customSttProviders: [],
            selectedSttProvider: { provider: "", variables: {} },
            sttProviderVariables: {},
            customTtsProviders: [],
            selectedTtsProvider: { provider: "", variables: {} },

            setCustomAiProviders: (providers) => set({ customAiProviders: providers }),
            setSelectedAIProvider: (sel) => set((state) => {
                // Persist current provider's variables into the map before switching
                const map = { ...state.aiProviderVariables };
                if (state.selectedAIProvider.provider) {
                    map[state.selectedAIProvider.provider] = { ...state.selectedAIProvider.variables };
                }
                // Restore saved variables when switching to a different provider
                const isSwitch = sel.provider !== state.selectedAIProvider.provider;
                const vars = isSwitch ? (map[sel.provider] ?? sel.variables) : sel.variables;
                if (sel.provider) map[sel.provider] = vars;
                return {
                    selectedAIProvider: { provider: sel.provider, variables: vars },
                    aiProviderVariables: map,
                };
            }),
            setCustomSttProviders: (providers) => set({ customSttProviders: providers }),
            setSelectedSttProvider: (sel) => set((state) => {
                // Persist current provider's variables into the map before switching
                const map = { ...state.sttProviderVariables };
                if (state.selectedSttProvider.provider) {
                    map[state.selectedSttProvider.provider] = { ...state.selectedSttProvider.variables };
                }
                // Restore saved variables when switching to a different provider
                const isSwitch = sel.provider !== state.selectedSttProvider.provider;
                const vars = isSwitch ? (map[sel.provider] ?? sel.variables) : sel.variables;
                if (sel.provider) map[sel.provider] = vars;
                return {
                    selectedSttProvider: { provider: sel.provider, variables: vars },
                    sttProviderVariables: map,
                };
            }),
            setCustomTtsProviders: (providers) => set({ customTtsProviders: providers }),
            setSelectedTtsProvider: (sel) => set({ selectedTtsProvider: sel }),
        }),
        {
            name: "pluely-providers",
            partialize: (s) => ({
                selectedAIProvider: s.selectedAIProvider,
                selectedSttProvider: s.selectedSttProvider,
                selectedTtsProvider: s.selectedTtsProvider,
                customAiProviders: s.customAiProviders,
                customSttProviders: s.customSttProviders,
                customTtsProviders: s.customTtsProviders,
                aiProviderVariables: s.aiProviderVariables,
                sttProviderVariables: s.sttProviderVariables,
            }),
            merge: (persistedState, currentState) => {
                const persisted = (persistedState as Partial<ProviderState>) ?? {};
                return {
                    ...currentState,
                    ...persisted,
                    customAiProviders: Array.isArray(persisted.customAiProviders)
                        ? persisted.customAiProviders
                        : currentState.customAiProviders,
                    customSttProviders: Array.isArray(persisted.customSttProviders)
                        ? persisted.customSttProviders
                        : currentState.customSttProviders,
                    customTtsProviders: Array.isArray(persisted.customTtsProviders)
                        ? persisted.customTtsProviders
                        : currentState.customTtsProviders,
                    selectedAIProvider: normalizeProviderSelection(
                        persisted.selectedAIProvider
                    ),
                    selectedSttProvider: normalizeProviderSelection(
                        persisted.selectedSttProvider
                    ),
                    selectedTtsProvider: normalizeProviderSelection(
                        persisted.selectedTtsProvider
                    ),
                    aiProviderVariables:
                        persisted.aiProviderVariables &&
                        typeof persisted.aiProviderVariables === "object" &&
                        !Array.isArray(persisted.aiProviderVariables)
                            ? persisted.aiProviderVariables
                            : currentState.aiProviderVariables,
                    sttProviderVariables:
                        persisted.sttProviderVariables &&
                        typeof persisted.sttProviderVariables === "object" &&
                        !Array.isArray(persisted.sttProviderVariables)
                            ? persisted.sttProviderVariables
                            : currentState.sttProviderVariables,
                };
            },
        }
    )
);

/**
 * Selector helpers — derive merged provider lists from built-ins + custom.
 * Usage in components: const allAi = useProviderStore(getAllAiProviders);
 */
export const getAllAiProviders = (s: ProviderState): TYPE_PROVIDER[] => [
    ...AI_PROVIDERS,
    ...s.customAiProviders,
];
export const getAllSttProviders = (s: ProviderState): TYPE_PROVIDER[] => [
    ...SPEECH_TO_TEXT_PROVIDERS,
    ...s.customSttProviders,
];
export const getAllTtsProviders = (s: ProviderState): TYPE_PROVIDER[] => [
    ...TEXT_TO_SPEECH_PROVIDERS,
    ...s.customTtsProviders,
];

// ─────────────────────────────────────────────────────────────
// Settings store  (prompt, screenshot, images, pluely API)
// ─────────────────────────────────────────────────────────────
interface SettingsState {
    systemPrompt: string;
    screenshotConfiguration: ScreenshotConfig;
    supportsImages: boolean;
    pluelyApiEnabled: boolean;
    hasActiveLicense: boolean;

    setSystemPrompt: (prompt: string) => void;
    setScreenshotConfiguration: (config: ScreenshotConfig) => void;
    setSupportsImages: (value: boolean) => void;
    setPluelyApiEnabled: (enabled: boolean) => void;
    // no-op: all users are treated as licensed
    getActiveLicenseStatus: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>()(
    persist(
        (set) => ({
            systemPrompt: DEFAULT_SYSTEM_PROMPT,
            screenshotConfiguration: {
                mode: "manual" as const,
                autoPrompt: "Analyze this screenshot and provide insights",
                enabled: true,
            },
            supportsImages: true,
            pluelyApiEnabled: false,
            hasActiveLicense: true,

            setSystemPrompt: (prompt) => set({ systemPrompt: prompt }),
            setScreenshotConfiguration: (config) => set({ screenshotConfiguration: config }),
            setSupportsImages: (value) => set({ supportsImages: value }),
            setPluelyApiEnabled: (enabled) => set({ pluelyApiEnabled: enabled }),
            getActiveLicenseStatus: async () => {
                // License validation is disabled — always licensed.
                set({ hasActiveLicense: true });
            },
        }),
        {
            name: "pluely-settings",
            partialize: (s) => ({
                systemPrompt: s.systemPrompt,
                screenshotConfiguration: s.screenshotConfiguration,
                supportsImages: s.supportsImages,
                pluelyApiEnabled: s.pluelyApiEnabled,
            }),
        }
    )
);

// ─────────────────────────────────────────────────────────────
// UI store  (customizable, audio devices, mic flag)
// ─────────────────────────────────────────────────────────────
interface UiState {
    customizable: CustomizableState;
    selectedAudioDevices: {
        input: { id: string; name: string };
        output: { id: string; name: string };
    };
    includeMicInSystemAudio: boolean;

    setCustomizable: (state: CustomizableState) => void;
    setSelectedAudioDevices: (devices: {
        input: { id: string; name: string };
        output: { id: string; name: string };
    }) => void;
    setIncludeMicInSystemAudio: (value: boolean) => void;
}

export const useUiStore = create<UiState>()(
    persist(
        (set) => ({
            customizable: DEFAULT_CUSTOMIZABLE_STATE,
            selectedAudioDevices: {
                input: { id: "", name: "" },
                output: { id: "", name: "" },
            },
            includeMicInSystemAudio: false,

            setCustomizable: (state) => set({ customizable: state }),
            setSelectedAudioDevices: (devices) => set({ selectedAudioDevices: devices }),
            setIncludeMicInSystemAudio: (value) => set({ includeMicInSystemAudio: value }),
        }),
        {
            name: "pluely-ui",
        }
    )
);
