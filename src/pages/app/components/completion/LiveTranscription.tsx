import { HeadphonesIcon, MicIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface LiveTranscriptionProps {
  text: string;
  source: "headphone" | "mic" | null;
  isProcessing?: boolean;
}

export const LiveTranscription = ({
  text,
  source,
  isProcessing,
}: LiveTranscriptionProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [displayText, setDisplayText] = useState("");
  const prevTextRef = useRef("");

  // Animate text in character by character for a typing effect
  useEffect(() => {
    if (!text) {
      setDisplayText("");
      prevTextRef.current = "";
      return;
    }

    // If text changed, animate the new portion
    const prevLen = prevTextRef.current.length;
    if (text.startsWith(prevTextRef.current) && text.length > prevLen) {
      // New characters appended — animate them
      const newChars = text.slice(prevLen);
      let i = 0;
      const timer = setInterval(() => {
        if (i < newChars.length) {
          setDisplayText((prev) => prev + newChars[i]);
          i++;
        } else {
          clearInterval(timer);
        }
      }, 18);
      prevTextRef.current = text;
      return () => clearInterval(timer);
    } else {
      // Completely new text — reset
      setDisplayText(text);
      prevTextRef.current = text;
    }
  }, [text]);

  // Show/hide animation
  useEffect(() => {
    if (text || isProcessing) {
      setVisible(true);
    } else {
      // Small delay before hiding for smooth exit
      const timer = setTimeout(() => setVisible(false), 300);
      return () => clearTimeout(timer);
    }
  }, [text, isProcessing]);

  if (!visible && !text && !isProcessing) return null;

  const SourceIcon =
    source === "headphone" ? HeadphonesIcon : source === "mic" ? MicIcon : null;

  return (
    <div
      ref={containerRef}
      className={`
        live-transcription-bar
        ${visible && (text || isProcessing) ? "live-transcription-visible" : "live-transcription-hidden"}
      `}
    >
      {/* Source indicator */}
      <div className="live-transcription-source">
        {SourceIcon && (
          <SourceIcon className="live-transcription-icon" />
        )}
        <div className="live-transcription-pulse" />
      </div>

      {/* Transcription text */}
      <div className="live-transcription-text">
        {isProcessing && !text ? (
          <span className="live-transcription-processing">
            <span className="live-dot" style={{ animationDelay: "0ms" }}>
              ·
            </span>
            <span className="live-dot" style={{ animationDelay: "150ms" }}>
              ·
            </span>
            <span className="live-dot" style={{ animationDelay: "300ms" }}>
              ·
            </span>
          </span>
        ) : (
          <>
            <span>{displayText}</span>
            {isProcessing && (
              <span className="live-transcription-cursor" />
            )}
          </>
        )}
      </div>
    </div>
  );
};
