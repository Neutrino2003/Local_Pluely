import { ScreenshotConfig, TYPE_PROVIDER } from "@/types";
import { CursorType, CustomizableState } from "@/lib/storage";

export type IContextType = {
  systemPrompt: string;
  setSystemPrompt: (prompt: string) => void;
  allAiProviders: TYPE_PROVIDER[];
  customAiProviders: TYPE_PROVIDER[];
  selectedAIProvider: {
    provider: string;
    variables: Record<string, string>;
  };
  onSetSelectedAIProvider: ({
    provider,
    variables,
  }: {
    provider: string;
    variables: Record<string, string>;
  }) => void;
  allSttProviders: TYPE_PROVIDER[];
  customSttProviders: TYPE_PROVIDER[];
  selectedSttProvider: {
    provider: string;
    variables: Record<string, string>;
  };
  onSetSelectedSttProvider: ({
    provider,
    variables,
  }: {
    provider: string;
    variables: Record<string, string>;
  }) => void;
  allTtsProviders: TYPE_PROVIDER[];
  customTtsProviders: TYPE_PROVIDER[];
  selectedTtsProvider: {
    provider: string;
    variables: Record<string, string>;
  };
  onSetSelectedTtsProvider: ({
    provider,
    variables,
  }: {
    provider: string;
    variables: Record<string, string>;
  }) => void;
  screenshotConfiguration: ScreenshotConfig;
  setScreenshotConfiguration: (config: ScreenshotConfig) => void;
  customizable: CustomizableState;
  toggleAppIconVisibility: (isVisible: boolean) => Promise<void>;
  toggleAlwaysOnTop: (isEnabled: boolean) => Promise<void>;
  toggleAutostart: (isEnabled: boolean) => Promise<void>;
  loadData: () => void;
  pluelyApiEnabled: boolean;
  setPluelyApiEnabled: (enabled: boolean) => Promise<void>;
  hasActiveLicense: boolean;
  setHasActiveLicense: (value: boolean) => void;
  getActiveLicenseStatus: () => Promise<void>;
  selectedAudioDevices: {
    input: { id: string; name: string };
    output: { id: string; name: string };
  };
  setSelectedAudioDevices: (devices: {
    input: { id: string; name: string };
    output: { id: string; name: string };
  }) => void;
  includeMicInSystemAudio: boolean;
  setIncludeMicInSystemAudio: (value: boolean) => void;
  setCursorType: (type: CursorType) => void;
  supportsImages: boolean;
  setSupportsImages: (value: boolean) => void;
};
