import { Card, Updater, DragButton, CustomCursor, Button } from "@/components";
import {
  SystemAudio,
  Completion,
  AudioVisualizer,
  StatusIndicator,
} from "./components";
import { useApp } from "@/hooks";
import { useApp as useAppContext } from "@/contexts";
import { SparklesIcon } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { ErrorBoundary } from "react-error-boundary";
import { ErrorLayout } from "@/layouts";
import { getPlatform } from "@/lib";

const App = () => {
  const { isHidden, systemAudio } = useApp();
  const { customizable } = useAppContext();
  const platform = getPlatform();

  const openDashboard = async () => {
    try {
      await invoke("open_dashboard");
    } catch (error) {
      console.error("Failed to open dashboard:", error);
    }
  };

  return (
    <ErrorBoundary
      fallbackRender={() => {
        return <ErrorLayout isCompact />;
      }}
      resetKeys={["app-error"]}
      onReset={() => {
        console.log("Reset");
      }}
    >
      <div
        className={`w-screen h-screen flex overflow-hidden justify-center items-start ${isHidden ? "hidden pointer-events-none" : ""
          }`}
      >
        <Card className="w-full flex flex-row items-center gap-2 p-2">
          <SystemAudio {...systemAudio} />

          <div className="w-full flex items-center justify-between gap-2 overflow-hidden">
            {systemAudio?.capturing ? (
              <div className="flex flex-1 items-center gap-2 max-w-[150px] flex-shrink-0 animate-in fade-in zoom-in duration-300">
                <AudioVisualizer isRecording={systemAudio?.capturing} />
                <StatusIndicator
                  setupRequired={systemAudio.setupRequired}
                  error={systemAudio.error}
                  isProcessing={systemAudio.isProcessing}
                  isAIProcessing={systemAudio.isAIProcessing}
                  capturing={systemAudio.capturing}
                />
              </div>
            ) : null}

            <div className="flex flex-1 flex-row gap-2 items-center min-w-0">
              <Completion isHidden={isHidden} />
              <Button
                size={"icon"}
                className="cursor-pointer flex-shrink-0"
                title="Open Dev Space"
                onClick={openDashboard}
              >
                <SparklesIcon className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <Updater />
          <DragButton />
        </Card>
        {customizable.cursor.type === "invisible" && platform !== "linux" ? (
          <CustomCursor />
        ) : null}
      </div>
    </ErrorBoundary>
  );
};

export default App;
