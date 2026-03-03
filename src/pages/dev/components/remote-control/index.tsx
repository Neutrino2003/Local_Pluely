import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import QRCode from "qrcode";
import { Button, Card, Header, Input } from "@/components";
import {
  CopyIcon,
  KeyRoundIcon,
  PlayIcon,
  RefreshCwIcon,
  SmartphoneIcon,
  SquareIcon,
} from "lucide-react";

interface RemotePairingInfo {
  running: boolean;
  port: number;
  token: string;
  hosts: string[];
  wsUrls: string[];
  qrPayload: string;
  commands: string[];
}

const DEFAULT_REMOTE_PORT = 45777;

export const RemoteControl = () => {
  const [status, setStatus] = useState<RemotePairingInfo | null>(null);
  const [portInput, setPortInput] = useState<string>(
    String(DEFAULT_REMOTE_PORT)
  );
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeWsUrl = useMemo(() => {
    if (!status?.wsUrls?.length) return "";
    const nonLocalhost = status.wsUrls.find(
      (url) => !url.includes("127.0.0.1")
    );
    return nonLocalhost || status.wsUrls[0] || "";
  }, [status]);

  const screenshotCommandExample = useMemo(() => {
    if (!status) return "";
    return JSON.stringify(
      {
        token: status.token,
        command: "screenshot",
        requestId: "mobile-1",
      },
      null,
      2
    );
  }, [status]);

  const loadStatus = async () => {
    try {
      setError(null);
      const info = await invoke<RemotePairingInfo>("remote_control_status");
      setStatus(info);
      if (info.port && !Number.isNaN(info.port)) {
        setPortInput(String(info.port));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load status");
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  useEffect(() => {
    const createQr = async () => {
      if (!status?.running || !status?.port || !status?.qrPayload) {
        setQrDataUrl("");
        return;
      }

      try {
        const dataUrl = await QRCode.toDataURL(status.qrPayload, {
          width: 220,
          margin: 1,
        });
        setQrDataUrl(dataUrl);
      } catch (err) {
        setQrDataUrl("");
      }
    };

    createQr();
  }, [status?.qrPayload]);

  const handleStart = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const parsedPort = Number(portInput);
      const info = await invoke<RemotePairingInfo>("remote_control_start", {
        port:
          Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort < 65536
            ? parsedPort
            : DEFAULT_REMOTE_PORT,
      });
      setStatus(info);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start remote");
    } finally {
      setIsLoading(false);
    }
  };

  const handleStop = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await invoke("remote_control_stop");
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to stop remote");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegenerateToken = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const info = await invoke<RemotePairingInfo>(
        "remote_control_regenerate_token"
      );
      setStatus(info);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to regenerate token"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = async (value: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
    } catch (err) {
      setError("Failed to copy to clipboard");
    }
  };

  return (
    <div id="remote-control" className="space-y-3">
      <Header
        title="Mobile Remote Control"
        description="Pair a mobile app over local Wi-Fi/hotspot and control overlay actions (screenshot, STT, system audio, chats)."
        isMainTitle
      />

      <Card className="p-4 border border-input/50 bg-transparent space-y-4">
        <div className="flex flex-col gap-2">
          <Header
            title="Remote Server Port"
            description="Use the same network on both devices (same Wi-Fi or one device's hotspot)."
          />
          <div className="flex gap-2">
            <Input
              value={portInput}
              onChange={(e) => setPortInput(e.target.value)}
              placeholder={String(DEFAULT_REMOTE_PORT)}
              className="h-11"
            />
            {status?.running ? (
              <Button
                className="h-11"
                variant="destructive"
                onClick={handleStop}
                disabled={isLoading}
              >
                <SquareIcon className="h-4 w-4 mr-2" />
                Stop
              </Button>
            ) : (
              <Button className="h-11" onClick={handleStart} disabled={isLoading}>
                <PlayIcon className="h-4 w-4 mr-2" />
                Start
              </Button>
            )}
            <Button
              className="h-11"
              variant="outline"
              onClick={loadStatus}
              disabled={isLoading}
            >
              <RefreshCwIcon className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>

        {status ? (
          <div className="space-y-3 rounded-md border border-input/50 p-3 bg-muted/20">
            <div className="text-xs">
              Status:{" "}
              <span
                className={
                  status.running ? "text-emerald-600 font-medium" : "text-muted-foreground"
                }
              >
                {status.running ? "Running" : "Stopped"}
              </span>
            </div>
            <div className="text-xs">Port: {status.port || "-"}</div>
            <div className="text-xs">
              WebSocket:{" "}
              <code className="text-[10px] break-all">{activeWsUrl || "-"}</code>
            </div>
            <div className="text-xs">
              Commands:{" "}
              <code className="text-[10px] break-all">
                {status.commands?.join(", ") || "-"}
              </code>
            </div>
            <div className="text-xs flex items-center gap-2">
              <span className="break-all">
                Token: <code className="text-[10px]">{status.token}</code>
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={handleRegenerateToken}
                disabled={isLoading}
              >
                <KeyRoundIcon className="h-3 w-3 mr-1" />
                Rotate
              </Button>
            </div>
          </div>
        ) : null}

        {status?.running && qrDataUrl ? (
          <div className="space-y-2">
            <Header
              title="Pairing QR"
              description="Scan this from mobile app to connect locally."
            />
            <div className="rounded-md border border-input/50 p-3 inline-flex bg-white">
              <img src={qrDataUrl} alt="Remote pairing QR code" className="w-52 h-52" />
            </div>
            <div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => copyToClipboard(status?.qrPayload || "")}
              >
                <CopyIcon className="h-3 w-3 mr-1" />
                Copy QR Payload
              </Button>
            </div>
          </div>
        ) : null}

        {status?.running ? (
          <div className="space-y-2 rounded-md border border-input/50 p-3 bg-muted/20">
            <Header
              title="Flutter Test Command"
              description="Send this JSON as a text WebSocket message from mobile."
            />
            <pre className="text-[10px] whitespace-pre-wrap break-all bg-background border border-input/50 rounded p-2">
              {screenshotCommandExample}
            </pre>
            <Button
              size="sm"
              variant="outline"
              onClick={() => copyToClipboard(screenshotCommandExample)}
            >
              <SmartphoneIcon className="h-3 w-3 mr-1" />
              Copy Screenshot Command
            </Button>
          </div>
        ) : null}

        {error ? (
          <div className="text-xs text-red-500 bg-red-500/10 rounded-md p-2">
            {error}
          </div>
        ) : null}
      </Card>
    </div>
  );
};
