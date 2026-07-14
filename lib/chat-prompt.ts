import type { LanguageModelSession } from "./chrome-ai";
import {
  compactPageContent,
  compactPageContentV2,
  type PageContentBlock,
  type PageContextMode,
} from "./page-context";
import type { ChatMessage, ChatUiMessage } from "./types";

const CHROME_PAGE_CONTENT_CHAR_LIMIT = 10_000;
const CHROME_SELECTED_TEXT_CHAR_LIMIT = 4_000;
const CHROME_HISTORY_CHAR_LIMIT = 4_000;

export interface ChatPromptContext {
  pageUrl: string;
  pageContent: string;
  pageBlocks: PageContentBlock[];
  selectedText: string;
}

export interface ChatContextCounts {
  pageContent: number | null;
  selectedText: number | null;
}

export interface ChatContextLimitState {
  exceedsPageContentLimit: boolean;
  exceedsSelectedTextLimit: boolean;
}

export interface ChromePromptLimits {
  pageContentLimit: number;
  selectedTextLimit: number;
  historyLimit: number;
}

export interface ChromePromptResult {
  prompt: string;
  userNotice: string | null;
  userNoticeTitle: string | null;
}

export const DEFAULT_CHROME_PROMPT_LIMITS: ChromePromptLimits = {
  pageContentLimit: CHROME_PAGE_CONTENT_CHAR_LIMIT,
  selectedTextLimit: CHROME_SELECTED_TEXT_CHAR_LIMIT,
  historyLimit: CHROME_HISTORY_CHAR_LIMIT,
};

export const CHROME_RETRY_PROMPT_LIMITS: ChromePromptLimits = {
  pageContentLimit: 4_000,
  selectedTextLimit: 2_000,
  historyLimit: 2_000,
};

export const SPARK_RECOMMENDATION_CHROME_PROMPT_LIMITS: ChromePromptLimits = {
  pageContentLimit: 1_500,
  selectedTextLimit: 1_000,
  historyLimit: 9_000,
};

export const SPARK_RECOMMENDATION_CHROME_RETRY_PROMPT_LIMITS: ChromePromptLimits = {
  pageContentLimit: 700,
  selectedTextLimit: 500,
  historyLimit: 5_000,
};

export function toChatApiMessages(
  messages: ChatUiMessage[],
  context?: ChatPromptContext
): ChatMessage[] {
  const contextText = context ? buildContextText(context) : "";
  const apiMessages: ChatMessage[] = messages.map((message) => ({
    id: message.id,
    role: message.role,
    parts: [{ type: "text", text: message.content }],
  }));

  if (!contextText) return apiMessages;
  return [
    {
      role: "system",
      parts: [{ type: "text", text: contextText }],
    },
    ...apiMessages,
  ];
}

