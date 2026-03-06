import { useApp } from "@/hooks";
import { SettingsPanel } from "@/pages/app/components/speech/SettingsPanel";
import { Header } from "@/components";

export const SystemAudioSettings = () => {
  const { systemAudio } = useApp();

  return (
    <div className="space-y-4 pb-4">
      <Header
        title="System Audio"
        description="Configure voice activity detection and audio contexts."
      />
      <div className="bg-background rounded-lg border p-4">
        <SettingsPanel
          vadConfig={systemAudio.vadConfig}
          onUpdateVadConfig={systemAudio.updateVadConfiguration}
          useSystemPrompt={systemAudio.useSystemPrompt}
          setUseSystemPrompt={systemAudio.setUseSystemPrompt}
          contextContent={systemAudio.contextContent}
          setContextContent={systemAudio.setContextContent}
          includeMicInSystemAudio={systemAudio.includeMicInSystemAudio}
          setIncludeMicInSystemAudio={systemAudio.setIncludeMicInSystemAudio}
        />
      </div>
    </div>
  );
};
