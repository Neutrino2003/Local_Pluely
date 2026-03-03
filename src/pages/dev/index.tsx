import { AIProviders, STTProviders, RemoteControl } from "./components";
import Contribute from "@/components/Contribute";
import { useSettings } from "@/hooks";
import { PageLayout } from "@/layouts";
import { ErrorBoundary } from "react-error-boundary";

const DevSpace = () => {
  const settings = useSettings();

  return (
    <PageLayout title="Dev Space" description="Manage your dev space">
      <ErrorBoundary fallbackRender={({ error }) => (
        <div className="p-4 bg-red-100 text-red-900 border border-red-500 rounded-md">
          <h2 className="font-bold text-lg">Error rendering Dev Space</h2>
          <pre className="mt-2 text-sm whitespace-pre-wrap">{error.message}</pre>
          <pre className="mt-2 text-xs opacity-70 whitespace-pre-wrap">{error.stack}</pre>
        </div>
      )}>
        <Contribute />
        {/* Provider Selection */}
        <AIProviders {...settings} />

        {/* STT Providers */}
        <STTProviders {...settings} />

        {/* Mobile Remote Control */}
        <RemoteControl />
      </ErrorBoundary>
    </PageLayout>
  );
};

export default DevSpace;
