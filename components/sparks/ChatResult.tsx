import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy, MessageSquareQuote, Play, Square } from "lucide-react";
import { useMemo, useState } from "react";
import type {
  ChatMode,
  ChatSource,
  ChatUiMessage,
  Spark,
  SparkRecommendation,
} from "../../lib/types";
import { AnimatedMarkdown } from "../shared/AnimatedMarkdown";
import { Button } from "../shared/Button";
import { IconWrapper } from "../shared/IconWrapper";
import { ChatBox } from "./ChatBox";

interface SparkRecommendationResult {
  recommendation: SparkRecommendation;
  spark: Spark;
  rawText: string;
}

interface Props {
  messages: ChatUiMessage[];
  sources: ChatSource[];
  error: string | null;
  isStreaming: boolean;
  apiKeyAvailable: boolean;
  chatId: string | null;
  mode: ChatMode;
  sparkRecommendationResult: SparkRecommendationResult | null;
  includePageContent: boolean;
  includeSelectedText: boolean;
  pageContentCharCount: number | null;
  selectedTextCharCount: number | null;
  pageContentExceedsLimit: boolean;
  selectedTextExceedsLimit: boolean;
  chatContextStatus: string | null;
  chatContextStatusTitle: string | null;
  chatProviderStatus: string | null;
  onSubmit: (message: string) => void;
  onStop: () => void;
  onOpenSettings: () => void;
  onOpenThread: () => void;
  onModeChange: (mode: ChatMode) => void;
  onRunRecommendedSpark: (spark: Spark) => void;
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
  mode,
  sparkRecommendationResult,
  includePageContent,
  includeSelectedText,
  pageContentCharCount,
  selectedTextCharCount,
  pageContentExceedsLimit,
  selectedTextExceedsLimit,
  chatContextStatus,
  chatContextStatusTitle,
  chatProviderStatus,
  onSubmit,
  onStop,
  onOpenSettings,
  onOpenThread,
  onModeChange,
  onRunRecommendedSpark,
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

          {sparkRecommendationResult && (
            <RecommendedSparkCard
              result={sparkRecommendationResult}
              onRun={() => onRunRecommendedSpark(sparkRecommendationResult.spark)}
            />
          )}

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
          mode={mode}
          includePageContent={includePageContent}
          includeSelectedText={includeSelectedText}
          pageContentCharCount={pageContentCharCount}
          selectedTextCharCount={selectedTextCharCount}
          pageContentExceedsLimit={pageContentExceedsLimit}
          selectedTextExceedsLimit={selectedTextExceedsLimit}
          contextStatus={chatContextStatus}
          contextStatusTitle={chatContextStatusTitle}
          providerStatus={chatProviderStatus}
          onSubmit={onSubmit}
          onOpenSettings={onOpenSettings}
          onModeChange={onModeChange}
          onIncludePageContentChange={onIncludePageContentChange}
          onIncludeSelectedTextChange={onIncludeSelectedTextChange}
        />
      </div>
    </div>
  );
}

function RecommendedSparkCard({
  result,
  onRun,
}: {
  result: SparkRecommendationResult;
  onRun: () => void;
}) {
  const { spark, recommendation } = result;
  const color = spark.color || "#FF7074";

  return (
    <div className="w-full max-w-md rounded-md border border-border bg-card p-3 text-card-foreground shadow-sm">
      <div className="flex items-start gap-3">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
          style={{ backgroundColor: color }}
        >
          <IconWrapper name={spark.icon} color="white" size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{spark.title}</p>
          {spark.description && (
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{spark.description}</p>
          )}
          {typeof recommendation.confidence === "number" && (
            <p className="mt-2 text-[11px] uppercase tracking-wider text-muted-foreground">
              Confidence {Math.round(recommendation.confidence * 100)}%
            </p>
          )}
        </div>
      </div>
      <div className="mt-3 flex justify-end">
        <Button variant="primary" size="sm" onClick={onRun}>
          <Play size={12} />
          Run Spark
        </Button>
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
