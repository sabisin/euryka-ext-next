import { describe, expect, test } from "bun:test";
import {
  buildChromeChatPrompt,
  getChatContextLimitState,
  isInputTooLargeError,
  mergeChromeStreamChunk,
  toChatApiMessages,
} from "./chat-prompt.ts";

const messages = [
  { id: "u1", role: "user", content: "What matters?", createdAt: 1 },
  { id: "a1", role: "assistant", content: "The relevant details.", createdAt: 2 },
];

const context = {
  pageUrl: "https://example.com/article",
  pageContent: "Page context that should be included.",
  pageBlocks: [],
  selectedText: "Highlighted sentence.",
};

describe("chat prompt construction", () => {
  test("prepends page context to backend chat messages", () => {
    const result = toChatApiMessages(messages, context);

    expect(result[0].role).toBe("system");
    expect(result[0].parts[0].text).toContain("Page URL:\nhttps://example.com/article");
    expect(result[0].parts[0].text).toContain("Highlighted text:\nHighlighted sentence.");
    expect(result.slice(1).map((message) => message.role)).toEqual(["user", "assistant"]);
  });

  test("compacts page context and trims selection and history with explicit limits", () => {
    const result = buildChromeChatPrompt(
      messages,
      { ...context, pageContent: "P".repeat(30), selectedText: "S".repeat(20) },
      { pageContentLimit: 10, selectedTextLimit: 8, historyLimit: 20 }
    );

    expect(result.prompt).toContain("P".repeat(10));
    expect(result.prompt).toContain("S".repeat(8));
    expect(result.prompt).toContain("Earlier conversation trimmed");
    expect(result.userNotice).toContain("Content was reduced");
    expect(result.userNoticeTitle).toContain("page context after compaction");
  });

  test("reports context limit state using Chrome model limits", () => {
    expect(getChatContextLimitState({ pageContent: 10_001, selectedText: 4_001 })).toEqual({
      exceedsPageContentLimit: true,
      exceedsSelectedTextLimit: true,
    });
    expect(getChatContextLimitState({ pageContent: null, selectedText: 4_000 })).toEqual({
      exceedsPageContentLimit: false,
      exceedsSelectedTextLimit: false,
    });
    expect(
      getChatContextLimitState(
        { pageContent: 1_501, selectedText: 1_001 },
        { pageContentLimit: 1_500, selectedTextLimit: 1_000, historyLimit: 9_000 }
      )
    ).toEqual({
      exceedsPageContentLimit: true,
      exceedsSelectedTextLimit: true,
    });
  });
});

describe("Chrome prompt streaming helpers", () => {
  test("supports cumulative and incremental stream chunks", () => {
    expect(mergeChromeStreamChunk("Hello", "Hello world")).toBe("Hello world");
    expect(mergeChromeStreamChunk("Hello", " world")).toBe("Hello world");
  });

  test("only classifies known oversized-input errors", () => {
    expect(isInputTooLargeError(new Error("Input is too large"))).toBe(true);
    expect(isInputTooLargeError(new Error("Too many tokens"))).toBe(true);
    expect(isInputTooLargeError(new Error("Network connection failed"))).toBe(false);
  });
});