export function buildChromeChatPrompt(
  messages: ChatUiMessage[],
  context: ChatPromptContext,
  limits: ChromePromptLimits = DEFAULT_CHROME_PROMPT_LIMITS,
  pageContextMode: PageContextMode = "trim",
  query = messages.filter((message) => message.role === "user").at(-1)?.content ?? ""
): ChromePromptResult {
  const parts = [];
  const compactedPageContent = (() => {
    if (pageContextMode === "compact-v2") {
      return compactPageContentV2(
        context.pageBlocks,
        context.pageContent,
        query,
        limits.pageContentLimit
      );
    }
    if (pageContextMode === "compact") {
      return compactPageContent(
        context.pageBlocks,
        context.pageContent,
        query,
        limits.pageContentLimit
      );
    }
    return null;
  })();
  const clippedPageContent = compactedPageContent
    ? { text: compactedPageContent.text, truncated: compactedPageContent.compacted }
    : clipStart(context.pageContent, limits.pageContentLimit);
  const clippedSelectedText = clipStart(context.selectedText, limits.selectedTextLimit);
  const contextText = buildContextText({
    pageUrl: context.pageUrl,
    pageContent: clippedPageContent.text,
    pageBlocks: [],
    selectedText: clippedSelectedText.text,
  });
  if (contextText) parts.push(contextText);

  const rawHistory = messages
    .map((message) => `${message.role === "user" ? "User" : "Assistant"}:\n${message.content}`)
    .join("\n\n");
  const clippedHistory = clipEnd(rawHistory, limits.historyLimit);
  if (clippedHistory.text) parts.push(`Conversation:\n${clippedHistory.text}`);

  const trimmedDetails = [
    clippedPageContent.truncated
      ? compactedPageContent
        ? `page context after compaction: ${clippedPageContent.text.length} of ${compactedPageContent.originalCharCount} chars (${compactedPageContent.selectedChunkCount}/${compactedPageContent.totalChunkCount} sections)`
        : `page content after trimming: ${clippedPageContent.text.length} chars`
      : null,
    clippedSelectedText.truncated
      ? `highlighted text after trimming: ${clippedSelectedText.text.length} chars`
      : null,
    clippedHistory.truncated
      ? `chat history after trimming: ${clippedHistory.text.length} chars`
      : null,
  ].filter(Boolean);
  const trimmedItems = [
    clippedPageContent.truncated ? "page content" : null,
    clippedSelectedText.truncated ? "highlighted text" : null,
    clippedHistory.truncated ? "chat history" : null,
  ].filter(Boolean);

  return {
    prompt: parts.join("\n\n---\n\n"),
    userNotice: trimmedItems.length
      ? compactedPageContent?.compacted &&
        !clippedSelectedText.truncated &&
        !clippedHistory.truncated
        ? "Page context was compacted to relevant sections."
        : "Number of chars exceeds model context. Content was reduced."
      : null,
    userNoticeTitle: trimmedDetails.length ? trimmedDetails.join(", ") : null,
  };
}

export function buildContextText(context: ChatPromptContext): string {
  const parts = [];
  if (context.pageUrl) parts.push(`Page URL:\n${context.pageUrl}`);
  if (context.pageContent) parts.push(`Page content:\n${context.pageContent}`);
  if (context.selectedText) parts.push(`Highlighted text:\n${context.selectedText}`);
  return parts.join("\n\n");
}

export async function promptChromeSession({
  session,
  prompt,
  signal,
  onText,
}: {
  session: LanguageModelSession;
  prompt: string;
  signal: AbortSignal;
  onText: (content: string) => void;
}): Promise<string> {
  if (!session.promptStreaming) {
    const response = await session.prompt(prompt, { signal });
    onText(response);
    return response;
  }

  const stream = session.promptStreaming(prompt, { signal });
  let response = "";

  if (isReadableStream(stream)) {
    const reader = stream.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        response = mergeChromeStreamChunk(response, value);
        onText(response);
      }
    } finally {
      reader.releaseLock();
    }
    return response;
  }

  for await (const chunk of stream) {
    response = mergeChromeStreamChunk(response, chunk);
    onText(response);
  }
  return response;
}

export function mergeChromeStreamChunk(current: string, chunk: string): string {
  if (chunk.startsWith(current)) return chunk;
  return current + chunk;
}

export function isInputTooLargeError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "QuotaExceededError") return true;
  const message = error instanceof Error ? error.message : String(error);
  return /input\s+is\s+too\s+large|too\s+many\s+tokens|exceeds?\s+(the\s+)?(context|quota|token)/i.test(
    message
  );
}

export function getChatContextLimitState(counts: ChatContextCounts): ChatContextLimitState {
  return {
    exceedsPageContentLimit:
      counts.pageContent !== null && counts.pageContent > CHROME_PAGE_CONTENT_CHAR_LIMIT,
    exceedsSelectedTextLimit:
      counts.selectedText !== null && counts.selectedText > CHROME_SELECTED_TEXT_CHAR_LIMIT,
  };
}

function isReadableStream(value: unknown): value is ReadableStream<string> {
  return typeof value === "object" && value !== null && "getReader" in value;
}

function clipStart(text: string, limit: number) {
  if (text.length <= limit) return { text, truncated: false };
  return {
    text: `${text.slice(0, limit)}\n\n[Content trimmed for Google local model context limit.]`,
    truncated: true,
  };
}

function clipEnd(text: string, limit: number) {
  if (text.length <= limit) return { text, truncated: false };
  return {
    text: `[Earlier conversation trimmed for Google local model context limit.]\n\n${text.slice(-limit)}`,
    truncated: true,
  };
}
