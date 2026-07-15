import type { QueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { fetchSparks } from "../lib/api";
import { getValidToken } from "../lib/auth";
import { openChatThread, streamChatResponse } from "../lib/chat-api";
import {
  CHROME_RETRY_PROMPT_LIMITS,
  type ChatContextCounts,
  type ChatPromptContext,
  SPARK_RECOMMENDATION_CHROME_PROMPT_LIMITS,
  SPARK_RECOMMENDATION_CHROME_RETRY_PROMPT_LIMITS,
  buildChromeChatPrompt,
  getChatContextLimitState,
  isInputTooLargeError,
  promptChromeSession,
  toChatApiMessages,
} from "../lib/chat-prompt";
import type { LanguageModelSession } from "../lib/chrome-ai";
import { debugLog } from "../lib/debug";
import { sendMessage } from "../lib/messaging";
import { selectSparkRecommendationCandidates } from "../lib/spark-candidate-search";
import {
  type SparkCatalogItem,
  buildSparkCatalog,
  buildSparkCatalogText,
  summarizeSparkCatalog,
  summarizeSparkGroups,
} from "../lib/spark-catalog";
import {
  type SparkRecommendationResult,
  buildSparkRecommendationAssistantMessage,
  buildSparkRecommendationUserPrompt,
  resolveSparkRecommendation,
} from "../lib/spark-recommendation";
import { sparkCacheStorage } from "../lib/storage";
import type { ChatMode, ChatUiMessage, Spark, SparkGroup } from "../lib/types";
import { useUIStore } from "../store/ui";

const ENABLE_EURYKA_CHAT_PROVIDER = false;
const CHROME_CHAT_SESSION_OPTIONS = {
  expectedInputs: [{ type: "text", languages: ["en"] }],
  expectedOutputs: [{ type: "text", languages: ["en"] }],
};
const logSparkRecommendation = debugLog("[Euryka spark recommendation]");

type UseChatControllerOptions = {
  queryClient: QueryClient;
  tabId: number | null;
  currentTabUrl: string | null;
  chatApiKey?: string;
  selectedBrandId: string | null;
  selectedProjectId: string | null;
};

export function useChatController({
  queryClient,
  tabId,
  currentTabUrl,
  chatApiKey,
  selectedBrandId,
  selectedProjectId,
}: UseChatControllerOptions) {
  const state = useUIStore(
    useShallow((value) => ({
      showChatResult: value.showChatResult,
      chatId: value.chatId,
      chatMessages: value.chatMessages,
    }))
  );
  const actions = useUIStore(
    useShallow((value) => ({
      setPage: value.setPage,
      setSelectedImageUrl: value.setSelectedImageUrl,
      setShowSparkResult: value.setShowSparkResult,
      setShowChatResult: value.setShowChatResult,
      setChatId: value.setChatId,
      setChatMessages: value.setChatMessages,
      setChatSources: value.setChatSources,
      setChatError: value.setChatError,
      setChatStreaming: value.setChatStreaming,
    }))
  );
  const { showChatResult, chatId, chatMessages } = state;
  const {
    setPage,
    setSelectedImageUrl,
    setShowSparkResult,
    setShowChatResult,
    setChatId,
    setChatMessages,
    setChatSources,
    setChatError,
    setChatStreaming,
  } = actions;
  const chatAbortRef = useRef<AbortController | null>(null);
  const chatRunIdRef = useRef(0);
  const [includeChatPageContent, setIncludeChatPageContent] = useState(true);
  const [includeChatSelectedText, setIncludeChatSelectedText] = useState(false);
  const [chatMode, setChatMode] = useState<ChatMode>("chat");
  const [sparkRecommendationResult, setSparkRecommendationResult] =
    useState<SparkRecommendationResult | null>(null);
  const [chatContextCounts, setChatContextCounts] = useState<ChatContextCounts>({
    pageContent: null,
    selectedText: null,
  });
  const [chatUserNotice, setChatUserNotice] = useState<string | null>(null);
  const [chatUserNoticeTitle, setChatUserNoticeTitle] = useState<string | null>(null);
  const [chatProviderDebugStatus, setChatProviderDebugStatus] =
    useState<string>("Google Chrome AI");

  const handleStopChat = () => {
    chatRunIdRef.current += 1;
    chatAbortRef.current?.abort();
    chatAbortRef.current = null;
    setChatStreaming(false);
  };
  const updateChatContextLimitNotice = (counts: ChatContextCounts, trimmed: boolean) => {
    const limits =
      chatMode === "spark-recommendation" ? SPARK_RECOMMENDATION_CHROME_PROMPT_LIMITS : undefined;
    const limitState = getChatContextLimitState(counts, limits);
    if (!limitState.exceedsPageContentLimit && !limitState.exceedsSelectedTextLimit) {
      setChatUserNotice(null);
      setChatUserNoticeTitle(null);
      return;
    }

    const pageWillBeCompacted = limitState.exceedsPageContentLimit;
    setChatUserNotice(
      pageWillBeCompacted && !limitState.exceedsSelectedTextLimit
        ? trimmed
          ? "Page context was compacted because it exceeded the model limit."
          : "Page context is too large and will be compacted."
        : trimmed
          ? "Number of chars exceeds model context. Content was trimmed."
          : "Number of chars exceeds model context. Content will be trimmed."
    );
    setChatUserNoticeTitle(null);
  };

  const fetchChatPromptContext = async (): Promise<ChatPromptContext | null> => {
    const needsPageContent = includeChatPageContent;
    const needsSelectedText = includeChatSelectedText;

    if (!needsPageContent && !needsSelectedText) {
      setChatContextCounts({ pageContent: null, selectedText: null });
      return { pageUrl: currentTabUrl ?? "", pageContent: "", pageBlocks: [], selectedText: "" };
    }

    if (tabId === null) {
      setChatContextCounts({ pageContent: null, selectedText: null });
      setChatError("No active tab is attached to this sidepanel.");
      return null;
    }

    const [tabUrl, page, selection] = await Promise.all([
      sendMessage("getTabUrl", { tabId: tabId }).catch(() => ({ url: currentTabUrl ?? "" })),
      needsPageContent
        ? sendMessage("extractText", undefined, tabId).catch(() => null)
        : Promise.resolve(null),
      needsSelectedText
        ? sendMessage("getSelectedText", undefined, tabId).catch(() => null)
        : Promise.resolve(null),
    ]);

    const context: ChatPromptContext = {
      pageUrl: tabUrl.url.trim(),
      pageContent: page?.text.trim() ?? "",
      pageBlocks: page?.blocks ?? [],
      selectedText: selection?.text.trim() ?? "",
    };

    if (needsPageContent && !context.pageContent) {
      setChatContextCounts({
        pageContent: context.pageContent.length,
        selectedText: needsSelectedText ? context.selectedText.length : null,
      });
      setChatError("Page content was requested, but no page text is available.");
      return null;
    }
    if (needsSelectedText && !context.selectedText) {
      setChatContextCounts({
        pageContent: needsPageContent ? context.pageContent.length : null,
        selectedText: context.selectedText.length,
      });
      setChatError("Highlighted text was requested, but no current selection is available.");
      return null;
    }

    const counts = {
      pageContent: needsPageContent ? context.pageContent.length : null,
      selectedText: needsSelectedText ? context.selectedText.length : null,
    };
    setChatContextCounts(counts);
    updateChatContextLimitNotice(counts, false);
    return context;
  };

  const refreshChatContextPreview = async (
    needsPageContent: boolean,
    needsSelectedText: boolean
  ) => {
    setChatUserNotice(null);
    setChatUserNoticeTitle(null);

    if (!needsPageContent && !needsSelectedText) {
      setChatContextCounts({ pageContent: null, selectedText: null });
      return;
    }

    if (tabId === null) {
      setChatContextCounts({ pageContent: null, selectedText: null });
      return;
    }

    const [page, selection] = await Promise.all([
      needsPageContent
        ? sendMessage("extractText", undefined, tabId).catch(() => null)
        : Promise.resolve(null),
      needsSelectedText
        ? sendMessage("getSelectedText", undefined, tabId).catch(() => null)
        : Promise.resolve(null),
    ]);

    const counts = {
      pageContent: needsPageContent ? (page?.text.trim().length ?? 0) : null,
      selectedText: needsSelectedText ? (selection?.text.trim().length ?? 0) : null,
    };
    setChatContextCounts(counts);
    updateChatContextLimitNotice(counts, false);
  };

  const handleIncludeChatPageContentChange = (checked: boolean) => {
    setIncludeChatPageContent(checked);
    if (checked) {
      setIncludeChatSelectedText(false);
      void refreshChatContextPreview(true, false);
      return;
    }
    void refreshChatContextPreview(false, includeChatSelectedText);
  };

  const handleIncludeChatSelectedTextChange = (checked: boolean) => {
    setIncludeChatSelectedText(checked);
    if (checked) {
      setIncludeChatPageContent(false);
      void refreshChatContextPreview(false, true);
      return;
    }
    void refreshChatContextPreview(includeChatPageContent, false);
  };

  const handleChatModeChange = (mode: ChatMode) => {
    setChatMode(mode);
    if (mode !== "spark-recommendation") return;

    setIncludeChatPageContent(false);
    setIncludeChatSelectedText(false);
    setChatContextCounts({ pageContent: null, selectedText: null });
    setChatUserNotice(null);
    setChatUserNoticeTitle(null);
  };

  const loadSparkGroupsForRecommendation = async (): Promise<SparkGroup[]> => {
    const cached = queryClient.getQueryData<SparkGroup[]>(["sparks"]);
    if (cached && cached.length > 0) {
      logSparkRecommendation("using cached spark catalog", summarizeSparkGroups(cached));
      return cached;
    }

    logSparkRecommendation("fetching spark catalog");
    return queryClient.fetchQuery({
      queryKey: ["sparks"],
      staleTime: 10 * 60_000,
      queryFn: async () => {
        const token = await getValidToken();
        if (!token) throw new Error("Not authenticated");
        const { sparks } = await fetchSparks(token);
        logSparkRecommendation("fetched spark catalog", summarizeSparkGroups(sparks));
        const sparkCache = Object.fromEntries(
          sparks.flatMap((group) => group.sparks).map((spark) => [spark.id, spark])
        );
        await sparkCacheStorage.setValue(sparkCache);
        return sparks;
      },
    });
  };

  const handleStartChat = async (
    message: string,
    continueConversation = showChatResult,
    historyOverride?: ChatUiMessage[]
  ) => {
    const runId = ++chatRunIdRef.current;
    const isSparkRecommendation = chatMode === "spark-recommendation";
    const shouldContinueConversation = !isSparkRecommendation && continueConversation;
    const conversationMessages = historyOverride ?? chatMessages;

    setPage("sparks");
    setSelectedImageUrl(null);
    setShowSparkResult(false);
    setShowChatResult(true);
    setSparkRecommendationResult(null);
    setChatError(null);
    setChatSources([]);
    setChatUserNotice(null);
    setChatUserNoticeTitle(null);
    const activeChatId = shouldContinueConversation ? chatId : null;

    if (!shouldContinueConversation) {
      setChatId(null);
    }

    if (chatAbortRef.current) {
      chatAbortRef.current.abort();
      chatAbortRef.current = null;
    }

    const userMessage: ChatUiMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: message,
      createdAt: Date.now(),
    };

    let sparkGroups: SparkGroup[] = [];
    let allSparks: Spark[] = [];
    let sparkCatalog: SparkCatalogItem[] = [];
    if (isSparkRecommendation) {
      try {
        sparkGroups = await loadSparkGroupsForRecommendation();
      } catch {
        setChatMessages([userMessage]);
        setChatError("We couldn't load sparks to recommend from. Please retry shortly.");
        return;
      }
      allSparks = sparkGroups.flatMap((group) => group.sparks);
      const fullSparkCatalog = buildSparkCatalog(sparkGroups);
      const candidateSearch = selectSparkRecommendationCandidates(message, fullSparkCatalog);
      sparkCatalog = candidateSearch.candidates;
      const compactCatalogText = buildSparkCatalogText(sparkCatalog);
      logSparkRecommendation("selected recommendation candidates", {
        strategy: candidateSearch.matched ? "lexical-prefilter" : "full-catalog-fallback",
        elapsedMs: Number(candidateSearch.elapsedMs.toFixed(3)),
        queryTokens: candidateSearch.queryTokens,
        totalCatalogSize: fullSparkCatalog.length,
        candidateCount: sparkCatalog.length,
        candidateScores: candidateSearch.scores,
        candidateIds: sparkCatalog.map((spark) => spark.id),
      });
      logSparkRecommendation("prepared spark catalog for prompt", {
        ...summarizeSparkCatalog(sparkGroups, fullSparkCatalog),
        promptCandidateCount: sparkCatalog.length,
        catalogJsonChars: JSON.stringify(sparkCatalog).length,
        compactCatalogChars: compactCatalogText.length,
        catalog: sparkCatalog,
      });
      if (allSparks.length === 0) {
        setChatMessages([userMessage]);
        setChatError("No sparks are available to recommend.");
        return;
      }
    }

    const context = await fetchChatPromptContext();
    if (!context) {
      // fetchChatPromptContext already set a chat error — still show the
      // user's message so their typed text isn't silently lost.
      setChatMessages([
        ...(shouldContinueConversation
          ? conversationMessages.filter((item) => item.content.trim())
          : []),
        userMessage,
      ]);
      return;
    }

    const modelUserMessage = isSparkRecommendation
      ? {
          ...userMessage,
          content: buildSparkRecommendationUserPrompt(message, sparkCatalog),
        }
      : userMessage;
    if (isSparkRecommendation) {
      logSparkRecommendation("built recommendation prompt", {
        userIntentChars: message.length,
        promptChars: modelUserMessage.content.length,
        context: {
          pageUrlChars: context.pageUrl.length,
          pageContentChars: context.pageContent.length,
          selectedTextChars: context.selectedText.length,
        },
      });
    }
    const history = [
      ...(shouldContinueConversation
        ? conversationMessages.filter((item) => item.content.trim())
        : []),
      userMessage,
    ];
    const modelHistory = isSparkRecommendation
      ? [modelUserMessage]
      : [
          ...(shouldContinueConversation
            ? conversationMessages.filter((item) => item.content.trim())
            : []),
          modelUserMessage,
        ];
    const assistantMessage: ChatUiMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      createdAt: Date.now(),
    };

    setChatMessages([...history, assistantMessage]);
    setChatStreaming(true);

    try {
      const chromeResult = await runChromeChat({
        assistantMessageId: assistantMessage.id,
        context,
        history: modelHistory,
        query: message,
        runId,
        suppressAssistantText: isSparkRecommendation,
      });

      if (chromeResult.used) {
        if (isSparkRecommendation) {
          logSparkRecommendation("received Chrome recommendation response", {
            responseChars: chromeResult.content.length,
            responsePreview: chromeResult.content.slice(0, 800),
          });
          finalizeSparkRecommendationResponse(chromeResult.content, assistantMessage.id, allSparks);
        }
        return;
      }

      if (!ENABLE_EURYKA_CHAT_PROVIDER) {
        setChatError(
          "Google Chrome AI is not available in this browser yet. Update Chrome and make sure built-in AI is enabled."
        );
        return;
      }

      const backendContent = await runBackendChat({
        activeChatId,
        assistantMessageId: assistantMessage.id,
        context,
        continueConversation: shouldContinueConversation,
        history: modelHistory,
        userMessage: modelUserMessage,
        suppressAssistantText: isSparkRecommendation,
      });
      if (isSparkRecommendation && backendContent !== null) {
        logSparkRecommendation("received backend recommendation response", {
          responseChars: backendContent.length,
          responsePreview: backendContent.slice(0, 800),
        });
        finalizeSparkRecommendationResponse(backendContent, assistantMessage.id, allSparks);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      setChatError(
        error instanceof Error ? error.message : "We couldn't complete the chat request."
      );
    } finally {
      if (chatRunIdRef.current === runId) {
        setChatStreaming(false);
      }
    }
  };

  const handleRetryChat = () => {
    const lastUserIndex = chatMessages.findLastIndex((message) => message.role === "user");
    if (lastUserIndex < 0) return;

    const lastUserMessage = chatMessages[lastUserIndex];
    const previousMessages = chatMessages.slice(0, lastUserIndex);
    void handleStartChat(lastUserMessage.content, previousMessages.length > 0, previousMessages);
  };

  const runChromeChat = async ({
    assistantMessageId,
    context,
    history,
    query,
    runId,
    suppressAssistantText = false,
  }: {
    assistantMessageId: string;
    context: ChatPromptContext;
    history: ChatUiMessage[];
    query: string;
    runId: number;
    suppressAssistantText?: boolean;
  }): Promise<{ used: boolean; content: string }> => {
    const languageModel = window.LanguageModel;
    if (!languageModel) {
      setChatProviderDebugStatus("Google unavailable");
      return { used: false, content: "" };
    }

    const availability = await languageModel.availability(CHROME_CHAT_SESSION_OPTIONS);
    if (availability === "unavailable") {
      setChatProviderDebugStatus("Google unavailable");
      return { used: false, content: "" };
    }

    setChatProviderDebugStatus(
      availability === "available" ? "Google Chrome AI" : "Google preparing"
    );

    const controller = new AbortController();
    chatAbortRef.current = controller;
    let session: LanguageModelSession | null = null;
    try {
      session = await languageModel.create({
        ...CHROME_CHAT_SESSION_OPTIONS,
        signal: controller.signal,
      });
      const initialPrompt = buildChromeChatPrompt(
        history,
        context,
        suppressAssistantText ? SPARK_RECOMMENDATION_CHROME_PROMPT_LIMITS : undefined,
        query
      );
      if (suppressAssistantText) {
        logSparkRecommendation("using Chrome provider", {
          promptChars: initialPrompt.prompt.length,
          userNotice: initialPrompt.userNotice,
          userNoticeTitle: initialPrompt.userNoticeTitle,
        });
      }
      setChatUserNotice(initialPrompt.userNotice);
      setChatUserNoticeTitle(initialPrompt.userNoticeTitle);

      let response: string;
      try {
        response = await promptChromeSession({
          session,
          prompt: initialPrompt.prompt,
          signal: controller.signal,
          onText: (content) => {
            if (chatRunIdRef.current !== runId) return;
            if (suppressAssistantText) return;
            setChatMessages((current) =>
              current.map((item) => (item.id === assistantMessageId ? { ...item, content } : item))
            );
          },
        });
      } catch (error) {
        if (!isInputTooLargeError(error)) throw error;
        const retryPrompt = buildChromeChatPrompt(
          history,
          context,
          suppressAssistantText
            ? SPARK_RECOMMENDATION_CHROME_RETRY_PROMPT_LIMITS
            : CHROME_RETRY_PROMPT_LIMITS,
          query
        );
        setChatUserNotice(
          retryPrompt.userNotice ?? "Number of chars exceeds model context. Content was trimmed."
        );
        setChatUserNoticeTitle(retryPrompt.userNoticeTitle ?? "Retried with tighter context.");
        if (suppressAssistantText) {
          logSparkRecommendation("retrying Chrome provider with tighter limits", {
            promptChars: retryPrompt.prompt.length,
            userNotice: retryPrompt.userNotice,
            userNoticeTitle: retryPrompt.userNoticeTitle,
          });
        }
        response = await promptChromeSession({
          session,
          prompt: retryPrompt.prompt,
          signal: controller.signal,
          onText: (content) => {
            if (chatRunIdRef.current !== runId) return;
            if (suppressAssistantText) return;
            setChatMessages((current) =>
              current.map((item) => (item.id === assistantMessageId ? { ...item, content } : item))
            );
          },
        });
      }

      if (chatRunIdRef.current !== runId) return { used: true, content: response };
      setChatId(null);
      if (!suppressAssistantText) {
        setChatMessages((current) =>
          current.map((item) =>
            item.id === assistantMessageId ? { ...item, content: response } : item
          )
        );
      }
      setChatProviderDebugStatus("Google Chrome AI");
      return { used: true, content: response };
    } finally {
      if (chatAbortRef.current === controller) {
        chatAbortRef.current = null;
      }
      session?.destroy?.();
    }
  };

  const runBackendChat = async ({
    activeChatId,
    assistantMessageId,
    context,
    continueConversation,
    history,
    userMessage,
    suppressAssistantText = false,
  }: {
    activeChatId: string | null;
    assistantMessageId: string;
    context: ChatPromptContext;
    continueConversation: boolean;
    history: ChatUiMessage[];
    userMessage: ChatUiMessage;
    suppressAssistantText?: boolean;
  }): Promise<string | null> => {
    const apiKey = chatApiKey?.trim();
    if (!apiKey) {
      setChatMessages([]);
      setChatId(null);
      setChatError("Add your Euryka API key in Settings to use chat.");
      return null;
    }

    const controller = new AbortController();
    chatAbortRef.current = controller;
    let streamedText = "";
    if (suppressAssistantText) {
      logSparkRecommendation("using backend provider");
    }

    try {
      const requestMessages = continueConversation && activeChatId ? [userMessage] : history;
      const response = await streamChatResponse(
        apiKey,
        {
          ...(activeChatId ? { chatId: activeChatId } : {}),
          messages: toChatApiMessages(requestMessages, context),
          brandId: selectedBrandId ?? undefined,
          projectId: selectedProjectId ?? undefined,
          timestampString: new Date().toString(),
        },
        {
          onTextDelta: (delta) => {
            streamedText += delta;
            if (!suppressAssistantText) {
              setChatMessages((current) =>
                current.map((item) =>
                  item.id === assistantMessageId ? { ...item, content: item.content + delta } : item
                )
              );
            }
          },
          onSource: (source) => {
            setChatSources((current) =>
              current.some((item) => item.sourceId === source.sourceId || item.url === source.url)
                ? current
                : [...current, source]
            );
          },
          onError: (errorText) => setChatError(errorText),
        },
        controller.signal
      );
      if (response.chatId) {
        setChatId(response.chatId);
      }
      setChatProviderDebugStatus("Euryka");
      return streamedText;
    } finally {
      if (chatAbortRef.current === controller) {
        chatAbortRef.current = null;
      }
    }
  };

  const finalizeSparkRecommendationResponse = (
    responseText: string,
    assistantMessageId: string,
    sparks: Spark[]
  ) => {
    const result = resolveSparkRecommendation(responseText, sparks);
    if (!result) {
      logSparkRecommendation("failed to parse or match recommendation response", {
        availableSparkCount: sparks.length,
        responseChars: responseText.length,
        responsePreview: responseText.slice(0, 1200),
      });
      setChatMessages((current) =>
        current.map((item) =>
          item.id === assistantMessageId
            ? {
                ...item,
                content:
                  responseText.trim() ||
                  "We couldn't match a spark recommendation from the model response.",
              }
            : item
        )
      );
      return;
    }

    logSparkRecommendation("matched recommendation", {
      sparkId: result.spark.id,
      sparkTitle: result.spark.title,
      confidence: result.recommendation.confidence,
      reason: result.recommendation.reason,
    });
    setSparkRecommendationResult(result);
    setChatMessages((current) =>
      current.map((item) =>
        item.id === assistantMessageId
          ? { ...item, content: buildSparkRecommendationAssistantMessage(result) }
          : item
      )
    );
  };

  const handleBackFromChat = () => {
    handleStopChat();
    setSparkRecommendationResult(null);
    setShowChatResult(false);
  };

  const handleOpenChatThread = async () => {
    const apiKey = chatApiKey?.trim();
    if (!apiKey) {
      setChatError("Add your Euryka API key in Settings to open this chat in threads.");
      return;
    }
    if (!chatId) {
      setChatError("Start a chat before opening it in threads.");
      return;
    }

    setChatError(null);
    try {
      const threadUrl = await openChatThread(apiKey, chatId);
      chrome.tabs.create({ url: threadUrl });
    } catch (error) {
      setChatError(
        error instanceof Error ? error.message : "We couldn't open this chat in threads."
      );
    }
  };

  return {
    includeChatPageContent,
    includeChatSelectedText,
    chatMode,
    sparkRecommendationResult,
    chatContextCounts,
    chatUserNotice,
    chatUserNoticeTitle,
    chatProviderDebugStatus,
    setChatMode: handleChatModeChange,
    handleIncludeChatPageContentChange,
    handleIncludeChatSelectedTextChange,
    handleStartChat,
    handleStopChat,
    handleRetryChat,
    handleBackFromChat,
    handleOpenChatThread,
    clearSparkRecommendation: () => setSparkRecommendationResult(null),
  };
}
