/// <reference path="../../.wxt/wxt.d.ts" />

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Monitor, Moon, Sun } from "lucide-react";
import { ThemeProvider } from "../../hooks/use-theme";
import { useStorageItem } from "../../hooks/use-storage-item";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { onMessage, removeAllListeners, sendMessage } from "../../lib/messaging";
import {
  authStorage,
  chatApiKeyStorage,
  collectionsStorage,
  collectionItemsStorage,
  currentIdentityStorage,
  pageTextStorage,
  pageUrlStorage,
  selectedTextStorage,
  sparkCacheStorage,
  userPrefs,
} from "../../lib/storage";
import { decodeJwt, getValidToken, runWithTokenRetry } from "../../lib/auth";
import type { LanguageModelSession } from "../../lib/chrome-ai";
import { DEBUG, debugLog } from "../../lib/debug";
import { analyseImage as apiAnalyseImage, fetchSparks } from "../../lib/api";
import { openChatThread, streamChatResponse } from "../../lib/chat-api";
import { uploadFileWithRetry } from "../../lib/image-utils";
import {
  buildFallbackProspect,
  DEFAULT_LINKEDIN_PROSPECTOR_STATUS,
  LINKEDIN_PROSPECTOR_SPARK,
} from "../../lib/prospector";
import { useUIStore } from "../../store/ui";
import { useWorkspaceData } from "../../hooks/use-workspace";
import { useRunSpark } from "../../hooks/use-sparks";
import { LoggedOut } from "../../components/layout/LoggedOut";
import { Header } from "../../components/layout/Header";
import { AppSidebar, NavRail } from "../../components/layout/AppSidebar";
import { AnnotationsList } from "../../components/annotations/AnnotationsList";
import { AnnotationHeaderTitle, AnnotationView } from "../../components/annotations/AnnotationView";
import { SparksGallery } from "../../components/sparks/SparksGallery";
import { SparksResult } from "../../components/sparks/SparksResult";
import { ChatResult } from "../../components/sparks/ChatResult";
import { ProspectorResult } from "../../components/sparks/ProspectorResult";
import { HistoryList } from "../../components/history/HistoryList";
import { SessionHeaderTitle, SessionView } from "../../components/history/SessionView";
import { CollectionsList } from "../../components/collections/CollectionsList";
import { CollectionView } from "../../components/collections/CollectionView";
import { CollectionItemView } from "../../components/collections/CollectionItemView";
import { DropzoneOverlay } from "../../components/image/DropzoneOverlay";
import { ImageResult } from "../../components/image/ImageResult";
import { Button } from "../../components/shared/Button";
import { ChatApiKeySettings } from "../../components/settings/ChatApiKeySettings";
import type {
  AuthState,
  ChatMode,
  ChatMessage,
  ChatUiMessage,
  Collection,
  CollectionItem,
  DragImageResult,
  LinkedInProspectData,
  LinkedInProspectorStatus,
  Spark,
  SparkGroup,
  SparkRecommendation,
  UserPrefs,
} from "../../lib/types";

const queryClient = new QueryClient();
const EXPANDED_SIDEBAR_THRESHOLD = 900;
const DEFAULT_USER_PREFS: UserPrefs = {
  showFloatingButton: true,
  actionButtonY: 0.6,
  lastUsedSpark: null,
  lastFive: [],
};
const ENABLE_EURYKA_CHAT_PROVIDER = false;
const DEFAULT_COLLECTION_NAME = "Saved items";
let collectionSaveQueue = Promise.resolve();

const logCollectionSave = debugLog("[Euryka collections]");
const logSparkRecommendation = debugLog("[Euryka spark recommendation]");

// The panel page receives its tabId via the URL query string, set by the
// background when calling sidePanel.setOptions({ path: "sidepanel.html?tabId=N" }).
// This is the only way for the panel to know which tab it belongs to —
// chrome.tabs.getCurrent() returns undefined inside a side panel.
const THIS_TAB_ID = (() => {
  const v = new URLSearchParams(location.search).get("tabId");
  return v ? Number(v) : null;
})();

const CHROME_CHAT_SESSION_OPTIONS = {
  expectedInputs: [{ type: "text", languages: ["en"] }],
  expectedOutputs: [{ type: "text", languages: ["en"] }],
};
const CHROME_PAGE_CONTENT_CHAR_LIMIT = 10_000;
const CHROME_SELECTED_TEXT_CHAR_LIMIT = 4_000;
const CHROME_HISTORY_CHAR_LIMIT = 4_000;
const CHROME_RETRY_PAGE_CONTENT_CHAR_LIMIT = 4_000;
const CHROME_RETRY_SELECTED_TEXT_CHAR_LIMIT = 2_000;
const CHROME_RETRY_HISTORY_CHAR_LIMIT = 2_000;
const CHROME_SPARK_RECOMMENDATION_PAGE_CONTENT_CHAR_LIMIT = 1_500;
const CHROME_SPARK_RECOMMENDATION_SELECTED_TEXT_CHAR_LIMIT = 1_000;
const CHROME_SPARK_RECOMMENDATION_HISTORY_CHAR_LIMIT = 9_000;
const CHROME_SPARK_RECOMMENDATION_RETRY_PAGE_CONTENT_CHAR_LIMIT = 700;
const CHROME_SPARK_RECOMMENDATION_RETRY_SELECTED_TEXT_CHAR_LIMIT = 500;
const CHROME_SPARK_RECOMMENDATION_RETRY_HISTORY_CHAR_LIMIT = 5_000;

interface ChatPromptContext {
  pageUrl: string;
  pageContent: string;
  selectedText: string;
}

interface ChatContextCounts {
  pageContent: number | null;
  selectedText: number | null;
}

interface SparkCatalogItem {
  id: string;
  title: string;
  description: string;
  groups: string[];
}

interface SparkRecommendationResult {
  recommendation: SparkRecommendation;
  spark: Spark;
  rawText: string;
}

interface ChatContextLimitState {
  exceedsPageContentLimit: boolean;
  exceedsSelectedTextLimit: boolean;
}

