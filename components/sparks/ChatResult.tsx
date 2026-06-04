import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy, MessageCircle, MessageSquareQuote, Square } from "lucide-react";
import { useMemo, useState } from "react";
import type { ChatSource, ChatUiMessage } from "../../lib/types";
import { AnimatedMarkdown } from "../shared/AnimatedMarkdown";
import { Button } from "../shared/Button";
import { ChatBox } from "./ChatBox";

interface Props {
  messages: ChatUiMessage[];
  sources: ChatSource[];
  error: string | null;
  isStreaming: boolean;
  apiKeyAvailable: boolean;
  chatId: string | null;
  includePageContent: boolean;
  includeSelectedText: boolean;
  chatContextStatus: string | null;
  onSubmit: (message: string) => void;
  onStop: () => void;
  onOpenSettings: () => void;
  onOpenThread: () => void;
  onIncludePageContentChange: (checked: boolean) => void;
  onIncludeSelectedTextChange: (checked: boolean) => void;
}

export function ChatResult({
  messages,
  sources,
  error,
  isStreaming,
  apiKeyAvailable,
  chatId,
  includePageContent,
  includeSelectedText,
  chatContextStatus,
  onSubmit,
  onStop,
  onOpenSettings,
  onOpenThread,
  onIncludePageContentChange,
  onIncludeSelectedTextChange,
}: Props) {
  const [copied, setCopied] = useState(false);
  const latestAssistantContent = useMemo(
    () =>
      [...messages]
        .reverse()
        .find((message) => message.role === "assistant" && message.content.trim())?.content ?? "",
    [messages]
  );

  const copyLatest = async () => {
    if (!latestAssistantContent) return;
    await navigator.clipboard.writeText(latestAssistantContent);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 bg-background px-4 py-4 text-foreground">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <MessageCircle size={16} />
          </div>
          <span className="truncate text-sm text-foreground/70">Chat</span>
          {isStreaming && <span className="text-xs text-muted-foreground">Streaming</span>}
        </div>
      </div>

      <div className="ek-scroll flex-1 overflow-y-auto px-4 py-4">
        <div className="flex flex-col gap-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={message.role === "user" ? "flex justify-end" : "flex justify-start"}
            >
              {message.role === "user" ? (
                <div className="max-w-[86%] rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground">
                  {message.content}
                </div>
              ) : (
                <div className="min-w-0 max-w-full flex-1 text-sm">
                  {message.content.trim() ? (
                    <AnimatedMarkdown content={message.content} />
                  ) : isStreaming ? (
                    <StreamingSkeleton />
                  ) : null}
                </div>
              )}
            </div>
          ))}

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-red-500">
              {error}
            </div>
          )}

          {sources.length > 0 && (
            <div className="flex flex-col gap-2 border-t border-border pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Sources
              </p>
              <div className="flex flex-col gap-1">
                {sources.map((source) => (
                  <a
                    key={`${source.sourceId}-${source.url}`}
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground/70"
                    title={source.url}
                  >
                    {source.title || getHostname(source.url)}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex shrink-0 flex-col gap-2 border-t border-border bg-background px-4 py-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={copyLatest} disabled={!latestAssistantContent}>
            <AnimatePresence mode="wait">
              {copied ? (
                <motion.span
                  key="check"
                  initial={{ rotate: 90, opacity: 0 }}
                  animate={{ rotate: 0, opacity: 1 }}
                  exit={{ rotate: -90, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <Check size={13} />
                </motion.span>
              ) : (
                <motion.span
                  key="copy"
                  initial={{ rotate: 90, opacity: 0 }}
                  animate={{ rotate: 0, opacity: 1 }}
                  exit={{ rotate: -90, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <Copy size={13} />
                </motion.span>
              )}
            </AnimatePresence>
            {copied ? "Copied" : "Copy"}
          </Button>

          {isStreaming && (
            <Button variant="ghost" size="sm" onClick={onStop}>
              <Square size={12} />
              Stop
            </Button>
          )}

          {chatId && !isStreaming && (
            <Button variant="ghost" size="sm" onClick={onOpenThread}>
              <MessageSquareQuote size={13} />
              Open in threads
            </Button>
          )}
        </div>

        <ChatBox
          compact
          apiKeyAvailable={apiKeyAvailable}
          isStreaming={isStreaming}
          includePageContent={includePageContent}
          includeSelectedText={includeSelectedText}
          contextStatus={chatContextStatus}
          onSubmit={onSubmit}
          onOpenSettings={onOpenSettings}
          onIncludePageContentChange={onIncludePageContentChange}
          onIncludeSelectedTextChange={onIncludeSelectedTextChange}
        />
      </div>
    </div>
  );
}

function StreamingSkeleton() {
  return (
    <div className="flex flex-col gap-2 py-1">
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          className="h-3 rounded bg-muted animate-pulse"
          style={{ width: `${72 - index * 14}%` }}
        />
      ))}
    </div>
  );
}

function getHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
