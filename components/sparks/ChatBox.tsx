import { FileText, Highlighter, KeyRound, Sparkles, TriangleAlert } from "lucide-react";
import { useState } from "react";
import ekIconLight from "../../assets/logo-remade-black-red.svg";
import ekIconDark from "../../assets/logo-remade-red-white.svg";
import { useTheme } from "../../hooks/use-theme";
import type { ChatMode } from "../../lib/types";
import { PromptInput, PromptInputToolButton } from "../shared/PromptInput";

interface Props {
  apiKeyAvailable: boolean;
  isStreaming?: boolean;
  compact?: boolean;
  includePageContent?: boolean;
  includeSelectedText?: boolean;
  mode?: ChatMode;
  pageContentCharCount?: number | null;
  selectedTextCharCount?: number | null;
  pageContentExceedsLimit?: boolean;
  selectedTextExceedsLimit?: boolean;
  contextStatus?: string | null;
  contextStatusTitle?: string | null;
  providerStatus?: string | null;
  onSubmit: (message: string) => void;
  onOpenSettings: () => void;
  onIncludePageContentChange?: (checked: boolean) => void;
  onIncludeSelectedTextChange?: (checked: boolean) => void;
  onModeChange?: (mode: ChatMode) => void;
  onStop?: () => void;
}

export function ChatBox({
  apiKeyAvailable,
  isStreaming = false,
  compact = false,
  includePageContent = true,
  includeSelectedText = false,
  mode = "chat",
  pageContentCharCount = null,
  selectedTextCharCount = null,
  pageContentExceedsLimit = false,
  selectedTextExceedsLimit = false,
  contextStatus = null,
  contextStatusTitle = null,
  providerStatus = null,
  onSubmit,
  onOpenSettings,
  onIncludePageContentChange,
  onIncludeSelectedTextChange,
  onModeChange,
  onStop,
}: Props) {
  const [message, setMessage] = useState("");

  const handleSubmit = ({ text }: { text: string }) => {
    if (isStreaming) return;
    onSubmit(text);
  };

  return (
    <section className={compact ? "flex flex-col gap-2" : "flex flex-col gap-2.5"}>
      <PromptInput
        value={message}
        onValueChange={setMessage}
        onSubmit={handleSubmit}
        disabled={isStreaming}
        minRows={compact ? 1 : 2}
        placeholder="Ask Euryka..."
        submitStatus={isStreaming ? "streaming" : "ready"}
        onStop={onStop}
        tools={
          <>
            <PromptInputToolButton
              active={mode === "spark-recommendation"}
              disabled={isStreaming}
              onClick={() =>
                onModeChange?.(mode === "spark-recommendation" ? "chat" : "spark-recommendation")
              }
              title="Find the best spark"
            >
              <Sparkles size={13} />
              <span className="max-[420px]:hidden">Find Spark</span>
            </PromptInputToolButton>
            <PromptInputToolButton
              active={includePageContent}
              disabled={isStreaming}
              onClick={() => onIncludePageContentChange?.(!includePageContent)}
              title="Include page content"
            >
              <FileText size={13} />
              <span className="max-[420px]:hidden">Page</span>
              {includePageContent && pageContentCharCount !== null && (
                <span className="max-[420px]:hidden">
                  <ContextCount value={pageContentCharCount} warning={pageContentExceedsLimit} />
                </span>
              )}
            </PromptInputToolButton>
            <PromptInputToolButton
              active={includeSelectedText}
              disabled={isStreaming}
              onClick={() => onIncludeSelectedTextChange?.(!includeSelectedText)}
              title="Include highlighted text"
            >
              <Highlighter size={13} />
              <span className="max-[420px]:hidden">Highlight</span>
              {includeSelectedText && selectedTextCharCount !== null && (
                <span className="max-[420px]:hidden">
                  <ContextCount value={selectedTextCharCount} warning={selectedTextExceedsLimit} />
                </span>
              )}
            </PromptInputToolButton>
            {providerStatus && <ProviderBadge label={providerStatus} />}
            {!apiKeyAvailable && (
              <PromptInputToolButton onClick={onOpenSettings} title="Add Euryka API key">
                <KeyRound size={13} />
                <span className="max-[420px]:hidden">API key</span>
              </PromptInputToolButton>
            )}
          </>
        }
      />

      {contextStatus && (
        <p
          className="flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-50 px-2 py-1.5 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
          title={contextStatusTitle ?? undefined}
          aria-live="polite"
        >
          <TriangleAlert size={13} className="shrink-0" />
          {contextStatus}
        </p>
      )}
    </section>
  );
}

function ProviderBadge({ label }: { label: string }) {
  const isGoogleProvider = isGoogleProviderLabel(label);
  const theme = useTheme();

  return (
    <span
      title={getProviderTooltip(label)}
      aria-label={label}
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground"
    >
      {isGoogleProvider ? (
        <GoogleLogo className="h-3.5 w-3.5" />
      ) : (
        <img
          src={theme === "dark" ? ekIconDark : ekIconLight}
          alt=""
          aria-hidden="true"
          className="h-3.5 w-3.5"
        />
      )}
    </span>
  );
}

function ContextCount({ value, warning }: { value: number; warning: boolean }) {
  return (
    <span className={warning ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground/80"}>
      {value}
    </span>
  );
}

function getProviderTooltip(label: string): string {
  const normalized = label.toLowerCase();
  if (normalized.includes("preparing")) {
    return "Model provider: Google Chrome AI is preparing the local Gemini Nano model.";
  }
  if (isGoogleProviderLabel(label)) {
    return "Model provider: Google Chrome AI. Gemini Nano runs locally in Chrome when available.";
  }
  return "Model provider: Euryka backend using your configured API key.";
}

function isGoogleProviderLabel(label: string): boolean {
  const normalized = label.toLowerCase();
  return normalized.includes("google") || normalized.includes("chrome");
}

function GoogleLogo({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 18 18" className={className}>
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.71H.95v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.71A5.41 5.41 0 0 1 3.69 9c0-.59.1-1.16.28-1.71V4.96H.95A9 9 0 0 0 0 9c0 1.45.35 2.82.95 4.04l3.02-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .95 4.96l3.02 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}
