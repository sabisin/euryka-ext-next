// Types for Chrome's built-in AI Prompt API (window.LanguageModel).
// Declared once here — duplicating the `declare global` in multiple modules
// creates two structurally identical but distinct types, which TypeScript
// rejects with TS2717 ("subsequent property declarations must have the same
// type").

export type PromptAvailability = "unavailable" | "downloadable" | "downloading" | "available";

export interface LanguageModelSession {
  prompt: (input: string, options?: { signal?: AbortSignal }) => Promise<string>;
  promptStreaming?: (
    input: string,
    options?: { signal?: AbortSignal }
  ) => ReadableStream<string> | AsyncIterable<string>;
  destroy?: () => void;
}

export interface LanguageModelApi {
  availability: (options?: unknown) => Promise<PromptAvailability>;
  create: (options?: unknown) => Promise<LanguageModelSession>;
}

declare global {
  interface Window {
    LanguageModel?: LanguageModelApi;
  }
}
