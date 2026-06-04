import { FormEvent, useState } from "react";
import { KeyRound, Send } from "lucide-react";
import { Button } from "../shared/Button";

interface Props {
  apiKeyAvailable: boolean;
  isStreaming?: boolean;
  compact?: boolean;
  includePageContent?: boolean;
  includeSelectedText?: boolean;
  contextStatus?: string | null;
  providerStatus?: string | null;
  onSubmit: (message: string) => void;
  onOpenSettings: () => void;
  onIncludePageContentChange?: (checked: boolean) => void;
  onIncludeSelectedTextChange?: (checked: boolean) => void;
}

export function ChatBox({
  apiKeyAvailable,
  isStreaming = false,
  compact = false,
  includePageContent = false,
  includeSelectedText = false,
  contextStatus = null,
  providerStatus = null,
  onSubmit,
  onOpenSettings,
  onIncludePageContentChange,
  onIncludeSelectedTextChange,
}: Props) {
  const [message, setMessage] = useState("");
  const trimmed = message.trim();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!trimmed || isStreaming) return;
    onSubmit(trimmed);
    setMessage("");
  };

  return (
    <section className={compact ? "flex flex-col gap-2" : "flex flex-col gap-2.5 pt-2"}>
      {!compact && (
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Chat
            </h3>
            {providerStatus && <ProviderBadge label={providerStatus} />}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {!apiKeyAvailable && (
              <Button variant="ghost" size="sm" onClick={onOpenSettings}>
                <KeyRound size={13} />
                API key
              </Button>
            )}
          </div>
        </div>
      )}

      {compact && providerStatus && <ProviderBadge label={providerStatus} />}

      <div className="flex flex-wrap gap-3">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={includePageContent}
            onChange={(event) => onIncludePageContentChange?.(event.target.checked)}
            disabled={isStreaming}
            className="h-3.5 w-3.5 rounded border-border"
          />
          Page content
        </label>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={includeSelectedText}
            onChange={(event) => onIncludeSelectedTextChange?.(event.target.checked)}
            disabled={isStreaming}
            className="h-3.5 w-3.5 rounded border-border"
          />
          Highlighted text
        </label>
      </div>

      <form onSubmit={handleSubmit} className="flex items-end gap-2">
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          disabled={isStreaming}
          rows={compact ? 1 : 2}
          placeholder="Ask Euryka..."
          className="ek-scroll min-h-10 flex-1 resize-none rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60"
        />
        <Button
          type="submit"
          variant="primary"
          size="icon-lg"
          title="Send"
          disabled={!trimmed || isStreaming}
        >
          <Send size={15} />
        </Button>
      </form>

      {contextStatus && (
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {contextStatus}
        </p>
      )}
    </section>
  );
}

function ProviderBadge({ label }: { label: string }) {
  return (
    <span className="max-w-[180px] truncate rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
      {label}
    </span>
  );
}
