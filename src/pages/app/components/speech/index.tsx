import { Button } from "@/components";
import {
  HeadphonesIcon,
  AlertCircleIcon,
  LoaderIcon,
} from "lucide-react";
import { useSystemAudioType } from "@/hooks";
import { cn } from "@/lib/utils";

export const SystemAudio = (props: useSystemAudioType) => {
  const {
    capturing,
    isProcessing,
    error,
    setupRequired,
    startCapture,
    stopCapture,
    manualStopAndSend,
  } = props;

  const handleToggleCapture = async () => {
    if (capturing) {
      // Trigger a manual stop to ensure the last chunk of audio is transcribed
      await manualStopAndSend();

      // Wait for the transcription and event to fire, then gracefully stop the UI
      setTimeout(async () => {
        await stopCapture();
      }, 500);
    } else {
      await startCapture();
    }
  };

  // Determine button style class based on current state
  const getButtonClass = () => {
    if (setupRequired) return "audio-btn-error";
    if (error && !setupRequired) return "audio-btn-error";
    if (isProcessing) return "audio-btn-processing";
    if (capturing) return "audio-btn-active";
    return "";
  };

  const getButtonTitle = () => {
    if (setupRequired) return "Setup required - Click for instructions";
    if (error && !setupRequired) return `Error: ${error}`;
    if (isProcessing) return "Transcribing audio...";
    if (capturing) return "Stop system audio capture";
    return "Start system audio capture";
  };

  return (
    <Button
      size="icon"
      title={getButtonTitle()}
      onClick={handleToggleCapture}
      className={cn("cursor-pointer relative", getButtonClass())}
    >
      {/* Main icon — always headphones, state shown via button styling */}
      {setupRequired ? (
        <AlertCircleIcon className="h-4 w-4 text-orange-500" />
      ) : isProcessing ? (
        <LoaderIcon className="h-4 w-4 animate-spin" />
      ) : (
        <HeadphonesIcon
          className={cn(
            "h-4 w-4 transition-colors duration-200",
            capturing && "text-green-500"
          )}
        />
      )}

      {/* Live dot indicator when capturing */}
      {capturing && !isProcessing && !error && (
        <span className="audio-btn-dot" />
      )}
    </Button>
  );
};
