import { TYPE_PROVIDER } from "./provider.type";
import { ScreenshotConfig, ScreenshotMode } from "./settings";

export interface UseSettingsReturn {
  screenshotConfiguration: ScreenshotConfig;
  setScreenshotConfiguration: (config: ScreenshotConfig) => void;
  handleScreenshotModeChange: (value: ScreenshotMode) => void;
  handleScreenshotPromptChange: (value: string) => void;
  handleScreenshotEnabledChange: (enabled: boolean) => void;
  allAiProviders: TYPE_PROVIDER[];
  allSttProviders: TYPE_PROVIDER[];
  selectedAIProvider: { provider: string; variables: Record<string, string> };
  selectedSttProvider: {
    provider: string;
    variables: Record<string, string>;
  };
  onSetSelectedAIProvider: (provider: {
    provider: string;
    variables: Record<string, string>;
  }) => void;
  onSetSelectedSttProvider: (provider: {
    provider: string;
    variables: Record<string, string>;
  }) => void;
  fallbackAIProvider: { provider: string; variables: Record<string, string> };
  onSetFallbackAIProvider: (sel: { provider: string; variables: Record<string, string> }) => void;
  fallbackTimeoutMs: number;
  setFallbackTimeoutMs: (ms: number) => void;
  handleDeleteAllChatsConfirm: () => void;
  showDeleteConfirmDialog: boolean;
  setShowDeleteConfirmDialog: React.Dispatch<React.SetStateAction<boolean>>;
  variables: { key: string; value: string }[];
  fallbackVariables: { key: string; value: string }[];
  sttVariables: { key: string; value: string }[];
  hasActiveLicense: boolean;
}
