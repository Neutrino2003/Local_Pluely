import {
  DEFAULT_SYSTEM_PROMPT,
  STORAGE_KEYS,
  AI_PROVIDERS,
  SPEECH_TO_TEXT_PROVIDERS,
  TEXT_TO_SPEECH_PROVIDERS,
} from "@/config";
import { getPlatform, safeLocalStorage, trackAppStart } from "@/lib";
import { getAllConversations, getConversationById } from "@/lib";
import { getShortcutsConfig } from "@/lib/storage";
import {
  getCustomizableState,
  setCustomizableState,
  updateAppIconVisibility,
  updateAlwaysOnTop,
  updateAutostart,
  CursorType,
  updateCursorType,
} from "@/lib/storage";
import { IContextType, TYPE_PROVIDER } from "@/types";
import { getParsedCurl } from "@/lib/functions/curl-cache";
import { useProviderStore, useSettingsStore, useUiStore } from "@/stores";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { enable, disable } from "@tauri-apps/plugin-autostart";
import {
  ReactNode,
  createContext,
  useContext,
  useEffect,
} from "react";

const validateAndProcessCurlProviders = (
  providersJson: string,
  providerType: "AI" | "STT"
): TYPE_PROVIDER[] => {
  try {
    const parsed = JSON.parse(providersJson);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((p) => {
        try {
          // Validate by parse-once caching — throws on bad curl
          getParsedCurl(p.id ?? p.curl?.slice(0, 40), p.curl);
          return true;
        } catch {
          return false;
        }
      })
      .map((p) => {
        const provider = { ...p, isCustom: true };
        if (providerType === "STT" && provider.curl) {
          provider.curl = provider.curl.replace(/AUDIO_BASE64/g, "AUDIO");
        }
        return provider;
      });
  } catch (e) {
    console.warn(`Failed to parse custom ${providerType} providers`, e);
    return [];
  }
};

// Create the context
const AppContext = createContext<IContextType | undefined>(undefined);

