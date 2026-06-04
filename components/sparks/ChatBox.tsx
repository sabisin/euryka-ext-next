import { FormEvent, useState } from "react";
import { KeyRound, Send } from "lucide-react";
import { Button } from "../shared/Button";

interface Props {
  apiKeyAvailable: boolean;
  isStreaming?: boolean;
  compact?: boolean;
  onSubmit: (message: string) => void;
  onOpenSettings: () => void;
}

export function ChatBox({
  apiKeyAvailable,
  isStreaming = false,
  compact = false,
  onSubmit,
  onOpenSettings,
}: Props) {
  const [message, setMessage] = useState("");
  const trimmed = message.trim();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!trimmed || !apiKeyAvailable || isStreaming) return;
    onSubmit(trimmed);
    setMessage("");
  };

  return (
    <section className={compact ? "flex flex-col gap-2" : "flex flex-col gap-2.5 border-t border-border pt-5"}>
      {!compact && (
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Chat
          </h3>
          {!apiKeyAvailable && (
            <Button variant="ghost" size="sm" onClick={onOpenSettings}>
              <KeyRound size={13} />
              API key
            </Button>
          )}
        </div>
      )}

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
          disabled={!apiKeyAvailable || isStreaming}
          rows={compact ? 1 : 2}
          placeholder={
            apiKeyAvailable
              ? "Ask Euryka..."
              : "Add an API key in Settings to enable chat."
          }
          className="ek-scroll min-h-10 flex-1 resize-none rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60"
        />
        <Button
          type="submit"
          variant="primary"
          size="icon-lg"
          title="Send"
          disabled={!trimmed || !apiKeyAvailable || isStreaming}
        >
          <Send size={15} />
        </Button>
      </form>
    </section>
  );
}
