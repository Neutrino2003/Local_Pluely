import { Sidebar } from "@/components";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { ErrorBoundary } from "react-error-boundary";
import { ErrorLayout } from "./ErrorLayout";
import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { saveConversation } from "@/lib";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Toaster } from "sonner";

export const DashboardLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    let unlisten: any;
    const setupListener = async () => {
      try {
        unlisten = await listen("remote-control-send-chat-message", async (event: any) => {
          const payload = event.payload as {
            requestId?: string;
            conversationId?: string;
            text?: string;
          } | null;

          if (payload?.text && payload.conversationId === "new") {
            try {
              const currentWindow = getCurrentWindow();
              await currentWindow.show();
              await currentWindow.setFocus();
            } catch (err) {
              console.error("Failed to focus window:", err);
            }

            const newId = crypto.randomUUID();
            await saveConversation({
              id: newId,
              title: payload.text.slice(0, 30),
              messages: [],
              createdAt: Date.now(),
              updatedAt: Date.now(),
            });

            navigate(`/chats/view/${newId}`);

            // Dispatch event for useChatCompletion to pick up
            setTimeout(() => {
              window.dispatchEvent(
                new CustomEvent("remote-control-start-chat", {
                  detail: { conversationId: newId, text: payload.text }
                })
              );
            }, 600); // give the page enough time to mount
          }
        });
      } catch (err) {
        console.error("Failed to setup remote chat listener:", err);
      }
    };
    setupListener();

    return () => {
      if (unlisten) unlisten.then((fn: any) => typeof fn === "function" && fn());
    };
  }, [navigate]);

  return (
    <>
      <Toaster position="bottom-right" richColors closeButton />
      <div className="relative flex h-screen w-screen overflow-hidden bg-background">
        {/* Draggable region */}
        <div
          className="absolute left-0 right-0 top-0 z-50 h-10 select-none"
          data-tauri-drag-region={true}
        />

        {/* Sidebar */}
        <Sidebar />
        {/* Main Content */}
        <main className="flex flex-1 flex-col overflow-hidden px-8">
          <ErrorBoundary
            fallbackRender={({ error }) => {
              console.error("Dashboard page error:", error);
              return <ErrorLayout />;
            }}
            resetKeys={[location.pathname]}
            onReset={() => {
              console.log("Error boundary reset for:", location.pathname);
            }}
          >
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </>
  );
};