// Create the provider component
export const AppProvider = ({ children }: { children: ReactNode }) => {
  // ── Zustand stores (atomic subscriptions, no big re-renders) ──
  const {
    customAiProviders, setCustomAiProviders,
    selectedAIProvider, setSelectedAIProvider,
    fallbackAIProvider, setFallbackAIProvider,
    fallbackTimeoutMs, setFallbackTimeoutMs,
    customSttProviders, setCustomSttProviders,
    selectedSttProvider, setSelectedSttProvider,
    customTtsProviders, setCustomTtsProviders,
    selectedTtsProvider, setSelectedTtsProvider,
  } = useProviderStore();

  // Derived provider lists — built-ins merged with any custom providers
  const allAiProviders: TYPE_PROVIDER[] = [...AI_PROVIDERS, ...customAiProviders];
  const allSttProviders: TYPE_PROVIDER[] = [...SPEECH_TO_TEXT_PROVIDERS, ...customSttProviders];
  const allTtsProviders: TYPE_PROVIDER[] = [...TEXT_TO_SPEECH_PROVIDERS, ...customTtsProviders];

  const {
    systemPrompt, setSystemPrompt,
    screenshotConfiguration, setScreenshotConfiguration,
    supportsImages, setSupportsImages,
    pluelyApiEnabled, setPluelyApiEnabled: setPluelyApiEnabledStore,
    hasActiveLicense, getActiveLicenseStatus,
  } = useSettingsStore();

  const {
    customizable, setCustomizable,
    selectedAudioDevices, setSelectedAudioDevices,
    includeMicInSystemAudio, setIncludeMicInSystemAudio,
  } = useUiStore();

  // setHasActiveLicense is part of useSettingsStore internals (always true)
  const setHasActiveLicense = (_v: boolean) => { }; // no-op for backward compat

  useEffect(() => {
    const syncLicenseState = async () => {
      try {
        await invoke("set_license_status", {
          hasLicense: hasActiveLicense,
        });

        const config = getShortcutsConfig();
        await invoke("update_shortcuts", { config });
      } catch (error) {
        console.error("Failed to synchronize license state:", error);
      }
    };

    syncLicenseState();
  }, [hasActiveLicense]);

  // Function to load AI, STT, system prompt and screenshot config data from storage
  const loadData = () => {
    // Load system prompt
    const savedSystemPrompt = safeLocalStorage.getItem(
      STORAGE_KEYS.SYSTEM_PROMPT
    );
    if (savedSystemPrompt) {
      setSystemPrompt(savedSystemPrompt || DEFAULT_SYSTEM_PROMPT);
    }

    // Load screenshot configuration
    const savedScreenshotConfig = safeLocalStorage.getItem(
      STORAGE_KEYS.SCREENSHOT_CONFIG
    );
    if (savedScreenshotConfig) {
      try {
        const parsed = JSON.parse(savedScreenshotConfig);
        if (typeof parsed === "object" && parsed !== null) {
          setScreenshotConfiguration({
            mode: parsed.mode || "manual",
            autoPrompt:
              parsed.autoPrompt ||
              "Analyze this screenshot and provide insights",
            enabled: parsed.enabled !== undefined ? parsed.enabled : false,
          });
        }
      } catch {
        console.warn("Failed to parse screenshot configuration");
      }
    }

    // Load custom AI providers
    const savedAi = safeLocalStorage.getItem(STORAGE_KEYS.CUSTOM_AI_PROVIDERS);
    let aiList: TYPE_PROVIDER[] = [];
    if (savedAi) {
      aiList = validateAndProcessCurlProviders(savedAi, "AI");
    }
    setCustomAiProviders(aiList);

    // Load custom STT providers
    const savedStt = safeLocalStorage.getItem(
      STORAGE_KEYS.CUSTOM_SPEECH_PROVIDERS
    );
    let sttList: TYPE_PROVIDER[] = [];
    if (savedStt) {
      sttList = validateAndProcessCurlProviders(savedStt, "STT");
    }
    setCustomSttProviders(sttList);

    // Load custom TTS providers
    const savedTts = safeLocalStorage.getItem(
      STORAGE_KEYS.CUSTOM_TTS_PROVIDERS
    );
    let ttsList: TYPE_PROVIDER[] = [];
    if (savedTts) {
      ttsList = validateAndProcessCurlProviders(savedTts, "AI");
    }
    setCustomTtsProviders(ttsList);

    // Load selected AI provider (Zustand handles this — only sync custom providers here)
    // The Zustand persist middleware already rehydrated selectedAIProvider/STT/TTS on boot.
    // We still need to load custom providers because they are written by DevSpace UI directly.

    const customizableState = getCustomizableState();
    setCustomizable(customizableState);

    updateCursor(customizableState.cursor.type || "invisible");

    const stored = safeLocalStorage.getItem(STORAGE_KEYS.CUSTOMIZABLE);
    if (!stored) {
      // save the default state
      setCustomizableState(customizableState);
    } else {
      // check if we need to update the schema
      try {
        const parsed = JSON.parse(stored);
        if (!parsed.autostart) {
          // save the merged state with new autostart property
          setCustomizableState(customizableState);
          updateCursor(customizableState.cursor.type || "invisible");
        }
      } catch (error) {
        console.debug("Failed to check customizable state schema:", error);
      }
    }

    // Load Pluely API enabled state
    const savedPluelyApiEnabled = safeLocalStorage.getItem(
      STORAGE_KEYS.PLUELY_API_ENABLED
    );
    if (savedPluelyApiEnabled !== null) {
      setPluelyApiEnabledStore(savedPluelyApiEnabled === "true");
    }

    // Load selected audio devices
    const savedAudioDevices = safeLocalStorage.getItem(
      STORAGE_KEYS.SELECTED_AUDIO_DEVICES
    );
    if (savedAudioDevices) {
      try {
        const parsed = JSON.parse(savedAudioDevices);
        if (parsed && typeof parsed === "object") {
          setSelectedAudioDevices(parsed);
        }
      } catch {
        console.warn("Failed to parse selected audio devices");
      }
    }

    const savedIncludeMic = safeLocalStorage.getItem(
      STORAGE_KEYS.SYSTEM_AUDIO_INCLUDE_MIC
    );
    if (savedIncludeMic !== null) {
      setIncludeMicInSystemAudio(savedIncludeMic === "true");
    }
  };

  const updateCursor = (type: CursorType | undefined) => {
    try {
      const currentWindow = getCurrentWindow();
      const platform = getPlatform();
      // For Linux, always use default cursor
      if (platform === "linux") {
        document.documentElement.style.setProperty("--cursor-type", "default");
        return;
      }
      const windowLabel = currentWindow.label;

      if (windowLabel === "dashboard") {
        // For dashboard, always use default cursor
        document.documentElement.style.setProperty("--cursor-type", "default");
        return;
      }

      // For overlay windows (main, capture-overlay-*)
      const safeType = type || "invisible";
      const cursorValue = type === "invisible" ? "none" : safeType;
      document.documentElement.style.setProperty("--cursor-type", cursorValue);
    } catch (error) {
      document.documentElement.style.setProperty("--cursor-type", "default");
    }
  };

  // Load data on mount
  useEffect(() => {
    const initializeApp = async () => {
      // Load license and data
      await getActiveLicenseStatus();

      // Track app start
      try {
        const appVersion = await invoke<string>("get_app_version");
        const storage = await invoke<{
          instance_id: string;
        }>("secure_storage_get");
        await trackAppStart(appVersion, storage.instance_id || "");
      } catch (error) {
        console.debug("Failed to track app start:", error);
      }
    };
    // Load data
    loadData();
    initializeApp();
  }, []);

  // ── Always-on remote control listeners ──────────────────────────────────────
  // These must live here (not in useHistory) so they work even when the
  // Chats page is not open on the PC overlay.
  useEffect(() => {
    let unlistenSessions: (() => void) | null = null;
    let unlistenMessages: (() => void) | null = null;

    const setup = async () => {
      try {
        unlistenSessions = await listen(
          "remote-control-get-chat-sessions",
          async (event: any) => {
            try {
              const loadedConversations = await getAllConversations();
              const p = event.payload as { requestId?: string } | null;
              const sessions = loadedConversations.map((c) => ({
                id: c.id,
                title: c.title,
                createdAt: c.createdAt,
                updatedAt: c.updatedAt,
              }));
              await invoke("remote_control_push_chat_sessions", {
                sessions,
                requestId: p?.requestId ?? null,
              });
            } catch (e) {
              console.error("[Remote] Failed to push chat sessions", e);
            }
          }
        );

        unlistenMessages = await listen(
          "remote-control-get-chat-messages",
          async (event: any) => {
            try {
              const p = event.payload as {
                requestId?: string;
                conversationId?: string;
              } | null;
              if (p?.conversationId) {
                const conversation = await getConversationById(
                  p.conversationId
                );
                if (conversation) {
                  await invoke("remote_control_push_chat_messages", {
                    messages: conversation,
                    requestId: p?.requestId ?? null,
                  });
                }
              }
            } catch (e) {
              console.error("[Remote] Failed to push chat messages", e);
            }
          }
        );
      } catch (err) {
        console.error("[Remote] Failed to setup chat listeners", err);
      }
    };

    setup();

    return () => {
      unlistenSessions?.();
      unlistenMessages?.();
    };
  }, []);

  // Handle customizable settings on state changes
  useEffect(() => {
    const applyCustomizableSettings = async () => {
      try {
        // Guard: sub-properties may be undefined if the store hasn't fully hydrated yet
        if (!customizable?.appIcon || !customizable?.alwaysOnTop) return;

        await Promise.all([
          invoke("set_app_icon_visibility", {
            visible: customizable.appIcon.isVisible,
          }),
          invoke("set_always_on_top", {
            enabled: customizable.alwaysOnTop.isEnabled,
          }),
        ]);
      } catch (error) {
        console.error("Failed to apply customizable settings:", error);
      }
    };

    applyCustomizableSettings();
  }, [customizable]);

  useEffect(() => {
    const initializeAutostart = async () => {
      try {
        const autostartInitialized = safeLocalStorage.getItem(
          STORAGE_KEYS.AUTOSTART_INITIALIZED
        );

        // Only apply autostart on the very first launch
        if (!autostartInitialized) {
          const autostartEnabled = customizable?.autostart?.isEnabled ?? true;

          if (autostartEnabled) {
            await enable();
          } else {
            await disable();
          }

          // Mark as initialized so this never runs again
          safeLocalStorage.setItem(STORAGE_KEYS.AUTOSTART_INITIALIZED, "true");
        }
      } catch (error) {
        console.debug("Autostart initialization skipped:", error);
      }
    };

    initializeAutostart();
  }, []);

  // Listen for app icon hide/show events when window is toggled
  useEffect(() => {
    const handleAppIconVisibility = async (isVisible: boolean) => {
      try {
        await invoke("set_app_icon_visibility", { visible: isVisible });
      } catch (error) {
        console.error("Failed to set app icon visibility:", error);
      }
    };

    const unlistenHide = listen("handle-app-icon-on-hide", async () => {
      const currentState = getCustomizableState();
      // Only hide app icon if user has set it to hide mode
      if (!currentState.appIcon.isVisible) {
        await handleAppIconVisibility(false);
      }
    });

    const unlistenShow = listen("handle-app-icon-on-show", async () => {
      const currentState = getCustomizableState();
      // Only show app icon when window is shown if the user hasn't set it to stealth/hidden mode
      if (currentState.appIcon.isVisible) {
        await handleAppIconVisibility(true);
      }
    });

    return () => {
      unlistenHide.then((fn) => fn());
      unlistenShow.then((fn) => fn());
    };
  }, []);

  // Listen to storage events for real-time sync (e.g., multi-tab)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      // Sync supportsImages across windows
      if (e.key === STORAGE_KEYS.SUPPORTS_IMAGES && e.newValue !== null) {
        setSupportsImages(e.newValue === "true");
      }

      if (
        e.key === STORAGE_KEYS.CUSTOM_AI_PROVIDERS ||
        e.key === STORAGE_KEYS.SELECTED_AI_PROVIDER ||
        e.key === STORAGE_KEYS.CUSTOM_SPEECH_PROVIDERS ||
        e.key === STORAGE_KEYS.SELECTED_STT_PROVIDER ||
        e.key === STORAGE_KEYS.SYSTEM_PROMPT ||
        e.key === STORAGE_KEYS.SCREENSHOT_CONFIG ||
        e.key === STORAGE_KEYS.CUSTOMIZABLE ||
        e.key === STORAGE_KEYS.SELECTED_AUDIO_DEVICES ||
        e.key === STORAGE_KEYS.SYSTEM_AUDIO_INCLUDE_MIC
      ) {
        loadData();
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  // Check if the current AI provider/model supports images
  useEffect(() => {
    const checkImageSupport = async () => {
      if (pluelyApiEnabled) {
        // For Pluely API, check the selected model's modality
        try {
          const storage = await invoke<{
            selected_pluely_model?: string;
          }>("secure_storage_get");

          if (storage.selected_pluely_model) {
            const model = JSON.parse(storage.selected_pluely_model);
            const hasImageSupport = model.modality?.includes("image") ?? false;
            setSupportsImages(hasImageSupport);
          } else {
            // No model selected, assume no image support
            setSupportsImages(false);
          }
        } catch (error) {
          setSupportsImages(false);
        }
      } else {
        // For custom AI providers, check if curl contains {{IMAGE}}
        const provider = allAiProviders.find(
          (p) => p.id === selectedAIProvider?.provider
        );
        if (provider) {
          const hasImageSupport = provider.curl?.includes("{{IMAGE}}") ?? false;
          setSupportsImages(hasImageSupport);
        } else {
          setSupportsImages(true);
        }
      }
    };

    checkImageSupport();
  }, [pluelyApiEnabled, selectedAIProvider?.provider]);

  // NOTE: selectedAIProvider, selectedSttProvider, selectedTtsProvider,
  // selectedAudioDevices, and includeMicInSystemAudio are persisted automatically
  // by Zustand's persist middleware in @/stores. No manual useEffect sync needed.

  const onSetSelectedAIProvider = ({
    provider,
    variables,
  }: {
    provider: string;
    variables: Record<string, string>;
  }) => {
    if (provider && !allAiProviders.some((p) => p.id === provider)) {
      console.warn(`Invalid AI provider ID: ${provider}`);
      return;
    }

    // Update supportsImages immediately when provider changes
    if (!pluelyApiEnabled) {
      const selectedProvider = allAiProviders.find((p: TYPE_PROVIDER) => p.id === provider);
      if (selectedProvider) {
        const hasImageSupport =
          selectedProvider.curl?.includes("{{IMAGE}}") ?? false;
        setSupportsImages(hasImageSupport);
      } else {
        setSupportsImages(true);
      }
    }

    setSelectedAIProvider({ provider, variables });
  };

  const onSetFallbackAIProvider = (sel: {
    provider: string;
    variables: Record<string, string>;
  }) => {
    setFallbackAIProvider(sel);
  };

  // Setter for selected STT with validation
  const onSetSelectedSttProvider = ({
    provider,
    variables,
  }: {
    provider: string;
    variables: Record<string, string>;
  }) => {
    if (provider && !allSttProviders.some((p) => p.id === provider)) {
      console.warn(`Invalid STT provider ID: ${provider}`);
      return;
    }

    setSelectedSttProvider({ provider, variables });
  };

  // Setter for selected TTS with validation
  const onSetSelectedTtsProvider = ({
    provider,
    variables,
  }: {
    provider: string;
    variables: Record<string, string>;
  }) => {
    if (provider && !allTtsProviders.some((p) => p.id === provider)) {
      console.warn(`Invalid TTS provider ID: ${provider}`);
      return;
    }

    setSelectedTtsProvider({ provider, variables });
  };

  // Toggle handlers
  const toggleAppIconVisibility = async (isVisible: boolean) => {
    const newState = updateAppIconVisibility(isVisible);
    setCustomizable(newState);
    try {
      await invoke("set_app_icon_visibility", { visible: isVisible });
      loadData();
    } catch (error) {
      console.error("Failed to toggle app icon visibility:", error);
    }
  };

  const toggleAlwaysOnTop = async (isEnabled: boolean) => {
    const newState = updateAlwaysOnTop(isEnabled);
    setCustomizable(newState);
    try {
      await invoke("set_always_on_top", { enabled: isEnabled });
      loadData();
    } catch (error) {
      console.error("Failed to toggle always on top:", error);
    }
  };

  const toggleAutostart = async (isEnabled: boolean) => {
    const newState = updateAutostart(isEnabled);
    setCustomizable(newState);
    try {
      if (isEnabled) {
        await enable();
      } else {
        await disable();
      }
      loadData();
    } catch (error) {
      console.error("Failed to toggle autostart:", error);
      const revertedState = updateAutostart(!isEnabled);
      setCustomizable(revertedState);
    }
  };

  const setCursorType = (type: CursorType) => {
    setCustomizable({ ...customizable, cursor: { type } });
    updateCursor(type);
    updateCursorType(type);
    loadData();
  };

  const setPluelyApiEnabled = async (enabled: boolean) => {
    setPluelyApiEnabledStore(enabled);
    safeLocalStorage.setItem(STORAGE_KEYS.PLUELY_API_ENABLED, String(enabled));

    if (enabled) {
      try {
        const storage = await invoke<{
          selected_pluely_model?: string;
        }>("secure_storage_get");

        if (storage.selected_pluely_model) {
          const model = JSON.parse(storage.selected_pluely_model);
          const hasImageSupport = model.modality?.includes("image") ?? false;
          setSupportsImages(hasImageSupport);
        } else {
          // No model selected, assume no image support
          setSupportsImages(false);
        }
      } catch (error) {
        console.debug("Failed to check Pluely model image support:", error);
        setSupportsImages(false);
      }
    } else {
      // Switching to regular provider - check if curl contains {{IMAGE}}
      const provider = allAiProviders.find(
        (p) => p.id === selectedAIProvider?.provider
      );
      if (provider) {
        const hasImageSupport = provider.curl?.includes("{{IMAGE}}") ?? false;
        setSupportsImages(hasImageSupport);
      } else {
        setSupportsImages(true);
      }
    }

    loadData();
  };

  // Create the context value (extend IContextType accordingly)
  const value: IContextType = {
    systemPrompt,
    setSystemPrompt,
    allAiProviders,
    customAiProviders,
    selectedAIProvider,
    onSetSelectedAIProvider,
    fallbackAIProvider,
    onSetFallbackAIProvider,
    fallbackTimeoutMs,
    setFallbackTimeoutMs,
    allSttProviders,
    customSttProviders,
    selectedSttProvider,
    onSetSelectedSttProvider,
    allTtsProviders,
    customTtsProviders,
    selectedTtsProvider,
    onSetSelectedTtsProvider,
    screenshotConfiguration,
    setScreenshotConfiguration,
    customizable,
    toggleAppIconVisibility,
    toggleAlwaysOnTop,
    toggleAutostart,
    loadData,
    pluelyApiEnabled,
    setPluelyApiEnabled,
    hasActiveLicense,
    setHasActiveLicense,
    getActiveLicenseStatus,
    selectedAudioDevices,
    setSelectedAudioDevices,
    includeMicInSystemAudio,
    setIncludeMicInSystemAudio,
    setCursorType,
    supportsImages,
    setSupportsImages,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

// Create a hook to access the context
export const useApp = () => {
  const context = useContext(AppContext);

  if (!context) {
    throw new Error("useApp must be used within a AppProvider");
  }

  return context;
};
