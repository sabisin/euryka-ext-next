import type { ChatRequest, ChatSource, MessageChunk } from "./types";

const BASE_URL = import.meta.env.WXT_BASE_URL as string;

export interface ChatStreamHandlers {
  onChunk?: (chunk: MessageChunk) => void;
  onTextDelta?: (delta: string, id: string) => void;
  onSource?: (source: ChatSource) => void;
  onError?: (message: string) => void;
  onFinish?: (finishReason?: string) => void;
}

export interface ChatStreamResponse {
  chatId: string | null;
}

export async function streamChatResponse(
  apiKey: string,
  payload: ChatRequest,
  handlers: ChatStreamHandlers,
  signal?: AbortSignal
): Promise<ChatStreamResponse> {
  const res = await fetch(`${BASE_URL}/api/v1/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify(payload),
    signal,
  });

  if (!res.ok) {
    throw new Error(await getChatErrorMessage(res));
  }

  if (!res.body) {
    throw new Error("Chat response did not include a stream.");
  }

  const chatId = res.headers.get("x-chat-id");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() ?? "";

    for (const event of events) {
      emitEvent(event, handlers);
    }
  }

  const tail = buffer + decoder.decode();
  if (tail.trim()) emitEvent(tail, handlers);

  return { chatId };
}

export async function openChatThread(apiKey: string, chatId: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/v1/chat/${encodeURIComponent(chatId)}/threads`, {
    method: "GET",
    headers: {
      "x-api-key": apiKey,
    },
  });

  if (!res.ok) {
    throw new Error(await getChatErrorMessage(res));
  }

  return res.url || `${BASE_URL}/api/v1/chat/${encodeURIComponent(chatId)}/threads`;
}

async function getChatErrorMessage(res: Response): Promise<string> {
  const fallback = `Chat request failed (${res.status}).`;

  try {
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const body = (await res.json()) as { message?: string; error?: string };
      return body.message || body.error || fallback;
    }
    return (await res.text()) || fallback;
  } catch {
    return fallback;
  }
}

function emitEvent(event: string, handlers: ChatStreamHandlers) {
  const data = event
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("\n");

  if (!data || data === "[DONE]") return;

  let chunk: MessageChunk;
  try {
    chunk = JSON.parse(data) as MessageChunk;
  } catch {
    return;
  }

  handlers.onChunk?.(chunk);

  if (chunk.type === "text-delta") {
    handlers.onTextDelta?.(chunk.delta, chunk.id);
  } else if (chunk.type === "source-url") {
    handlers.onSource?.({
      sourceId: chunk.sourceId,
      url: chunk.url,
      title: chunk.title,
    });
  } else if (chunk.type === "error") {
    handlers.onError?.(chunk.errorText);
  } else if (chunk.type === "finish") {
    handlers.onFinish?.(chunk.finishReason);
  }
}
