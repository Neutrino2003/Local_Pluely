import { Button, Header, Input, Selection } from "@/components";
import { UseSettingsReturn } from "@/types";
import curl2Json, { ResultJSON } from "@bany/curl-to-json";
import { invoke } from "@tauri-apps/api/core";
import {
  CheckIcon,
  DownloadIcon,
  Loader2Icon,
  RefreshCwIcon,
  TrashIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

interface WhisperModelStatus {
  id: string;
  name: string;
  file_name: string;
  size_mb: number;
  downloaded: boolean;
  local_path: string | null;
}

const LOCAL_WHISPER_PROVIDER_ID = "local-whisper";

export const Providers = ({
  allSttProviders,
  selectedSttProvider,
  onSetSelectedSttProvider,
  sttVariables,
}: UseSettingsReturn) => {
  const [localSelectedProvider, setLocalSelectedProvider] =
    useState<ResultJSON | null>(null);
  const [whisperModels, setWhisperModels] = useState<WhisperModelStatus[]>([]);
  const [whisperModelsLoading, setWhisperModelsLoading] = useState(false);
  const [downloadingModelId, setDownloadingModelId] = useState<string | null>(null);
  const [whisperModelError, setWhisperModelError] = useState<string | null>(null);
  const [pendingApiKey, setPendingApiKey] = useState<string | null>(null);
  // Pending local edits for non-API-key variables: key → pending string or null
  const [pendingVars, setPendingVars] = useState<Record<string, string | null>>({});
  const prevProviderRef = useRef<string>("");

  const isLocalWhisperSelected =
    selectedSttProvider?.provider === LOCAL_WHISPER_PROVIDER_ID;

  const parseProviderCurl = (curl: string) => {
    try {
      return curl2Json(curl) as ResultJSON;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    const currentProvider = selectedSttProvider?.provider ?? "";
    if (currentProvider) {
      const provider = allSttProviders?.find((p) => p?.id === currentProvider);
      if (provider) {
        const json = parseProviderCurl(provider?.curl);
        setLocalSelectedProvider(json);
      }
    } else {
      setLocalSelectedProvider(null);
    }
    // Reset all pending state whenever the provider changes
    if (prevProviderRef.current !== currentProvider) {
      setPendingApiKey(null);
      setPendingVars({});
      prevProviderRef.current = currentProvider;
    }
  }, [selectedSttProvider?.provider]);

  const findKeyAndValue = (key: string) => {
    return sttVariables?.find((v) => v?.key === key);
  };

  const setProviderVariable = (key: string, value: string) => {
    if (!selectedSttProvider || !key) return;

    onSetSelectedSttProvider({
      ...selectedSttProvider,
      variables: {
        ...selectedSttProvider.variables,
        [key]: value,
      },
    });
  };

  const loadWhisperModels = async () => {
    if (!isLocalWhisperSelected) return;

    setWhisperModelsLoading(true);
    setWhisperModelError(null);
    try {
      const models = await invoke<WhisperModelStatus[]>("list_whisper_models");
      setWhisperModels(models);

      const modelVariable = findKeyAndValue("model");
      if (!modelVariable?.key || models.length === 0) return;

      const currentModel = selectedSttProvider?.variables?.[modelVariable.key];
      if (!currentModel) {
        setProviderVariable(modelVariable.key, models[0].id);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load models";
      setWhisperModelError(message);
    } finally {
      setWhisperModelsLoading(false);
    }
  };

  const handleDownloadModel = async (modelId: string) => {
    if (!modelId) return;

    setDownloadingModelId(modelId);
    setWhisperModelError(null);
    try {
      await invoke("download_whisper_model", { modelId });
      await loadWhisperModels();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to download model";
      setWhisperModelError(message);
    } finally {
      setDownloadingModelId(null);
    }
  };

  useEffect(() => {
    if (isLocalWhisperSelected) {
      loadWhisperModels();
    } else {
      setWhisperModels([]);
      setWhisperModelError(null);
      setDownloadingModelId(null);
    }
  }, [isLocalWhisperSelected]);

  // ── API Key helpers ──────────────────────────────────────────
  const getApiKeyValue = () => {
    const apiKeyVar = findKeyAndValue("api_key");
    if (!apiKeyVar || !selectedSttProvider?.variables) return "";
    return selectedSttProvider?.variables?.[apiKeyVar.key] || "";
  };

  const displayApiKey = pendingApiKey !== null ? pendingApiKey : getApiKeyValue();
  const hasUnsavedKey = pendingApiKey !== null && pendingApiKey !== getApiKeyValue();
  const isDisplayKeyEmpty = !displayApiKey.trim();

  const handleSaveApiKey = () => {
    const apiKeyVar = findKeyAndValue("api_key");
    if (!apiKeyVar || !selectedSttProvider || pendingApiKey === null) return;
    onSetSelectedSttProvider({
      ...selectedSttProvider,
      variables: {
        ...selectedSttProvider.variables,
        [apiKeyVar.key]: pendingApiKey,
      },
    });
    setPendingApiKey(null);
    toast.success("API key saved");
  };

  const handleClearApiKey = () => {
    const apiKeyVar = findKeyAndValue("api_key");
    if (!apiKeyVar || !selectedSttProvider) return;
    onSetSelectedSttProvider({
      ...selectedSttProvider,
      variables: {
        ...selectedSttProvider.variables,
        [apiKeyVar.key]: "",
      },
    });
    setPendingApiKey(null);
    toast.success("API key removed");
  };

  // ── Generic variable helpers ─────────────────────────────────
  const getSavedVarValue = (key: string) => {
    if (!selectedSttProvider?.variables) return "";
    return selectedSttProvider.variables[key] || "";
  };

  const getDisplayVarValue = (key: string) => {
    const pending = pendingVars[key];
    return pending !== null && pending !== undefined
      ? pending
      : getSavedVarValue(key);
  };

  const hasUnsavedVar = (key: string) => {
    const pending = pendingVars[key];
    return (
      pending !== null &&
      pending !== undefined &&
      pending !== getSavedVarValue(key)
    );
  };

  const handleSaveVar = (key: string) => {
    const pending = pendingVars[key];
    if (pending === null || pending === undefined || !selectedSttProvider) return;
    setProviderVariable(key, pending);
    setPendingVars((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    toast.success("Setting saved");
  };

  const handleClearVar = (key: string) => {
    if (!selectedSttProvider) return;
    setProviderVariable(key, "");
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
          title="Select STT Provider"
          description="Select your preferred STT service provider or custom providers to get started."
        />
        <Selection
          selected={selectedSttProvider?.provider}
          options={allSttProviders?.map((provider) => {
            const json = parseProviderCurl(provider?.curl);
            return {
              label: provider?.isCustom
                ? json?.url || provider?.id || "Custom Provider"
                : provider?.id || "Custom Provider",
              value: provider?.id || "Custom Provider",
              isCustom: provider?.isCustom,
            };
          })}
          placeholder="Choose your STT provider"
          onChange={(value) => {
            if (value === LOCAL_WHISPER_PROVIDER_ID) {
              onSetSelectedSttProvider({
                provider: value,
                variables: { model: "base" },
              });
            } else {
              onSetSelectedSttProvider({ provider: value, variables: {} });
            }
            const displayName =
              allSttProviders?.find((p) => p?.id === value)?.id ?? value;
            toast.success(`STT provider set to ${displayName}`);
          }}
        />
      </div>

      {localSelectedProvider ? (
        <Header
          title={`Method: ${localSelectedProvider?.method || "Invalid"}, Endpoint: ${localSelectedProvider?.url || "Invalid"}`}
          description={`If you want to use different url or method, you can always create a custom provider.`}
        />
      ) : null}

      {findKeyAndValue("api_key") ? (
        <div className="space-y-2">
          <Header
            title="API Key"
            description={`Enter your ${allSttProviders?.find(
              (p) => p?.id === selectedSttProvider?.provider
            )?.isCustom
                ? "Custom Provider"
                : selectedSttProvider?.provider
              } API key to authenticate and access STT models. Your key is stored locally and never shared.`}
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
        {sttVariables
          ?.filter(
            (variable) => variable?.key !== findKeyAndValue("api_key")?.key
          )
          .map((variable) => {
            if (!variable?.key) return null;

            const savedModelId = getSavedVarValue(variable.key);
            const selectedWhisperModel = whisperModels.find(
              (model) => model.id === savedModelId
            );
            const downloadedCount = whisperModels.filter(
              (model) => model.downloaded
            ).length;

            // Local Whisper model picker — uses Selection (instant save, no pending)
            if (isLocalWhisperSelected && variable?.key === "model") {
              return (
                <div className="space-y-2" key={variable?.key}>
                  <Header
                    title="Whisper Model"
                    description="Select a local Whisper model and download it if needed."
                  />
                  <Selection
                    selected={savedModelId}
                    options={whisperModels.map((model) => ({
                      value: model.id,
                      label: `${model.name} (${model.id}) - ${model.size_mb} MB${model.downloaded ? " - Downloaded" : ""
                        }`,
                    }))}
                    placeholder={
                      whisperModelsLoading
                        ? "Loading Whisper models..."
                        : "Choose Whisper model"
                    }
                    isLoading={whisperModelsLoading}
                    disabled={whisperModels.length === 0}
                    onChange={(value) => {
                      if (!variable?.key) return;
                      setProviderVariable(variable.key, value);
                    }}
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="h-11"
                      onClick={loadWhisperModels}
                      disabled={whisperModelsLoading}
                    >
                      <RefreshCwIcon
                        className={`h-4 w-4 mr-2 ${whisperModelsLoading ? "animate-spin" : ""
                          }`}
                      />
                      Refresh
                    </Button>
                    <Button
                      className="h-11"
                      disabled={
                        !selectedWhisperModel ||
                        selectedWhisperModel.downloaded ||
                        downloadingModelId !== null
                      }
                      onClick={() => handleDownloadModel(savedModelId)}
                    >
                      {downloadingModelId === savedModelId ? (
                        <>
                          <Loader2Icon className="h-4 w-4 mr-2 animate-spin" />
                          Downloading...
                        </>
                      ) : (
                        <>
                          <DownloadIcon className="h-4 w-4 mr-2" />
                          {selectedWhisperModel?.downloaded
                            ? "Downloaded"
                            : "Download"}
                        </>
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Downloaded: {downloadedCount}/{whisperModels.length} models
                  </p>
                  {selectedWhisperModel?.downloaded &&
                    selectedWhisperModel.local_path ? (
                    <p className="text-xs text-emerald-600">
                      Model file: {selectedWhisperModel.local_path}
                    </p>
                  ) : null}
                  {whisperModelError ? (
                    <p className="text-xs text-red-500">{whisperModelError}</p>
                  ) : null}
                </div>
              );
            }

            // All other text variables — pending/save pattern
            const key = variable.key;
            const displayValue = getDisplayVarValue(key);
            const unsaved = hasUnsavedVar(key);
            const isEmpty = !getSavedVarValue(key).trim();
            const providerLabel = allSttProviders?.find(
              (p) => p?.id === selectedSttProvider?.provider
            )?.isCustom
              ? "Custom Provider"
              : selectedSttProvider?.provider;

            return (
              <div className="space-y-1" key={key}>
                <Header
                  title={variable?.value || ""}
                  description={`Add your preferred ${key?.replace(/_/g, " ")} for ${providerLabel}`}
                />
                <div className="flex gap-2">
                  <Input
                    placeholder={`Enter ${providerLabel} ${key?.replace(/_/g, " ") || "value"
                      }`}
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
