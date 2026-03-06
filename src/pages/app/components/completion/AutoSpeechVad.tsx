import { fetchSTT } from "@/lib";
import { UseCompletionReturn } from "@/types";
import { useMicVAD } from "@ricky0123/vad-react";
import { LoaderIcon, MicIcon, MicOffIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components";
import { useApp } from "@/contexts";
import { floatArrayToWav } from "@/lib/utils";
import { shouldUsePluelyAPI } from "@/lib/functions/pluely.api";
import { cn } from "@/lib/utils";

interface AutoSpeechVADProps {
  submit: UseCompletionReturn["submit"];
  setState: UseCompletionReturn["setState"];
  setEnableVAD: UseCompletionReturn["setEnableVAD"];
  microphoneDeviceId?: string;
}

const AutoSpeechVADInternal = ({
  submit,
  setState,
  setEnableVAD,
  microphoneDeviceId,
}: AutoSpeechVADProps) => {
  const [isTranscribing, setIsTranscribing] = useState(false);
  const { selectedSttProvider, allSttProviders } = useApp();

  const audioConstraints: MediaTrackConstraints =
    microphoneDeviceId && microphoneDeviceId !== "default"
      ? { deviceId: { exact: microphoneDeviceId } }
      : {};

  const vad = useMicVAD({
    userSpeakingThreshold: 0.6,
    startOnLoad: true,
    additionalAudioConstraints: audioConstraints,
    onSpeechEnd: async (audio) => {
      try {
        // convert float32array to blob
        const audioBlob = floatArrayToWav(audio, 16000);

        let transcription: string;
        const usePluelyAPI = await shouldUsePluelyAPI();

        // Check if we have a configured speech provider
        if (!selectedSttProvider.provider && !usePluelyAPI) {
          console.warn("No speech provider selected");
          setState((prev: any) => ({
            ...prev,
            error:
              "No speech provider selected. Please select one in settings.",
          }));
          return;
        }

        const providerConfig = allSttProviders.find(
          (p) => p.id === selectedSttProvider.provider
        );

        if (!providerConfig && !usePluelyAPI) {
          console.warn("Selected speech provider configuration not found");
          setState((prev: any) => ({
            ...prev,
            error:
              "Speech provider configuration not found. Please check your settings.",
          }));
          return;
        }

        setIsTranscribing(true);

        // Use the fetchSTT function for all providers
        transcription = await fetchSTT({
          provider: usePluelyAPI ? undefined : providerConfig,
          selectedProvider: selectedSttProvider,
          audio: audioBlob,
        });

        if (transcription) {
          setState((prev: any) => ({ ...prev, error: "" }));
          submit(transcription);
        }
      } catch (error) {
        console.error("Failed to transcribe audio:", error);
        setState((prev: any) => ({
          ...prev,
          error:
            error instanceof Error ? error.message : "Transcription failed",
        }));
      } finally {
        setIsTranscribing(false);
      }
    },
  });

  // Determine button style
  const getButtonClass = () => {
    if (isTranscribing) return "audio-btn-processing";
    if (vad.userSpeaking) return "audio-btn-active";
    if (vad.listening) return "audio-btn-active";
    return "";
  };

  return (
    <Button
      size="icon"
      onClick={() => {
        if (vad.listening) {
          vad.pause();
          setEnableVAD(false);
        } else {
          vad.start();
          setEnableVAD(true);
        }
      }}
      className={cn("cursor-pointer relative", getButtonClass())}
      title={
        isTranscribing
          ? "Transcribing your speech..."
          : vad.userSpeaking
          ? "Speaking detected..."
          : vad.listening
          ? "Listening — click to stop"
          : "Click to start voice input"
      }
    >
      {isTranscribing ? (
        <LoaderIcon className="h-4 w-4 animate-spin" />
      ) : vad.listening ? (
        <MicIcon
          className={cn(
            "h-4 w-4 transition-colors duration-200",
            vad.userSpeaking ? "text-green-500" : "text-green-500"
          )}
        />
      ) : (
        <MicOffIcon className="h-4 w-4" />
      )}

      {/* Live dot indicator when listening */}
      {vad.listening && !isTranscribing && (
        <span className="audio-btn-dot" />
      )}
    </Button>
  );
};

export const AutoSpeechVAD = (props: AutoSpeechVADProps) => {
  return <AutoSpeechVADInternal key={props.microphoneDeviceId} {...props} />;
};
