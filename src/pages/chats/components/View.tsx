import {
  Badge,
  Card,
  Empty,
  Button,
  Markdown,
  Textarea,
} from "@/components";
import { getConversationById, deleteConversation, DOWNLOAD_SUCCESS_DISPLAY_MS } from "@/lib";
import { fetchTTS } from "@/lib";
import { ChatConversation } from "@/types";
import {
  Download,
  MessageCircleIcon,
  MessageCircleReplyIcon,
  Trash2,
  SparklesIcon,
  UserIcon,
  SendIcon,
  Check,
  Loader2,
  Volume2,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import moment from "moment";
import { useParams, useNavigate } from "react-router-dom";
import { PageLayout } from "@/layouts";
import { useChatCompletion } from "@/hooks";
import { useApp } from "@/contexts";
import {
  DeleteConfirmationDialog,
  ChatAudio,
  ChatScreenshot,
  ChatFiles,
  AudioRecorder,
} from ".";

const View = () => {
  const { conversationId } = useParams();
  const { supportsImages, allTtsProviders, selectedTtsProvider } = useApp();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatConversation | null>(null);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);

  const handleSpeak = useCallback(
    async (messageId: string, text: string) => {
      if (speakingMessageId === messageId) return;
      if (!selectedTtsProvider.provider) return;
      const provider = allTtsProviders.find(
        (p) => p.id === selectedTtsProvider.provider
      );
      if (!provider) return;

      setSpeakingMessageId(messageId);
      try {
        const audioBlob = await fetchTTS({
          provider,
          selectedProvider: selectedTtsProvider,
          text,
        });
        const url = URL.createObjectURL(audioBlob);
        const audio = new Audio(url);
        audio.onended = () => {
          URL.revokeObjectURL(url);
          setSpeakingMessageId(null);
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          setSpeakingMessageId(null);
        };
        await audio.play();
      } catch (e) {
        console.error("TTS error:", e);
        setSpeakingMessageId(null);
      }
    },
    [allTtsProviders, selectedTtsProvider, speakingMessageId]
  );

  // Lightweight local state for delete/download/attach — avoids loading all conversations via useHistory()
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [isDownloaded, setIsDownloaded] = useState(false);
  const [isAttached, setIsAttached] = useState(false);

  const handleDeleteConfirm = (id: string) => setDeleteConfirm(id);
  const cancelDelete = () => setDeleteConfirm(null);

  const handleAttachToOverlay = useCallback((convId: string) => {
    localStorage.setItem(
      "pluely-conversation-selected",
      JSON.stringify({ id: convId, timestamp: Date.now() })
    );
    setIsAttached(true);
    setTimeout(() => setIsAttached(false), DOWNLOAD_SUCCESS_DISPLAY_MS);
  }, []);

  const handleDownload = useCallback((conversation: ChatConversation | null, e: React.MouseEvent) => {
    if (!conversation) return;
    e.stopPropagation();
    try {
      const lines = [`# ${conversation.title}`, ""];
      conversation.messages.forEach((m) => {
        lines.push(`## ${m.role.toUpperCase()}`);
        lines.push(m.content);
        lines.push("");
      });
      const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${conversation.title.replace(/[^a-z0-9]/gi, "_").toLowerCase().substring(0, 16)}.md`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setIsDownloaded(true);
      setTimeout(() => setIsDownloaded(false), DOWNLOAD_SUCCESS_DISPLAY_MS);
    } catch (err) {
      console.error("Failed to download conversation:", err);
    }
  }, []);

  const completion = useChatCompletion(
    conversationId as string,
    messages,
    setMessages
  );

  useEffect(() => {
    const getMessages = async () => {
      const conversation = await getConversationById(conversationId as string);
      setMessages(conversation || null);
    };
    getMessages();
  }, [conversationId]);

  useEffect(() => {
    // Scroll to bottom when messages load
    if (messages?.messages.length) {
      setTimeout(() => {
        completion.messagesEndRef.current?.scrollIntoView({
          behavior: "smooth",
        });
      }, 100);
    }
  }, [messages?.messages.length]);

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await deleteConversation(deleteConfirm);
      window.dispatchEvent(new CustomEvent("conversationDeleted", { detail: deleteConfirm }));
    } catch (err) {
      console.error("Failed to delete conversation:", err);
    }
    setDeleteConfirm(null);
    navigate(-1);
  };

  return (
    <PageLayout
      isMainTitle={false}
      allowBackButton={true}
      title={messages?.title || "Loading..."}
      description={messages ? `${messages.messages?.length ?? 0} messages in this conversation` : "Loading conversation..."}
      rightSlot={
        <div className="flex flex-row items-center gap-2">
          <Button
            variant="outline"
            title="Open this conversation in overlay"
            className="text-[10px] lg:text-sm h-6 lg:h-8"
            onClick={() =>
              conversationId && handleAttachToOverlay(conversationId)
            }
            disabled={isAttached}
          >
            {isAttached ? (
              <>
                <Check className="size-3 lg:size-4 text-green-600" />
                Attached
              </>
            ) : (
              <>
                Open in Overlay{" "}
                <MessageCircleReplyIcon className="size-3 lg:size-4" />
              </>
            )}
          </Button>
          <Button
            variant={"outline"}
            title="Download conversation as markdown"
            className="text-[10px] lg:text-sm h-6 lg:h-8"
            onClick={(e) => handleDownload(messages, e)}
            disabled={isDownloaded}
          >
            {isDownloaded ? (
              <>
                <Check className="size-3 lg:size-4 text-green-600" />
                Downloaded
              </>
            ) : (
              <>
                Download <Download className="size-3 lg:size-4" />
              </>
            )}
          </Button>
          <Button
            variant="destructive"
            title="Delete conversation"
            onClick={() =>
              conversationId && handleDeleteConfirm(conversationId)
            }
            className="text-[10px] lg:text-sm h-6 lg:h-8"
          >
            Delete <Trash2 className="size-3 lg:size-4" />
          </Button>
        </div>
      }
    >
      {!messages ? (
        <Empty
          isLoading={true}
          icon={MessageCircleIcon}
          title="Loading conversation..."
          description="Please wait while we load your messages"
        />
      ) : messages.messages?.length === 0 ? (
        <Empty
          isLoading={false}
          icon={MessageCircleIcon}
          title="No messages found"
          description="Start a new message to get started"
        />
      ) : (
        <div className="flex flex-col gap-4 pb-24 px-2">
          {messages.messages?.map((message, index, array) => {
            const isUser = message.role === "user";
            const showDate =
              index === 0 ||
              moment(message.timestamp).format("YYYY-MM-DD") !==
              moment(array[index - 1]?.timestamp).format("YYYY-MM-DD");

            return (
              <div key={message.id}>
                {/* Date separator */}
                {showDate && (
                  <Badge
                    variant={"outline"}
                    className="flex items-center justify-center my-4 w-fit mx-auto"
                  >
                    {moment(message.timestamp).format("ddd, MMM D")}
                  </Badge>
                )}

                {/* Message */}
                <div
                  className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"
                    }`}
                >
                  {/* Avatar - Left side for bot */}
                  {!isUser && (
                    <div className="flex-shrink-0">
                      <div className="size-7 lg:size-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <SparklesIcon className="size-3 lg:size-4 text-primary" />
                      </div>
                    </div>
                  )}

                  {/* Message content */}
                  <div
                    className={`flex flex-col gap-1 max-w-[70%] ${isUser ? "items-end" : "items-start"
                      }`}
                  >
                    <Card
                      className={`p-3 text-xs lg:text-sm transition-all shadow-none ${isUser
                          ? "!bg-primary text-primary-foreground !border-primary rounded-tr-sm"
                          : "!bg-muted/50 dark:!bg-muted/30 rounded-tl-sm"
                        }`}
                    >
                      <Markdown>{message.content}</Markdown>
                    </Card>
                    <div className={`flex items-center gap-1 ${isUser ? "justify-end" : "justify-start"
                      }`}>
                      <Badge
                        variant="outline"
                        className={`text-[10px] lg:text-xs bg-transparent border-none`}
                      >
                        {moment(message.timestamp).format("hh:mm A")}
                      </Badge>
                      {!isUser && selectedTtsProvider.provider && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-5 w-5 text-muted-foreground hover:text-foreground"
                          title="Speak this response"
                          disabled={speakingMessageId === message.id}
                          onClick={() => handleSpeak(message.id, message.content)}
                        >
                          {speakingMessageId === message.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Volume2 className="h-3 w-3" />
                          )}
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Avatar - Right side for user */}
                  {isUser && (
                    <div className="flex-shrink-0">
                      <div className="size-7 lg:size-8 rounded-full bg-primary flex items-center justify-center">
                        <UserIcon className="size-3 lg:size-4 text-primary-foreground" />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={completion.messagesEndRef} />
        </div>
      )}

      {/* Sticky Footer Input */}
      <div className="absolute bottom-0 left-0 right-0 bg-background/10 backdrop-blur">
        {completion.error && (
          <div className="px-4 pt-3 pb-0">
            <div className="p-2 bg-destructive/10 border border-destructive/20 rounded text-sm text-destructive">
              <strong>Error:</strong> {completion.error}
            </div>
          </div>
        )}

        <div className="relative flex items-start gap-2 p-4">
          <div className="flex-1 relative">
            {completion.isRecording ? (
              <AudioRecorder
                onTranscriptionComplete={(text) => {
                  completion.setIsRecording(false);
                  completion.submit(text);
                }}
                onCancel={() => completion.setIsRecording(false)}
              />
            ) : (
              <>
                <div className="absolute bottom-2 left-2 flex items-center gap-1 z-10">
                  <ChatFiles
                    attachedFiles={completion.attachedFiles}
                    handleFileSelect={completion.handleFileSelect}
                    removeFile={completion.removeFile}
                    onRemoveAllFiles={completion.onRemoveAllFiles}
                    isLoading={completion.isLoading}
                    isFilesPopoverOpen={completion.isFilesPopoverOpen}
                    setIsFilesPopoverOpen={completion.setIsFilesPopoverOpen}
                    disabled={!supportsImages}
                  />
                  <ChatAudio
                    micOpen={completion.micOpen}
                    setMicOpen={completion.setMicOpen}
                    isRecording={completion.isRecording}
                    setIsRecording={completion.setIsRecording}
                    disabled={false}
                  />
                  <ChatScreenshot
                    screenshotConfiguration={completion.screenshotConfiguration}
                    attachedFiles={completion.attachedFiles}
                    isLoading={completion.isLoading}
                    captureScreenshot={completion.captureScreenshot}
                    isScreenshotLoading={completion.isScreenshotLoading}
                    disabled={!supportsImages}
                  />
                </div>

                <Textarea
                  ref={completion.inputRef}
                  placeholder="Type a message..."
                  className="pr-12 pl-2 resize-none pb-12 pt-3"
                  rows={2}
                  value={completion.input}
                  onChange={(e) => completion.setInput(e.target.value)}
                  onKeyDown={completion.handleKeyPress}
                  onPaste={completion.handlePaste}
                  disabled={completion.isLoading}
                />
                <Button
                  size="icon"
                  className="size-7 lg:size-9 rounded-lg lg:rounded-xl absolute right-2 bottom-2"
                  title="Send message"
                  onClick={() => completion.submit()}
                  disabled={
                    completion.isLoading ||
                    !completion.input.trim()
                  }
                >
                  {completion.isLoading ? (
                    <Loader2 className="size-3 lg:size-4 animate-spin" />
                  ) : (
                    <SendIcon className="size-3 lg:size-4" />
                  )}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        deleteConfirm={deleteConfirm}
        cancelDelete={cancelDelete}
        confirmDelete={handleDelete}
      />
    </PageLayout>
  );
};

export default View;
