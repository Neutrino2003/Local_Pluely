import { Button, Header, Input, Selection } from "@/components";
import { UseSettingsReturn } from "@/types";
import curl2Json, { ResultJSON } from "@bany/curl-to-json";
import { CheckIcon, TrashIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export const Providers = ({
  allAiProviders,
  selectedAIProvider,
  onSetSelectedAIProvider,
  variables,
}: UseSettingsReturn) => {
  const [localSelectedProvider, setLocalSelectedProvider] =
    useState<ResultJSON | null>(null);
  const [pendingApiKey, setPendingApiKey] = useState<string | null>(null);
  // Pending local edits for non-API-key variables: key → pending string or null
  const [pendingVars, setPendingVars] = useState<Record<string, string | null>>({});
  const prevProviderRef = useRef<string>("");

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
  }, [selectedAIProvider?.provider]);

  const findKeyAndValue = (key: string) => {
    return variables?.find((v) => v?.key === key);
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

  return (
    <div className="space-y-3">
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
          title={`Method: ${localSelectedProvider?.method || "Invalid"
            }, Endpoint: ${localSelectedProvider?.url || "Invalid"}`}
          description={`If you want to use different url or method, you can always create a custom provider.`}
        />
      ) : null}

      {findKeyAndValue("api_key") ? (
        <div className="space-y-2">
          <Header
            title="API Key"
            description={`Enter your ${allAiProviders?.find(
              (p) => p?.id === selectedAIProvider?.provider
            )?.isCustom
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
    </div>
  );
};
