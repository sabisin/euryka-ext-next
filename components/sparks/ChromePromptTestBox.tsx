import { Cpu, Send } from "lucide-react";
import { type FormEvent, useState } from "react";
import type { LanguageModelSession } from "../../lib/chrome-ai";
import { sendMessage } from "../../lib/messaging";
import { Button } from "../shared/Button";

const SESSION_OPTIONS = {
  expectedInputs: [{ type: "text", languages: ["en"] }],
  expectedOutputs: [{ type: "text", languages: ["en"] }],
};

interface PromptContext {
  pageUrl: string;
  pageContent: string;
  selectedText: string;
}

interface Props {
  tabId: number | null;
}

export function ChromePromptTestBox({ tabId }: Props) {
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [contextStatus, setContextStatus] = useState<string | null>(null);
  const [result, setResult] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [isRefreshingContext, setIsRefreshingContext] = useState(false);
  const [includePageContent, setIncludePageContent] = useState(false);
  const [includeSelectedText, setIncludeSelectedText] = useState(false);
  const trimmed = prompt.trim();

  const refreshContext = async (
    options: { pageContent: boolean; selectedText: boolean },
    requireContext: boolean
  ): Promise<PromptContext | null> => {
    if (!options.pageContent && !options.selectedText) {
      setContextStatus(null);
      return { pageUrl: "", pageContent: "", selectedText: "" };
    }

    if (tabId === null) {
      setContextStatus("No active tab is attached to this sidepanel.");
      return null;
    }

    setIsRefreshingContext(true);
    try {
      const [tabUrl, page, selection] = await Promise.all([
        sendMessage("getTabUrl", { tabId }).catch(() => ({ url: "" })),
        options.pageContent
          ? sendMessage("extractText", undefined, tabId).catch(() => null)
          : Promise.resolve(null),
        options.selectedText
          ? sendMessage("getSelectedText", undefined, tabId).catch(() => null)
          : Promise.resolve(null),
      ]);

      const context: PromptContext = {
        pageUrl: tabUrl.url.trim(),
        pageContent: page?.text.trim() ?? "",
        selectedText: selection?.text.trim() ?? "",
      };

      if (requireContext && options.pageContent && !context.pageContent) {
        setContextStatus("Page content was requested, but no page text is available.");
        return null;
      }
      if (requireContext && options.selectedText && !context.selectedText) {
        setContextStatus("Highlighted text was requested, but no current selection is available.");
        return null;
      }

      const parts = [
        options.pageContent
          ? `page content: ${context.pageContent ? `${context.pageContent.length} chars` : "empty"}`
          : null,
        options.selectedText
          ? `highlight: ${context.selectedText ? `${context.selectedText.length} chars` : "empty"}`
          : null,
      ].filter(Boolean);
      setContextStatus(`Context refreshed (${parts.join(", ")}).`);
      return context;
    } finally {
      setIsRefreshingContext(false);
    }
  };

  const handlePageContentToggle = async (checked: boolean) => {
    setIncludePageContent(checked);
    await refreshContext({ pageContent: checked, selectedText: includeSelectedText }, false);
  };

  const handleSelectedTextToggle = async (checked: boolean) => {
    setIncludeSelectedText(checked);
    await refreshContext({ pageContent: includePageContent, selectedText: checked }, false);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!trimmed || isRunning || isRefreshingContext) return;

    const languageModel = window.LanguageModel;
    setResult("");

    if (!languageModel) {
      setStatus("LanguageModel is not available in this Chrome profile.");
      return;
    }

    setIsRunning(true);
    let session: LanguageModelSession | null = null;

    try {
      const context = await refreshContext(
        { pageContent: includePageContent, selectedText: includeSelectedText },
        true
      );
      if (!context) return;

      setStatus("Checking local model...");
      const availability = await languageModel.availability(SESSION_OPTIONS);
      if (availability === "unavailable") {
        setStatus("Local model is unavailable on this device or Chrome profile.");
        return;
      }

      setStatus(
        availability === "available"
          ? "Creating local session..."
          : "Preparing local model download..."
      );
      session = await languageModel.create(SESSION_OPTIONS);

      setStatus("Prompting local model...");
      const response = await session.prompt(buildPrompt(trimmed, context));
      setResult(response);
      setStatus("Done");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Chrome Prompt API request failed.");
    } finally {
      session?.destroy?.();
      setIsRunning(false);
    }
  };

  return (
    <section className="flex flex-col gap-2.5 border-t border-border pt-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Chrome Prompt API
        </h3>
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Cpu size={13} />
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={includePageContent}
            onChange={(event) => handlePageContentToggle(event.target.checked)}
            disabled={isRunning || isRefreshingContext}
            className="h-3.5 w-3.5 rounded border-border"
          />
          Page content
        </label>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={includeSelectedText}
            onChange={(event) => handleSelectedTextToggle(event.target.checked)}
            disabled={isRunning || isRefreshingContext}
            className="h-3.5 w-3.5 rounded border-border"
          />
          Highlighted text
        </label>
      </div>

      <form onSubmit={handleSubmit} className="flex items-end gap-2">
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          disabled={isRunning}
          rows={2}
          placeholder="Ask local Chrome AI..."
          className="ek-scroll min-h-10 flex-1 resize-none rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60"
        />
        <Button
          type="submit"
          variant="primary"
          size="icon-lg"
          title="Send to Chrome Prompt API"
          disabled={!trimmed || isRunning || isRefreshingContext}
        >
          <Send size={15} />
        </Button>
      </form>

      {contextStatus && (
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {contextStatus}
        </p>
      )}

      {status && (
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {status}
        </p>
      )}

      {result && (
        <div className="rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground whitespace-pre-wrap">
          {result}
        </div>
      )}
    </section>
  );
}

function buildPrompt(userPrompt: string, context: PromptContext): string {
  const parts = [];
  if (context.pageUrl) parts.push(`Page URL:\n${context.pageUrl}`);
  if (context.pageContent) parts.push(`Page content:\n${context.pageContent}`);
  if (context.selectedText) parts.push(`Highlighted text:\n${context.selectedText}`);
  parts.push(`User prompt:\n${userPrompt}`);
  return parts.join("\n\n---\n\n");
}
