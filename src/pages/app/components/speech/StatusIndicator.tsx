import { AlertCircleIcon, LoaderIcon } from "lucide-react";

type Props = {
  setupRequired: boolean;
  error: string;
  isProcessing: boolean;
  isAIProcessing: boolean;
  capturing: boolean;
};

export const StatusIndicator = ({
  setupRequired,
  error,
  isProcessing,
  isAIProcessing,
  capturing,
}: Props) => {
  // Don't show anything if not capturing and no error
  if (!capturing && !error && !isProcessing && !isAIProcessing) {
    return null;
  }

  return (
    <div className="flex flex-1 items-center gap-2 px-2 py-1 justify-end min-w-0">
      {/* Priority: Error > AI Processing > Transcribing > Listening */}
      {error && !setupRequired ? (
        <div className="flex items-center gap-1.5 text-red-500 min-w-0">
          <AlertCircleIcon className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="text-[11px] font-medium truncate">{error}</span>
        </div>
      ) : isAIProcessing ? (
        <div className="flex items-center gap-1.5 animate-pulse min-w-0">
          <LoaderIcon className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
          <span className="text-[11px] font-medium">Thinking...</span>
        </div>
      ) : isProcessing ? (
        <div className="flex items-center gap-1.5 min-w-0">
          <LoaderIcon className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
          <span className="text-[11px] font-medium text-muted-foreground">
            Transcribing...
          </span>
        </div>
      ) : capturing ? (
        <div className="flex items-center gap-1.5 text-green-600 min-w-0">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
          <span className="text-[11px] font-medium">Listening</span>
        </div>
      ) : null}
    </div>
  );
};