function SidePanel() {
  const [auth] = useStorageItem<AuthState>(authStorage);
  const [chatApiKey, setChatApiKey] = useStorageItem<string>(chatApiKeyStorage);
  const [prefs, setPrefs] = useStorageItem<UserPrefs>(userPrefs);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarDocked, setSidebarDocked] = useState(false);
  const [currentTabUrl, setCurrentTabUrl] = useState<string | null>(null);
  const [prospectorStatus, setProspectorStatus] = useState<LinkedInProspectorStatus>(
    DEFAULT_LINKEDIN_PROSPECTOR_STATUS
  );
  const [prospectorResult, setProspectorResult] = useState<LinkedInProspectData | null>(null);

  const {
    currentPage,
    selectedWorkspaceId,
    selectedBrandId,
    selectedProjectId,
    selectedSession,
    selectedMarkerId,
    selectedImageUrl,
    showSparkResult,
    sparkResult,
    sparkResultSessionId,
    sparkResultSourceUrl,
    showChatResult,
    chatId,
    chatMessages,
    chatSources,
    chatError,
    isChatStreaming,
    activeSpark,
    isDragging,
    isLoadingSpark,
    isLoadingImage,
    imageResult,
    imageResultSessionId,
    pendingAction,
    selectedCollectionId,
    selectedCollectionItemId,
    setPage,
    setWorkspace,
    setBrand,
    setProject,
    setSelectedSession,
    setSelectedMarkerId,
    setSelectedImageUrl,
    setShowSparkResult,
    setShowChatResult,
    setChatId,
    setChatMessages,
    setChatSources,
    setChatError,
    setChatStreaming,
    setIsDragging,
    setLoadingSpark,
    setLoadingImage,
    setImageResult,
    resetInnerViews,
    setPendingAction,
    setSelectedCollectionId,
    setSelectedCollectionItemId,
  } = useUIStore();

  const isLoggedIn = !!auth?.token;
  const hasChatApiKey = Boolean(chatApiKey?.trim());
  const chatApiKeyPromptAvailable = ENABLE_EURYKA_CHAT_PROVIDER && hasChatApiKey;
  const chatAbortRef = useRef<AbortController | null>(null);
  const chatRunIdRef = useRef(0);
  const [includeChatPageContent, setIncludeChatPageContent] = useState(false);
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

  useEffect(() => {
    const syncSidebarSize = () => {
      const shouldDock = window.innerWidth >= EXPANDED_SIDEBAR_THRESHOLD;
      setSidebarDocked(shouldDock);
      setSidebarOpen(shouldDock);
    };

    syncSidebarSize();
    window.addEventListener("resize", syncSidebarSize);
    return () => window.removeEventListener("resize", syncSidebarSize);
  }, []);

  // Relay the resolved identity to currentIdentityStorage so content scripts
  // can read a single, authoritative "who am I" without parsing the JWT themselves.
  // We decode the JWT directly rather than trusting auth.name / auth.email — those
  // fields were added later, so installs with a pre-existing token still have them
  // undefined until the next refresh. Decoding here makes the relay self-healing.
  useEffect(() => {
    if (!auth?.token) {
      currentIdentityStorage.setValue(null);
      return;
    }
    const payload = decodeJwt(auth.token);
    const identity = auth.email ?? payload.email ?? auth.name ?? payload.name ?? null;
    currentIdentityStorage.setValue(identity);
  }, [auth]);

  // Workspace data
  const { data: wsData } = useWorkspaceData(selectedWorkspaceId);
  const workspaces = wsData?.workspaces ?? [];
  const brands = wsData?.brands ?? [];
  const projects = wsData?.projects ?? [];

  const runSpark = useRunSpark(selectedWorkspaceId);

  useEffect(() => {
    if (THIS_TAB_ID === null) return;
    let cancelled = false;

    const refreshPageStatus = async () => {
      const [{ url }, status] = await Promise.all([
        sendMessage("getTabUrl", { tabId: THIS_TAB_ID }).catch(() => ({ url: "" })),
        sendMessage("getLinkedInProspectStatus", undefined, THIS_TAB_ID).catch(() => null),
      ]);

      if (cancelled) return;
      setCurrentTabUrl(url || null);
      setProspectorStatus(status ?? DEFAULT_LINKEDIN_PROSPECTOR_STATUS);
    };

    void refreshPageStatus();
    const id = window.setInterval(refreshPageStatus, 1500);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  // ── On mount: tracker port + flush pending actions + auth ────────────────
  useEffect(() => {
    (async () => {
      // Register with the background regardless of auth state — otherwise a
      // logged-out panel is never tracked and queued actions never flush,
      // even after the user logs in.
      // Prefer the tabId injected via URL (set by background's setOptions path).
      // Fall back to active tab query in the rare case the URL param is missing.
      let tabId = THIS_TAB_ID;
      if (!tabId) {
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        tabId = tab?.id ?? null;
      }
      if (tabId) {
        const port = chrome.runtime.connect({ name: "sidePanelTracker" });
        port.postMessage({ type: "PING", tabId });
        await sendMessage("sidePanelReady", { tabId }).catch(() => {});
      }
      // Refresh only when the stored token is missing or expired — a forced
      // refresh here used to log the user out on any transient network error.
      await getValidToken();
    })();
  }, []);

  // Set first workspace when data loads
  useEffect(() => {
    if (!selectedWorkspaceId && workspaces.length > 0) {
      const firstWorkspaceId = workspaces[0].id;
      setWorkspace(firstWorkspaceId);
    }
  }, [workspaces, selectedWorkspaceId, setWorkspace]);

  // ── Heartbeat ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      sendMessage("keepAlive", undefined).catch(() => {});
    }, 25_000);
    return () => clearInterval(id);
  }, []);

  // ── Flush pending action once workspace is ready ───────────────────────────
  // analyseImage and triggerSpark messages may arrive before workspace data
  // loads (sidePanelReady fires before the workspace query completes). We store
  // them as pendingAction and fire here once selectedWorkspaceId is available.
  useEffect(() => {
    if (!selectedWorkspaceId || !pendingAction) return;
    const action = pendingAction;
    setPendingAction(null);
    if (action.type === "analyseImage") {
      setSelectedImageUrl(action.imageUrl);
      handleAnalyseImageRef.current(
        {
          url: action.imageUrl,
          source: "browser",
        },
        action.pageUrl
      );
    } else if (action.type === "triggerSpark") {
      const groups = queryClient.getQueryData<SparkGroup[]>(["sparks"]);
      const spark = groups?.flatMap((g) => g.sparks).find((s) => s.id === action.sparkId);
      if (spark) handleUseSparkRef.current(spark);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWorkspaceId, pendingAction, setPendingAction, setSelectedImageUrl]);

  // ── Spark execution ───────────────────────────────────────────────────────
  // Defined before the message-listener effect so the refs below can point at them.
  const handleUseSpark = async (spark: Spark) => {
    handleStopChat();
    setSparkRecommendationResult(null);
    setShowChatResult(false);
    setProspectorResult(null);
    const workspaceId = selectedWorkspaceId ?? workspaces[0]?.id ?? null;
    if (!selectedWorkspaceId && workspaceId) {
      setWorkspace(workspaceId);
    }
    if (!workspaceId) {
      console.warn("[Euryka workspace] cannot run spark without workspace", {
        sparkId: spark.id,
        selectedWorkspaceId,
        workspaceCount: workspaces.length,
      });
      return;
    }
    setLoadingSpark(true);
    setShowSparkResult(true, "", undefined, spark);

    // Context comes from THIS panel's tab only. The session storage values are
    // global (overwritten by whichever tab was last active/navigated), so they
    // are used as a fallback only when they were captured for this same URL.
    let pageUrl = "";
    let pageText = "";
    let selectedText = "";

    if (THIS_TAB_ID !== null) {
      const [activeUrl, extractedText, currentSelection] = await Promise.all([
        sendMessage("getTabUrl", { tabId: THIS_TAB_ID }).catch(() => null),
        sendMessage("extractText", undefined, THIS_TAB_ID).catch(() => null),
        sendMessage("getSelectedText", undefined, THIS_TAB_ID).catch(() => null),
      ]);
      pageUrl = activeUrl?.url || currentTabUrl || "";
      pageText = extractedText?.text || "";
      selectedText = currentSelection?.text || "";

      if (!pageText || !selectedText) {
        const [storedUrl, storedText, storedSelection] = await Promise.all([
          pageUrlStorage.getValue(),
          pageTextStorage.getValue(),
          selectedTextStorage.getValue(),
        ]);
        if (storedUrl && storedUrl === pageUrl) {
          pageText = pageText || storedText;
          selectedText = selectedText || storedSelection;
        }
      }
    }

    try {
      const result = await runSpark.mutateAsync({
        sparkId: spark.id,
        pageUrl,
        pageContent: pageText,
        selectedText,
        brandId: selectedBrandId ?? undefined,
        projectId: selectedProjectId ?? undefined,
        workspaceId,
      });
      setShowSparkResult(true, result.content, result.id, spark, result.page?.url ?? pageUrl);
      await setPrefs((p) => ({
        ...DEFAULT_USER_PREFS,
        ...p,
        lastUsedSpark: spark,
        lastFive: [spark.id, ...(p?.lastFive ?? []).filter((id) => id !== spark.id)].slice(0, 5),
      }));
    } catch {
      setShowSparkResult(
        true,
        "We couldn't complete the request. Please retry shortly.",
        undefined,
        spark
      );
    } finally {
      setLoadingSpark(false);
    }
  };

  const handleRunProspector = async () => {
    handleStopChat();
    setShowChatResult(false);
    const initialProspect = buildFallbackProspect(currentTabUrl ?? "", []);
    setLoadingSpark(true);
    setProspectorResult(initialProspect);
    setShowSparkResult(
      true,
      "prospector",
      undefined,
      LINKEDIN_PROSPECTOR_SPARK,
      currentTabUrl ?? undefined
    );

    try {
      const prospect =
        THIS_TAB_ID !== null
          ? await sendMessage("getLinkedInProspectData", undefined, THIS_TAB_ID)
          : buildFallbackProspect(currentTabUrl ?? "", [
              "Failed to read the current LinkedIn page.",
            ]);

      setProspectorResult(prospect);
      setShowSparkResult(
        true,
        "prospector",
        undefined,
        LINKEDIN_PROSPECTOR_SPARK,
        prospect.pageUrl || currentTabUrl || undefined
      );
    } catch {
      const fallback = buildFallbackProspect(currentTabUrl ?? "", [
        "We couldn't inspect the current LinkedIn page or related entities. Please retry shortly.",
      ]);
      setProspectorResult(fallback);
      setShowSparkResult(
        true,
        "prospector",
        undefined,
        LINKEDIN_PROSPECTOR_SPARK,
        fallback.pageUrl || currentTabUrl || undefined
      );
    } finally {
      setLoadingSpark(false);
    }
  };

  // ── Image analysis ────────────────────────────────────────────────────────
  const handleAnalyseImage = async (dragResult: DragImageResult, pageUrlOverride?: string) => {
    if (!selectedWorkspaceId) return;
    handleStopChat();
    setShowChatResult(false);
    const workspaceId = selectedWorkspaceId;
    setLoadingImage(true);
    setImageResult(null);

    // Page context must come from THIS panel's tab. The global session storage
    // holds whichever tab was last active/navigated, which can be a different
    // tab entirely — never send that to the API.
    let pageUrl = pageUrlOverride ?? "";
    let pageText = "";
    if (THIS_TAB_ID !== null) {
      const [tabUrl, extracted] = await Promise.all([
        pageUrlOverride
          ? Promise.resolve(null)
          : sendMessage("getTabUrl", { tabId: THIS_TAB_ID }).catch(() => null),
        sendMessage("extractText", undefined, THIS_TAB_ID).catch(() => null),
      ]);
      pageUrl = pageUrlOverride ?? tabUrl?.url ?? "";
      pageText = extracted?.text ?? "";
    }

    try {
      let imageUrl = dragResult.url;

      if (dragResult.source === "filesystem" && dragResult.file) {
        const token = await getValidToken();
        if (!token) throw new Error("Not authenticated");
        const { imageUrl: uploaded } = await uploadFileWithRetry(
          token,
          workspaceId,
          dragResult.file
        );
        imageUrl = uploaded;
      }

      setSelectedImageUrl(imageUrl);

      const result = await runWithTokenRetry((token) =>
        apiAnalyseImage(token, workspaceId, {
          image: imageUrl,
          page: pageUrl,
          pageContent: pageText,
          brandId: selectedBrandId ?? undefined,
          projectId: selectedProjectId ?? undefined,
        })
      );

      setImageResult(result.content, result.id);
    } catch {
      setImageResult(null);
    } finally {
      setLoadingImage(false);
      setIsDragging(false);
    }
  };

  const updateChatContextLimitNotice = (counts: ChatContextCounts, trimmed: boolean) => {
    const limitState = getChatContextLimitState(counts);
    if (!limitState.exceedsPageContentLimit && !limitState.exceedsSelectedTextLimit) {
      setChatUserNotice(null);
      setChatUserNoticeTitle(null);
      return;
    }

    setChatUserNotice(
      trimmed
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
      return { pageUrl: currentTabUrl ?? "", pageContent: "", selectedText: "" };
    }

    if (THIS_TAB_ID === null) {
      setChatContextCounts({ pageContent: null, selectedText: null });
      setChatError("No active tab is attached to this sidepanel.");
      return null;
    }

    const [tabUrl, page, selection] = await Promise.all([
      sendMessage("getTabUrl", { tabId: THIS_TAB_ID }).catch(() => ({ url: currentTabUrl ?? "" })),
      needsPageContent
        ? sendMessage("extractText", undefined, THIS_TAB_ID).catch(() => null)
        : Promise.resolve(null),
      needsSelectedText
        ? sendMessage("getSelectedText", undefined, THIS_TAB_ID).catch(() => null)
        : Promise.resolve(null),
    ]);

    const context: ChatPromptContext = {
      pageUrl: tabUrl.url.trim(),
      pageContent: page?.text.trim() ?? "",
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

    if (THIS_TAB_ID === null) {
      setChatContextCounts({ pageContent: null, selectedText: null });
      return;
    }

    const [page, selection] = await Promise.all([
      needsPageContent
        ? sendMessage("extractText", undefined, THIS_TAB_ID).catch(() => null)
        : Promise.resolve(null),
      needsSelectedText
        ? sendMessage("getSelectedText", undefined, THIS_TAB_ID).catch(() => null)
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

  const handleStartChat = async (message: string, continueConversation = showChatResult) => {
    const runId = ++chatRunIdRef.current;
    const isSparkRecommendation = chatMode === "spark-recommendation";
    const shouldContinueConversation = !isSparkRecommendation && continueConversation;

    setPage("sparks");
    setSelectedImageUrl(null);
    setShowSparkResult(false);
    setProspectorResult(null);
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
      sparkCatalog = buildSparkCatalog(sparkGroups);
      const compactCatalogText = buildSparkCatalogText(sparkCatalog);
      logSparkRecommendation("prepared spark catalog for prompt", {
        ...summarizeSparkCatalog(sparkGroups, sparkCatalog),
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
        ...(shouldContinueConversation ? chatMessages.filter((item) => item.content.trim()) : []),
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
      ...(shouldContinueConversation ? chatMessages.filter((item) => item.content.trim()) : []),
      userMessage,
    ];
    const modelHistory = isSparkRecommendation
      ? [modelUserMessage]
      : [
          ...(shouldContinueConversation ? chatMessages.filter((item) => item.content.trim()) : []),
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

  const runChromeChat = async ({
    assistantMessageId,
    context,
    history,
    runId,
    suppressAssistantText = false,
  }: {
    assistantMessageId: string;
    context: ChatPromptContext;
    history: ChatUiMessage[];
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
        suppressAssistantText ? SPARK_RECOMMENDATION_CHROME_PROMPT_LIMITS : undefined
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
            : {
                pageContentLimit: CHROME_RETRY_PAGE_CONTENT_CHAR_LIMIT,
                selectedTextLimit: CHROME_RETRY_SELECTED_TEXT_CHAR_LIMIT,
                historyLimit: CHROME_RETRY_HISTORY_CHAR_LIMIT,
              }
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

  const handleStopChat = () => {
    chatRunIdRef.current += 1;
    chatAbortRef.current?.abort();
    chatAbortRef.current = null;
    setChatStreaming(false);
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

  // Mutable refs that always point to the latest handler closures. Assigned
  // directly in the render body (safe — refs are mutable, not state).
  // The message listeners below register ONCE with [] deps and read through
  // these refs to avoid stale closures without needing to re-register.
  const handleUseSparkRef = useRef(handleUseSpark);
  const handleAnalyseImageRef = useRef(handleAnalyseImage);
  handleUseSparkRef.current = handleUseSpark;
  handleAnalyseImageRef.current = handleAnalyseImage;

  // ── Messages from background ──────────────────────────────────────────────
  // Registered ONCE ([] deps). Re-registering on every state change caused the
  // @webext-core/messaging singleton to throw "only one listener can be setup".
  useEffect(() => {
    // Defensive: the messaging library uses a per-context singleton map. If
    // the panel re-mounts without its previous cleanup running (HMR, error-
    // boundary retry, or any race) those listeners stay registered and the
    // next onMessage() throws. Wipe the slate before registering.
    removeAllListeners();

    const cleanup1 = onMessage("analyseImage", ({ data }) => {
      if (data.forTabId !== undefined && data.forTabId !== THIS_TAB_ID) return;
      setPage("sparks");
      setPendingAction({
        type: "analyseImage",
        imageUrl: data.imageUrl,
        pageUrl: data.pageUrl,
      });
    });

    const cleanup2 = onMessage("triggerSpark", ({ data }) => {
      if (data.forTabId !== undefined && data.forTabId !== THIS_TAB_ID) return;
      setPendingAction({ type: "triggerSpark", sparkId: data.sparkId });
    });

    const cleanup3 = onMessage("pageDragStart", () => setIsDragging(true));
    const cleanup4 = onMessage("pageDragEnd", () => setIsDragging(false));

    // Toggle close: when the floating button on THIS tab broadcasts
    // openSidePanel, the background opens (no-op since we're already open) and
    // we self-close. Filter on sender.tab.id so that other tabs' broadcasts
    // don't close us. Delay 50ms so the redundant open() settles before we
    // call window.close() — without it Chrome can race and re-open us.
    const cleanup5 = onMessage("openSidePanel", ({ sender }) => {
      if (THIS_TAB_ID !== null && sender.tab?.id === THIS_TAB_ID) {
        setTimeout(() => window.close(), 50);
      }
    });

    // Standby: collections are hidden while we revisit this flow. Current issue:
    // saves from the context menu can appear dependent on the Collections view
    // being mounted. The likely failure is either the background message not
    // reaching this listener or collectionItemsStorage filtering the item out
    // before the Supabase upsert because the default collection is not seen as
    // owned yet. Keep the passive listener in place for later debugging.
    const cleanup6 = onMessage("saveToCollection", async ({ data }) => {
      if (data.forTabId !== undefined && data.forTabId !== THIS_TAB_ID) return;
      logCollectionSave("Sidepanel received saveToCollection", {
        thisTabId: THIS_TAB_ID,
        data,
      });
      collectionSaveQueue = collectionSaveQueue
        .catch(() => {})
        .then(async () => {
          logCollectionSave("Starting queued collection save", {
            type: data.type,
            title: data.title,
          });
          const collectionId = await getOrCreateDefaultCollectionId();
          const newItem: CollectionItem = {
            id: crypto.randomUUID(),
            collectionId,
            type: data.type,
            title: data.title,
            content: data.content,
            thumbnail: data.thumbnail,
            sourceUrl: data.sourceUrl,
            createdAt: Date.now(),
          };
          const current = await collectionItemsStorage.getValue();
          logCollectionSave("Loaded current collection items before save", {
            currentCount: current.length,
            collectionId,
            newItem,
          });
          const next = [newItem, ...current.filter((item) => item.id !== newItem.id)];
          await collectionItemsStorage.setValue(next);
          logCollectionSave("Finished collection item save request", {
            nextCount: next.length,
            newItemId: newItem.id,
          });
        });
      await collectionSaveQueue.catch((error) => {
        console.error("[Euryka collections] Collection save failed", error);
      });
    });

    const cleanup7 = onMessage("annotationUpdated", ({ data }) => {
      window.dispatchEvent(
        new CustomEvent("eurykaAnnotationUpdated", {
          detail: data.annotation,
        })
      );
    });

    const cleanup8 = onMessage("annotationDeleted", ({ data }) => {
      window.dispatchEvent(
        new CustomEvent("eurykaAnnotationDeleted", {
          detail: data.id,
        })
      );
    });

    return () => {
      cleanup1();
      cleanup2();
      cleanup3();
      cleanup4();
      cleanup5();
      cleanup6();
      cleanup7();
      cleanup8();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setIsDragging, setPage, setPendingAction]);

  if (!isLoggedIn) return <LoggedOut />;

  const isChatResultView = currentPage === "sparks" && !selectedImageUrl && showChatResult;

  const isSparkResultView =
    currentPage === "sparks" &&
    !selectedImageUrl &&
    !showChatResult &&
    (showSparkResult || isLoadingSpark);

  const navigate = (page: typeof currentPage) => {
    handleStopChat();
    resetInnerViews();
    setPage(page);
  };

  const openChatSettings = () => {
    handleStopChat();
    resetInnerViews();
    setPage("settings");
  };

  const openCollectionItem = (item: CollectionItem) => {
    setSelectedCollectionItemId(item.id);
  };

  const openCollectionItemFromCollection = (item: CollectionItem) => {
    setSelectedCollectionId(item.collectionId);
    setSelectedCollectionItemId(item.id);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      {!sidebarDocked && (
        <NavRail
          currentPage={currentPage}
          onNavigate={navigate}
          onOpenSidebar={() => setSidebarOpen(true)}
        />
      )}

      <AppSidebar
        currentPage={currentPage}
        workspaces={workspaces}
        selectedWorkspaceId={selectedWorkspaceId}
        isOpen={sidebarOpen}
        onNavigate={navigate}
        onSelectWorkspace={setWorkspace}
        onClose={() => setSidebarOpen(false)}
        docked={sidebarDocked}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        <Header
          currentPage={currentPage}
          titleSlot={
            currentPage === "annotations" && selectedMarkerId ? (
              <AnnotationHeaderTitle
                markerId={selectedMarkerId}
                onBack={() => setSelectedMarkerId(null)}
              />
            ) : currentPage === "history" && selectedSession ? (
              <SessionHeaderTitle
                session={selectedSession}
                onBack={() => setSelectedSession(null)}
              />
            ) : undefined
          }
          leftSlot={
            isChatResultView ? (
              <Button
                variant="ghost"
                size="md"
                onClick={handleBackFromChat}
                className="px-0 hover:bg-transparent"
              >
                <ArrowLeft size={16} />
                Back
              </Button>
            ) : isSparkResultView ? (
              <Button
                variant="ghost"
                size="md"
                onClick={() => setShowSparkResult(false)}
                disabled={isLoadingSpark}
                className="px-0 hover:bg-transparent"
              >
                <ArrowLeft size={16} />
                Back
              </Button>
            ) : undefined
          }
          centerTitle={isSparkResultView || isChatResultView}
        />

        <main className="flex-1 overflow-hidden">
          {selectedImageUrl ? (
            <ImageResult
              imageUrl={selectedImageUrl}
              result={imageResult}
              sessionId={imageResultSessionId}
              wsId={selectedWorkspaceId}
              isLoading={isLoadingImage}
              onBack={() => {
                setSelectedImageUrl(null);
                setImageResult(null);
              }}
            />
          ) : currentPage === "sparks" ? (
            showChatResult ? (
              <ChatResult
                messages={chatMessages}
                sources={chatSources}
                error={chatError}
                isStreaming={isChatStreaming}
                apiKeyAvailable={!ENABLE_EURYKA_CHAT_PROVIDER || chatApiKeyPromptAvailable}
                chatId={chatId}
                mode={chatMode}
                sparkRecommendationResult={sparkRecommendationResult}
                includePageContent={includeChatPageContent}
                includeSelectedText={includeChatSelectedText}
                pageContentCharCount={chatContextCounts.pageContent}
                selectedTextCharCount={chatContextCounts.selectedText}
                pageContentExceedsLimit={
                  getChatContextLimitState(chatContextCounts).exceedsPageContentLimit
                }
                selectedTextExceedsLimit={
                  getChatContextLimitState(chatContextCounts).exceedsSelectedTextLimit
                }
                chatContextStatus={chatUserNotice}
                chatContextStatusTitle={chatUserNoticeTitle}
                chatProviderStatus={DEBUG ? chatProviderDebugStatus : null}
                onSubmit={(message) => handleStartChat(message, true)}
                onStop={handleStopChat}
                onOpenSettings={openChatSettings}
                onOpenThread={handleOpenChatThread}
                onModeChange={setChatMode}
                onRunRecommendedSpark={handleUseSpark}
                onIncludePageContentChange={handleIncludeChatPageContentChange}
                onIncludeSelectedTextChange={handleIncludeChatSelectedTextChange}
              />
            ) : showSparkResult && prospectorResult ? (
              <ProspectorResult
                prospect={prospectorResult}
                spark={LINKEDIN_PROSPECTOR_SPARK}
                sourceUrl={sparkResultSourceUrl}
                isLoading={isLoadingSpark}
                wsId={selectedWorkspaceId}
                brandId={selectedBrandId}
                projectId={selectedProjectId}
                onBack={() => {
                  setProspectorResult(null);
                  setShowSparkResult(false);
                }}
              />
            ) : showSparkResult && sparkResult ? (
              <SparksResult
                result={sparkResult}
                sessionId={sparkResultSessionId}
                sourceUrl={sparkResultSourceUrl}
                spark={activeSpark}
                wsId={selectedWorkspaceId}
                onBack={() => setShowSparkResult(false)}
              />
            ) : isLoadingSpark ? (
              <div className="flex flex-col gap-2 p-4">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="h-3 rounded bg-muted animate-pulse"
                    style={{ width: `${60 + i * 10}%` }}
                  />
                ))}
              </div>
            ) : (
              <SparksGallery
                selectedBrandId={selectedBrandId}
                selectedProjectId={selectedProjectId}
                brands={brands}
                projects={projects}
                lastFive={prefs?.lastFive ?? []}
                currentUrl={currentTabUrl}
                chatApiKeyAvailable={!ENABLE_EURYKA_CHAT_PROVIDER || chatApiKeyPromptAvailable}
                chatMode={chatMode}
                includePageContent={includeChatPageContent}
                includeSelectedText={includeChatSelectedText}
                pageContentCharCount={chatContextCounts.pageContent}
                selectedTextCharCount={chatContextCounts.selectedText}
                pageContentExceedsLimit={
                  getChatContextLimitState(chatContextCounts).exceedsPageContentLimit
                }
                selectedTextExceedsLimit={
                  getChatContextLimitState(chatContextCounts).exceedsSelectedTextLimit
                }
                chatContextStatus={chatUserNotice}
                chatContextStatusTitle={chatUserNoticeTitle}
                chatProviderStatus={DEBUG ? chatProviderDebugStatus : null}
                prospector={{
                  visible: prospectorStatus.visible,
                  title: LINKEDIN_PROSPECTOR_SPARK.title,
                  description: LINKEDIN_PROSPECTOR_SPARK.description ?? "",
                  icon: LINKEDIN_PROSPECTOR_SPARK.icon ?? "Search",
                  color: LINKEDIN_PROSPECTOR_SPARK.color ?? "#0A66C2",
                  onClick: handleRunProspector,
                }}
                onUseSpark={handleUseSpark}
                onStartChat={(message) => handleStartChat(message, false)}
                onOpenChatSettings={openChatSettings}
                onChatModeChange={setChatMode}
                onIncludePageContentChange={handleIncludeChatPageContentChange}
                onIncludeSelectedTextChange={handleIncludeChatSelectedTextChange}
                onSelectBrand={setBrand}
                onSelectProject={setProject}
              />
            )
          ) : currentPage === "history" ? (
            selectedSession ? (
              <SessionView
                session={selectedSession}
                wsId={selectedWorkspaceId}
                onBack={() => setSelectedSession(null)}
              />
            ) : (
              <HistoryList wsId={selectedWorkspaceId} onSelectSession={setSelectedSession} />
            )
          ) : currentPage === "annotations" ? (
            selectedMarkerId ? (
              <AnnotationView
                markerId={selectedMarkerId}
                onBack={() => setSelectedMarkerId(null)}
              />
            ) : (
              <AnnotationsList onSelectMarker={setSelectedMarkerId} />
            )
          ) : currentPage === "collections" ? (
            selectedCollectionItemId ? (
              <CollectionItemView
                itemId={selectedCollectionItemId}
                onBack={() => setSelectedCollectionItemId(null)}
              />
            ) : selectedCollectionId ? (
              <CollectionView
                collectionId={selectedCollectionId}
                onBack={() => setSelectedCollectionId(null)}
                onSelectItem={openCollectionItemFromCollection}
              />
            ) : (
              <CollectionsList
                onSelectCollection={setSelectedCollectionId}
                onSelectItem={openCollectionItem}
              />
            )
          ) : currentPage === "settings" ? (
            <div className="flex flex-col gap-px overflow-y-auto">
              {ENABLE_EURYKA_CHAT_PROVIDER && (
                <ChatApiKeySettings
                  apiKey={chatApiKey ?? ""}
                  onSave={setChatApiKey}
                  onRemove={() => setChatApiKey("")}
                />
              )}
              <div className="flex items-center justify-between border-b border-border px-4 py-4">
                <div>
                  <p className="text-sm font-medium text-foreground">Theme</p>
                  <p className="text-xs text-muted-foreground">Appearance preference</p>
                </div>
                <div className="flex items-center overflow-hidden rounded-lg border border-border">
                  {(["system", "light", "dark"] as const).map((value) => {
                    const active = (prefs?.theme ?? "system") === value;
                    const icon =
                      value === "system" ? (
                        <Monitor size={13} />
                      ) : value === "light" ? (
                        <Sun size={13} />
                      ) : (
                        <Moon size={13} />
                      );
                    return (
                      <Button
                        key={value}
                        variant={active ? "primary" : "icon"}
                        size="icon-lg"
                        title={value.charAt(0).toUpperCase() + value.slice(1)}
                        onClick={() =>
                          setPrefs((p) => ({
                            ...DEFAULT_USER_PREFS,
                            ...p,
                            theme: value,
                          }))
                        }
                        className="h-8 w-8 rounded-none"
                      >
                        {icon}
                      </Button>
                    );
                  })}
                </div>
              </div>
              <div className="flex items-center justify-between border-b border-border px-4 py-4">
                <div>
                  <p className="text-sm font-medium text-foreground">Floating button</p>
                  <p className="text-xs text-muted-foreground">
                    Show the quick-action button on pages
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-label="Show floating button"
                  aria-checked={prefs?.showFloatingButton}
                  onClick={() =>
                    setPrefs((p) => ({
                      ...DEFAULT_USER_PREFS,
                      ...p,
                      showFloatingButton: !p?.showFloatingButton,
                    }))
                  }
                  className={`inline-flex h-6 w-10 shrink-0 items-center rounded-full p-0.5 transition-colors ${prefs?.showFloatingButton ? "bg-primary" : "bg-muted"}`}
                >
                  <span
                    className={`h-5 w-5 rounded-full bg-background shadow-sm ring-1 ring-border transition-transform ${prefs?.showFloatingButton ? "translate-x-4" : "translate-x-0"}`}
                  />
                </button>
              </div>
            </div>
          ) : null}
        </main>

        {isDragging && !isLoadingImage && !selectedImageUrl && (
          <DropzoneOverlay
            onDrop={(result) => {
              setIsDragging(false);
              setPage("sparks");
              handleAnalyseImage(result);
            }}
            onClose={() => setIsDragging(false)}
          />
        )}
      </div>
    </div>
  );
}

function buildSparkCatalog(groups: SparkGroup[]): SparkCatalogItem[] {
  const byId = new Map<string, SparkCatalogItem>();

  for (const group of groups) {
    for (const spark of group.sparks) {
      const groupTitle = spark.group ?? group.title ?? "";
      const existing = byId.get(spark.id);
      if (existing) {
        if (groupTitle && !existing.groups.includes(groupTitle)) {
          existing.groups.push(groupTitle);
        }
        continue;
      }

      byId.set(spark.id, {
        id: spark.id,
        title: spark.title,
        description: spark.description ?? "",
        groups: groupTitle ? [groupTitle] : [],
      });
    }
  }

  return [...byId.values()];
}

function summarizeSparkGroups(groups: SparkGroup[]) {
  return {
    groupCount: groups.length,
    sparkCount: groups.reduce((count, group) => count + group.sparks.length, 0),
    groups: groups.map((group) => ({
      title: group.title,
      descriptionChars: group.description?.length ?? 0,
      sparkCount: group.sparks.length,
    })),
  };
}

function summarizeSparkCatalog(groups: SparkGroup[], catalog: SparkCatalogItem[]) {
  const summary = summarizeSparkGroups(groups);
  return {
    ...summary,
    uniqueSparkCount: catalog.length,
  };
}

function buildSparkCatalogText(sparks: SparkCatalogItem[]): string {
  return sparks
    .map((spark, index) =>
      [
        `${index + 1}.`,
        `id=${compactText(spark.id)}`,
        `title=${compactText(spark.title)}`,
        `desc=${compactText(spark.description)}`,
        `groups=${compactText(spark.groups.join(", "))}`,
      ].join(" ")
    )
    .join("\n");
}

function compactText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function buildSparkRecommendationUserPrompt(
  userIntent: string,
  sparks: SparkCatalogItem[]
): string {
  const catalogText = buildSparkCatalogText(sparks);
  return [
    "You are recommending one Euryka spark for the user's intent.",
    "Choose exactly one spark from the provided catalog.",
    "Return strict JSON only. Do not include markdown, commentary, or extra keys.",
    'The JSON shape is: {"sparkId":"...","sparkTitle":"...","reason":"...","confidence":0.0}',
    "Use sparkId as the authoritative identifier.",
    "",
    `User intent:\n${userIntent}`,
    "",
    `Spark catalog:\n${catalogText}`,
  ].join("\n");
}

function resolveSparkRecommendation(
  responseText: string,
  sparks: Spark[]
): SparkRecommendationResult | null {
  const parsed = parseJsonObject(responseText);
  if (!parsed) return null;

  const sparkId = readString(parsed.sparkId);
  const sparkTitle = readString(parsed.sparkTitle);
  const normalizedTitle = normalizeSparkName(sparkTitle);
  const spark =
    (sparkId ? sparks.find((item) => item.id === sparkId) : undefined) ??
    (normalizedTitle
      ? sparks.find((item) => normalizeSparkName(item.title) === normalizedTitle)
      : undefined);

  if (!spark) return null;

  const reason = readString(parsed.reason) || "This spark best matches the request you described.";
  const confidence = readConfidence(parsed.confidence);

  return {
    spark,
    rawText: responseText,
    recommendation: {
      sparkId: spark.id,
      sparkTitle: spark.title,
      reason,
      ...(confidence !== undefined ? { confidence } : {}),
    },
  };
}

function buildSparkRecommendationAssistantMessage(result: SparkRecommendationResult): string {
  return `I recommend **${result.spark.title}**.\n\n${result.recommendation.reason}`;
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidate = fenced ?? trimmed.slice(trimmed.indexOf("{"), trimmed.lastIndexOf("}") + 1);
  if (!candidate || !candidate.startsWith("{") || !candidate.endsWith("}")) return null;

  try {
    const parsed: unknown = JSON.parse(candidate);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readConfidence(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  if (value >= 0 && value <= 1) return value;
  if (value > 1 && value <= 100) return value / 100;
  return undefined;
}

function normalizeSparkName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

async function getOrCreateDefaultCollectionId(): Promise<string> {
  const collections = await collectionsStorage.getValue();
  logCollectionSave("Loaded collections for default collection lookup", {
    count: collections.length,
    names: collections.map((collection) => collection.name),
  });
  const existing = collections.find((collection) => collection.name === DEFAULT_COLLECTION_NAME);
  if (existing) {
    logCollectionSave("Using existing default collection", {
      id: existing.id,
      name: existing.name,
    });
    return existing.id;
  }

  const collection: Collection = {
    id: crypto.randomUUID(),
    name: DEFAULT_COLLECTION_NAME,
    emoji: "📁",
    createdAt: Date.now(),
    sharedWith: [],
  };
  logCollectionSave("Creating default collection", collection);
  await collectionsStorage.setValue([collection, ...collections]);
  logCollectionSave("Default collection created", {
    id: collection.id,
  });
  return collection.id;
}

function toChatApiMessages(messages: ChatUiMessage[], context?: ChatPromptContext): ChatMessage[] {
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

interface ChromePromptLimits {
  pageContentLimit: number;
  selectedTextLimit: number;
  historyLimit: number;
}

interface ChromePromptResult {
  prompt: string;
  userNotice: string | null;
  userNoticeTitle: string | null;
}

const DEFAULT_CHROME_PROMPT_LIMITS: ChromePromptLimits = {
  pageContentLimit: CHROME_PAGE_CONTENT_CHAR_LIMIT,
  selectedTextLimit: CHROME_SELECTED_TEXT_CHAR_LIMIT,
  historyLimit: CHROME_HISTORY_CHAR_LIMIT,
};

const SPARK_RECOMMENDATION_CHROME_PROMPT_LIMITS: ChromePromptLimits = {
  pageContentLimit: CHROME_SPARK_RECOMMENDATION_PAGE_CONTENT_CHAR_LIMIT,
  selectedTextLimit: CHROME_SPARK_RECOMMENDATION_SELECTED_TEXT_CHAR_LIMIT,
  historyLimit: CHROME_SPARK_RECOMMENDATION_HISTORY_CHAR_LIMIT,
};

const SPARK_RECOMMENDATION_CHROME_RETRY_PROMPT_LIMITS: ChromePromptLimits = {
  pageContentLimit: CHROME_SPARK_RECOMMENDATION_RETRY_PAGE_CONTENT_CHAR_LIMIT,
  selectedTextLimit: CHROME_SPARK_RECOMMENDATION_RETRY_SELECTED_TEXT_CHAR_LIMIT,
  historyLimit: CHROME_SPARK_RECOMMENDATION_RETRY_HISTORY_CHAR_LIMIT,
};

function buildChromeChatPrompt(
  messages: ChatUiMessage[],
  context: ChatPromptContext,
  limits: ChromePromptLimits = DEFAULT_CHROME_PROMPT_LIMITS
): ChromePromptResult {
  const parts = [];
  const clippedPageContent = clipStart(context.pageContent, limits.pageContentLimit);
  const clippedSelectedText = clipStart(context.selectedText, limits.selectedTextLimit);
  const contextText = buildContextText({
    pageUrl: context.pageUrl,
    pageContent: clippedPageContent.text,
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
      ? `page content after trimming: ${clippedPageContent.text.length} chars`
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
      ? "Number of chars exceeds model context. Content was trimmed."
      : null,
    userNoticeTitle: trimmedDetails.length ? trimmedDetails.join(", ") : null,
  };
}

function buildContextText(context: ChatPromptContext): string {
  const parts = [];
  if (context.pageUrl) parts.push(`Page URL:\n${context.pageUrl}`);
  if (context.pageContent) parts.push(`Page content:\n${context.pageContent}`);
  if (context.selectedText) parts.push(`Highlighted text:\n${context.selectedText}`);
  return parts.join("\n\n");
}

async function promptChromeSession({
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

function isReadableStream(value: unknown): value is ReadableStream<string> {
  return typeof value === "object" && value !== null && "getReader" in value;
}

function mergeChromeStreamChunk(current: string, chunk: string): string {
  if (chunk.startsWith(current)) return chunk;
  return current + chunk;
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

function isInputTooLargeError(error: unknown): boolean {
  // Chrome's Prompt API signals an oversized prompt with a QuotaExceededError
  // DOMException or an "input is too large" message. Keep this check narrow:
  // matching loosely (any "context"/"quota" mention) used to swallow unrelated
  // failures and retry them with trimmed context instead of surfacing them.
  if (error instanceof DOMException && error.name === "QuotaExceededError") return true;
  const message = error instanceof Error ? error.message : String(error);
  return /input\s+is\s+too\s+large|too\s+many\s+tokens|exceeds?\s+(the\s+)?(context|quota|token)/i.test(
    message
  );
}

function getChatContextLimitState(counts: ChatContextCounts): ChatContextLimitState {
  return {
    exceedsPageContentLimit:
      counts.pageContent !== null && counts.pageContent > CHROME_PAGE_CONTENT_CHAR_LIMIT,
    exceedsSelectedTextLimit:
      counts.selectedText !== null && counts.selectedText > CHROME_SELECTED_TEXT_CHAR_LIMIT,
  };
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <SidePanel />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
