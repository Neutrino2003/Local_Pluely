import { Button, Header, Input, Selection } from "@/components";
import { UseSettingsReturn } from "@/types";
import curl2Json, { ResultJSON } from "@bany/curl-to-json";
import { CheckIcon, ShieldAlertIcon, TrashIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export const Providers = ({
  allAiProviders,
  selectedAIProvider,
  onSetSelectedAIProvider,
  fallbackAIProvider,
  onSetFallbackAIProvider,
  fallbackTimeoutMs,
  setFallbackTimeoutMs,
  variables,
  fallbackVariables,
}: UseSettingsReturn) => {
  const [localSelectedProvider, setLocalSelectedProvider] =
    useState<ResultJSON | null>(null);
  const [pendingApiKey, setPendingApiKey] = useState<string | null>(null);
  const [pendingVars, setPendingVars] = useState<Record<string, string | null>>({});
  const prevProviderRef = useRef<string>("");

  const [fallbackPendingApiKey, setFallbackPendingApiKey] = useState<string | null>(null);
  const [fallbackPendingVars, setFallbackPendingVars] = useState<Record<string, string | null>>({});
  const prevFallbackProviderRef = useRef<string>("");

  useEffect(() => {
    const currentProvider = selectedAIProvider?.provider ?? "";

    if (currentProvider) {
      const provider = allAiProviders?.find((p) => p?.id === currentProvider);
      if (provider?.curl) {
        try {
          const json = curl2Json(provider.curl);
          setLocalSelectedProvider(json as ResultJSON);
        } catch {
          setLocalSelectedProvider(null);
        }
      } else {
        setLocalSelectedProvider(null);
      }
    }

    // Reset all pending state whenever the provider changes
    if (prevProviderRef.current !== currentProvider) {
      setPendingApiKey(null);
      setPendingVars({});
      prevProviderRef.current = currentProvider;
    }
  }, [selectedAIProvider?.provider, allAiProviders]);

  useEffect(() => {
    const currentFallback = fallbackAIProvider?.provider ?? "";
    if (prevFallbackProviderRef.current !== currentFallback) {
      setFallbackPendingApiKey(null);
      setFallbackPendingVars({});
      prevFallbackProviderRef.current = currentFallback;
    }
  }, [fallbackAIProvider?.provider]);

  const findKeyAndValue = (key: string) => {
    return variables?.find((v) => v?.key === key);
  };
  const findFallbackKeyAndValue = (key: string) => {
    return fallbackVariables?.find((v) => v?.key === key);
  };

  // ── API Key helpers ──────────────────────────────────────────
  const getSavedApiKey = () => {
    const apiKeyVar = findKeyAndValue("api_key");
    if (!apiKeyVar || !selectedAIProvider?.variables) return "";
    return selectedAIProvider?.variables?.[apiKeyVar.key] || "";
  };

  const displayApiKey = pendingApiKey !== null ? pendingApiKey : getSavedApiKey();
  const hasUnsavedKey = pendingApiKey !== null && pendingApiKey !== getSavedApiKey();
  const isDisplayKeyEmpty = !displayApiKey.trim();

  const handleSaveApiKey = () => {
    const apiKeyVar = findKeyAndValue("api_key");
    if (!apiKeyVar || !selectedAIProvider || pendingApiKey === null) return;
    onSetSelectedAIProvider({
      ...selectedAIProvider,
      variables: {
        ...selectedAIProvider.variables,
        [apiKeyVar.key]: pendingApiKey,
      },
    });
    setPendingApiKey(null);
    toast.success("API key saved");
  };

  const handleClearApiKey = () => {
    const apiKeyVar = findKeyAndValue("api_key");
    if (!apiKeyVar || !selectedAIProvider) return;
    onSetSelectedAIProvider({
      ...selectedAIProvider,
      variables: {
        ...selectedAIProvider.variables,
        [apiKeyVar.key]: "",
      },
    });
    setPendingApiKey(null);
    toast.success("API key removed");
  };

  // ── Generic variable helpers ─────────────────────────────────
  const getSavedVarValue = (key: string) => {
    if (!selectedAIProvider?.variables) return "";
    return selectedAIProvider.variables[key] || "";
  };

  const getDisplayVarValue = (key: string) => {
    const pending = pendingVars[key];
    return pending !== null && pending !== undefined
      ? pending
      : getSavedVarValue(key);
  };

  const hasUnsavedVar = (key: string) => {
    const pending = pendingVars[key];
    return pending !== null && pending !== undefined && pending !== getSavedVarValue(key);
  };

  const handleSaveVar = (key: string) => {
    const pending = pendingVars[key];
    if (pending === null || pending === undefined || !selectedAIProvider) return;
    onSetSelectedAIProvider({
      ...selectedAIProvider,
      variables: {
        ...selectedAIProvider.variables,
        [key]: pending,
      },
    });
    setPendingVars((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    toast.success("Setting saved");
  };

  const handleClearVar = (key: string) => {
    if (!selectedAIProvider) return;
    onSetSelectedAIProvider({
      ...selectedAIProvider,
      variables: {
        ...selectedAIProvider.variables,
        [key]: "",
      },
    });
    setPendingVars((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    toast.success("Setting cleared");
  };

  // ── Fallback API Key helpers ─────────────────────────────────
  const getSavedFallbackApiKey = () => {
    const apiKeyVar = findFallbackKeyAndValue("api_key");
    if (!apiKeyVar || !fallbackAIProvider?.variables) return "";
    return fallbackAIProvider?.variables?.[apiKeyVar.key] || "";
  };

  const displayFallbackApiKey = fallbackPendingApiKey !== null ? fallbackPendingApiKey : getSavedFallbackApiKey();
  const hasUnsavedFallbackKey = fallbackPendingApiKey !== null && fallbackPendingApiKey !== getSavedFallbackApiKey();
  const isDisplayFallbackKeyEmpty = !displayFallbackApiKey.trim();

  const handleSaveFallbackApiKey = () => {
    const apiKeyVar = findFallbackKeyAndValue("api_key");
    if (!apiKeyVar || !fallbackAIProvider || fallbackPendingApiKey === null) return;
    onSetFallbackAIProvider({
      ...fallbackAIProvider,
      variables: {
        ...fallbackAIProvider.variables,
        [apiKeyVar.key]: fallbackPendingApiKey,
      },
    });
    setFallbackPendingApiKey(null);
    toast.success("Fallback API key saved");
  };

  const handleClearFallbackApiKey = () => {
    const apiKeyVar = findFallbackKeyAndValue("api_key");
    if (!apiKeyVar || !fallbackAIProvider) return;
    onSetFallbackAIProvider({
      ...fallbackAIProvider,
      variables: {
        ...fallbackAIProvider.variables,
        [apiKeyVar.key]: "",
      },
    });
    setFallbackPendingApiKey(null);
    toast.success("Fallback API key removed");
  };

  // ── Fallback generic variable helpers ────────────────────────
  const getSavedFallbackVarValue = (key: string) => {
    if (!fallbackAIProvider?.variables) return "";
    return fallbackAIProvider.variables[key] || "";
  };

  const getDisplayFallbackVarValue = (key: string) => {
    const pending = fallbackPendingVars[key];
    return pending !== null && pending !== undefined
      ? pending
      : getSavedFallbackVarValue(key);
  };

  const hasUnsavedFallbackVar = (key: string) => {
    const pending = fallbackPendingVars[key];
    return pending !== null && pending !== undefined && pending !== getSavedFallbackVarValue(key);
  };

  const handleSaveFallbackVar = (key: string) => {
    const pending = fallbackPendingVars[key];
    if (pending === null || pending === undefined || !fallbackAIProvider) return;
    onSetFallbackAIProvider({
      ...fallbackAIProvider,
      variables: {
        ...fallbackAIProvider.variables,
        [key]: pending,
      },
    });
    setFallbackPendingVars((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    toast.success("Fallback setting saved");
  };

  const handleClearFallbackVar = (key: string) => {
    if (!fallbackAIProvider) return;
    onSetFallbackAIProvider({
      ...fallbackAIProvider,
      variables: {
        ...fallbackAIProvider.variables,
        [key]: "",
      },
    });
    setFallbackPendingVars((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    toast.success("Fallback setting cleared");
  };

  // ── Fallback timeout helpers ──────────────────────────────────
  const timeoutSeconds = Math.round(fallbackTimeoutMs / 1000);

  return (
    <div className="space-y-3">
      {/* ── Primary Provider ─────────────────────────────────── */}
      <div className="space-y-2">
        <Header
          title="Select AI Provider"
          description="Select your preferred AI service provider or custom providers to get started."
        />
        <Selection
          selected={selectedAIProvider?.provider}
          options={allAiProviders?.map((provider) => {
            let label = provider?.id || "Custom Provider";
            if (provider?.isCustom && provider?.curl) {
              try {
                const json = curl2Json(provider.curl);
                label = json?.url || "Custom Provider";
              } catch {
                label = "Custom Provider";
              }
            }
            return {
              label,
              value: provider?.id || "Custom Provider",
              isCustom: provider?.isCustom,
            };
          })}
          placeholder="Choose your AI provider"
          onChange={(value) => {
            onSetSelectedAIProvider({ provider: value, variables: {} });
            const displayName =
              allAiProviders?.find((p) => p?.id === value)?.id ?? value;
            toast.success(`AI provider set to ${displayName}`);
          }}
        />
      </div>

      {localSelectedProvider ? (
        <Header
          title={`Method: ${localSelectedProvider?.method || "Invalid"}, Endpoint: ${localSelectedProvider?.url || "Invalid"}`}
          description="If you want to use a different URL or method, create a custom provider."
        />
      ) : null}

      {/* ── API Key ──────────────────────────────────────────── */}
      {findKeyAndValue("api_key") ? (
        <div className="space-y-2">
          <Header
            title="API Key"
            description={`Enter your ${allAiProviders?.find((p) => p?.id === selectedAIProvider?.provider)
              ?.isCustom
              ? "Custom Provider"
              : selectedAIProvider?.provider
              } API key to authenticate and access AI models. Your key is stored locally and never shared.`}
          />
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder="Enter API key and click Save"
                value={displayApiKey}
                onChange={(value) => {
                  const v = typeof value === "string" ? value : value.target.value;
                  setPendingApiKey(v);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && hasUnsavedKey) handleSaveApiKey();
                }}
                disabled={false}
                className="flex-1 h-11 border-1 border-input/50 focus:border-primary/50 transition-colors"
              />
              {hasUnsavedKey ? (
                <Button
                  onClick={handleSaveApiKey}
                  size="icon"
                  className="shrink-0 h-11 w-11"
                  title="Save API Key"
                >
                  <CheckIcon className="h-4 w-4" />
                </Button>
              ) : !isDisplayKeyEmpty ? (
                <Button
                  onClick={handleClearApiKey}
                  size="icon"
                  variant="destructive"
                  className="shrink-0 h-11 w-11"
                  title="Remove API Key"
                >
                  <TrashIcon className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
            {hasUnsavedKey && (
              <p className="text-xs text-amber-500">
                Unsaved — press Enter or click ✓ to save.
              </p>
            )}
          </div>
        </div>
      ) : null}

      {/* ── Other Variables ──────────────────────────────────── */}
      <div className="space-y-4 mt-2">
        {(variables || [])
          .filter(
            (variable) => variable?.key !== findKeyAndValue("api_key")?.key
          )
          .map((variable) => {
            if (!variable?.key) return null;
            const key = variable.key;
            const displayValue = getDisplayVarValue(key);
            const unsaved = hasUnsavedVar(key);
            const isEmpty = !getSavedVarValue(key).trim();
            const providerLabel = allAiProviders?.find(
              (p) => p?.id === selectedAIProvider?.provider
            )?.isCustom
              ? "Custom Provider"
              : selectedAIProvider?.provider;

            return (
              <div className="space-y-1" key={key}>
                <Header
                  title={variable?.value || ""}
                  description={`Add your preferred ${key?.replace(/_/g, " ")} for ${providerLabel}`}
                />
                <div className="flex gap-2">
                  <Input
                    placeholder={`Enter ${providerLabel} ${key?.replace(/_/g, " ") || "value"}`}
                    value={displayValue}
                    onChange={(e) => {
                      const v = typeof e === "string" ? e : e.target.value;
                      setPendingVars((prev) => ({ ...prev, [key]: v }));
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && unsaved) handleSaveVar(key);
                    }}
                    className="flex-1 h-11 border-1 border-input/50 focus:border-primary/50 transition-colors"
                  />
                  {unsaved ? (
                    <Button
                      onClick={() => handleSaveVar(key)}
                      size="icon"
                      className="shrink-0 h-11 w-11"
                      title={`Save ${key?.replace(/_/g, " ")}`}
                    >
                      <CheckIcon className="h-4 w-4" />
                    </Button>
                  ) : !isEmpty ? (
                    <Button
                      onClick={() => handleClearVar(key)}
                      size="icon"
                      variant="destructive"
                      className="shrink-0 h-11 w-11"
                      title={`Clear ${key?.replace(/_/g, " ")}`}
                    >
                      <TrashIcon className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
                {unsaved && (
                  <p className="text-xs text-amber-500">
                    Unsaved — press Enter or click ✓ to save.
                  </p>
                )}
              </div>
            );
          })}
      </div>

      {/* ── Fallback Provider ─────────────────────────────────── */}
      {selectedAIProvider?.provider && (
        <div className="space-y-3 pt-3 border-t border-border/40">
          <div className="flex items-center gap-1.5">
            <ShieldAlertIcon className="h-4 w-4 text-amber-500 shrink-0" />
            <Header
              title="Fallback Provider"
              description="If the primary provider is slow or errors out, Pluely automatically retries with this provider. Leave empty to disable."
            />
          </div>

          <Selection
            selected={fallbackAIProvider?.provider || "none"}
            options={[
              { label: "None (disabled)", value: "none" },
              ...(allAiProviders ?? [])
                .map((provider) => {
                  let label = provider?.id || "Custom Provider";
                  if (provider?.isCustom && provider?.curl) {
                    try {
                      const json = curl2Json(provider.curl);
                      label = json?.url || "Custom Provider";
                    } catch {
                      label = "Custom Provider";
                    }
                  }
                  return {
                    label,
                    value: provider?.id || "unknown",
                    isCustom: provider?.isCustom,
                  };
                }),
            ]}
            placeholder="Choose fallback provider"
            onChange={(rawVal) => {
              const value = rawVal === "none" ? "" : rawVal;
              onSetFallbackAIProvider({ provider: value, variables: {} });
              toast.success(
                value
                  ? `Fallback provider set to ${value}`
                  : "Fallback provider disabled"
              );
            }}
          />

          {fallbackAIProvider?.provider && (
            <div className="space-y-4">
              <div className="space-y-2 mt-2 border-b border-border/20 pb-4">
                <div className="flex items-center justify-between">
                  <Header
                    title="Switch timeout"
                    description="How long to wait for the primary before switching to fallback."
                  />
                  <span className="text-xs font-mono text-muted-foreground shrink-0 ml-3 bg-muted px-2 py-0.5 rounded">
                    {timeoutSeconds}s
                  </span>
                </div>
                <input
                  id="fallback-timeout-slider"
                  type="range"
                  min={5}
                  max={120}
                  step={5}
                  value={timeoutSeconds}
                  onChange={(e) =>
                    setFallbackTimeoutMs(Number(e.target.value) * 1000)
                  }
                  className="w-full h-1.5 mb-2 mt-4 accent-primary cursor-pointer border-none bg-border rounded-full appearance-none outline-none overflow-hidden"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground/70 tracking-wide font-medium relative -top-1">
                  <span>5s</span>
                  <span>120s</span>
                </div>
              </div>

              {/* ── Fallback API Key ─────────────────────────────────── */}
              {findFallbackKeyAndValue("api_key") ? (
                <div className="space-y-2">
                  <Header
                    title="Fallback API Key"
                    description={`Enter API key for the fallback provider (${allAiProviders?.find((p) => p?.id === fallbackAIProvider?.provider)?.isCustom
                      ? "Custom Provider"
                      : fallbackAIProvider?.provider
                      }).`}
                  />
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Input
                        type="password"
                        placeholder="Enter API key and click Save"
                        value={displayFallbackApiKey}
                        onChange={(value) => {
                          const v = typeof value === "string" ? value : value.target.value;
                          setFallbackPendingApiKey(v);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && hasUnsavedFallbackKey) handleSaveFallbackApiKey();
                        }}
                        disabled={false}
                        className="flex-1 h-10 text-sm border-1 border-input/50 focus:border-primary/50 transition-colors"
                      />
                      {hasUnsavedFallbackKey ? (
                        <Button
                          onClick={handleSaveFallbackApiKey}
                          size="icon"
                          className="shrink-0 h-10 w-10"
                          title="Save API Key"
                        >
                          <CheckIcon className="h-4 w-4" />
                        </Button>
                      ) : !isDisplayFallbackKeyEmpty ? (
                        <Button
                          onClick={handleClearFallbackApiKey}
                          size="icon"
                          variant="destructive"
                          className="shrink-0 h-10 w-10"
                          title="Remove API Key"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                    {hasUnsavedFallbackKey && (
                      <p className="text-[10px] text-amber-500 font-medium">
                        Unsaved — press Enter or click ✓ to save.
                      </p>
                    )}
                  </div>
                </div>
              ) : null}

              {/* ── Fallback Other Variables ─────────────────────────── */}
              {(fallbackVariables || [])
                .filter(
                  (variable) => variable?.key !== findFallbackKeyAndValue("api_key")?.key
                )
                .map((variable) => {
                  if (!variable?.key) return null;
                  const key = variable.key;
                  const displayValue = getDisplayFallbackVarValue(key);
                  const unsaved = hasUnsavedFallbackVar(key);
                  const isEmpty = !getSavedFallbackVarValue(key).trim();
                  const providerLabel = allAiProviders?.find(
                    (p) => p?.id === fallbackAIProvider?.provider
                  )?.isCustom
                    ? "Custom Provider"
                    : fallbackAIProvider?.provider;

                  return (
                    <div className="space-y-1" key={`fallback-${key}`}>
                      <Header
                        title={variable?.value || ""}
                        description={`Fallback ${key?.replace(/_/g, " ")} for ${providerLabel}`}
                      />
                      <div className="flex gap-2">
                        <Input
                          placeholder={`Enter ${providerLabel} ${key?.replace(/_/g, " ") || "value"}`}
                          value={displayValue}
                          onChange={(e) => {
                            const v = typeof e === "string" ? e : e.target.value;
                            setFallbackPendingVars((prev) => ({ ...prev, [key]: v }));
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && unsaved) handleSaveFallbackVar(key);
                          }}
                          className="flex-1 h-10 text-sm border-1 border-input/50 focus:border-primary/50 transition-colors"
                        />
                        {unsaved ? (
                          <Button
                            onClick={() => handleSaveFallbackVar(key)}
                            size="icon"
                            className="shrink-0 h-10 w-10"
                            title={`Save ${key?.replace(/_/g, " ")}`}
                          >
                            <CheckIcon className="h-4 w-4" />
                          </Button>
                        ) : !isEmpty ? (
                          <Button
                            onClick={() => handleClearFallbackVar(key)}
                            size="icon"
                            variant="destructive"
                            className="shrink-0 h-10 w-10"
                            title={`Clear ${key?.replace(/_/g, " ")}`}
                          >
                            <TrashIcon className="h-4 w-4" />
                          </Button>
                        ) : null}
                      </div>
                      {unsaved && (
                        <p className="text-[10px] text-amber-500 font-medium">
                          Unsaved — press Enter or click ✓ to save.
                        </p>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
