import { KeyRound, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../shared/Button";

interface Props {
  apiKey: string;
  onSave: (apiKey: string) => Promise<void>;
  onRemove: () => Promise<void>;
}

export function ChatApiKeySettings({ apiKey, onSave, onRemove }: Props) {
  const [draft, setDraft] = useState("");
  const [saved, setSaved] = useState(false);
  const trimmed = draft.trim();
  const hasApiKey = Boolean(apiKey);
  const hasUnexpectedPrefix = Boolean(trimmed && !trimmed.startsWith("ek_"));

  useEffect(() => {
    if (!saved) return;
    const timeout = window.setTimeout(() => setSaved(false), 1800);
    return () => window.clearTimeout(timeout);
  }, [saved]);

  const handleSave = async () => {
    if (!trimmed) return;
    await onSave(trimmed);
    setDraft("");
    setSaved(true);
  };

  const handleRemove = async () => {
    await onRemove();
    setDraft("");
    setSaved(false);
  };

  return (
    <div className="flex flex-col gap-3 border-b border-border px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">Chat API key</p>
          <p className="text-xs text-muted-foreground">Stored locally in this browser extension.</p>
        </div>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <KeyRound size={15} />
        </div>
      </div>

      {hasApiKey && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2">
          <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
            {maskApiKey(apiKey)}
          </span>
          <Button variant="destructive" size="sm" onClick={handleRemove}>
            <Trash2 size={13} />
            Remove
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <input
          type="password"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={hasApiKey ? "Paste a replacement key" : "Paste your Euryka API key"}
          className="h-9 rounded-md border border-border bg-card px-3 text-sm text-foreground placeholder-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring/50"
        />

        {hasUnexpectedPrefix && (
          <p className="text-xs text-muted-foreground">Euryka API keys usually start with ek_.</p>
        )}

        <div className="flex items-center gap-2">
          <Button variant="primary" size="sm" onClick={handleSave} disabled={!trimmed}>
            <Save size={13} />
            {saved ? "Saved" : hasApiKey ? "Replace" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 10) return "Saved key";
  return `${apiKey.slice(0, 7)}...${apiKey.slice(-4)}`;
}
