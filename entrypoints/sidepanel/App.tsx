/// <reference path="../../.wxt/wxt.d.ts" />

import { useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
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
import type { PageContextMode } from "../../lib/page-context";
import { DEBUG, debugLog } from "../../lib/debug";
import { analyseImage as apiAnalyseImage, fetchSparks } from "../../lib/api";
import { openChatThread, streamChatResponse } from "../../lib/chat-api";
import { uploadFileWithRetry } from "../../lib/image-utils";
import {
  buildChromeChatPrompt,
  CHROME_RETRY_PROMPT_LIMITS,
  getChatContextLimitState,
  isInputTooLargeError,
  promptChromeSession,
  SPARK_RECOMMENDATION_CHROME_PROMPT_LIMITS,
  SPARK_RECOMMENDATION_CHROME_RETRY_PROMPT_LIMITS,
  toChatApiMessages,
  type ChatContextCounts,
  type ChatPromptContext,
} from "../../lib/chat-prompt";
import {
  buildSparkCatalog,
  buildSparkCatalogText,
  summarizeSparkCatalog,
  summarizeSparkGroups,
  type SparkCatalogItem,
} from "../../lib/spark-catalog";
import {
  buildSparkRecommendationAssistantMessage,
  buildSparkRecommendationUserPrompt,
  resolveSparkRecommendation,
  type SparkRecommendationResult,
} from "../../lib/spark-recommendation";
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
import { AnnotationHeaderTitle } from "../../components/annotations/AnnotationView";
import { ContextSelector } from "../../components/sparks/ContextSelector";
import { SessionHeaderTitle } from "../../components/history/SessionView";
import { DropzoneOverlay } from "../../components/image/DropzoneOverlay";
import { Button } from "../../components/shared/Button";
import { AnnotationsPage } from "../../components/pages/AnnotationsPage";
import { CollectionsPage } from "../../components/pages/CollectionsPage";
import { HistoryPage } from "../../components/pages/HistoryPage";
import { SettingsPage } from "../../components/pages/SettingsPage";
import { SparksPage } from "../../components/pages/SparksPage";
import type {
  AuthState,
  ChatMode,
  ChatUiMessage,
  Collection,
  CollectionItem,
  DragImageResult,
  LinkedInProspectData,
  LinkedInProspectorStatus,
  Spark,
  SparkGroup,
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
const logWorkspace = debugLog("[Euryka workspace]");

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

  const navigationState = useUIStore(
    useShallow((state) => ({
      currentPage: state.currentPage,
      selectedWorkspaceId: state.selectedWorkspaceId,
      selectedBrandId: state.selectedBrandId,
      selectedProjectId: state.selectedProjectId,
      selectedSession: state.selectedSession,
      selectedMarkerId: state.selectedMarkerId,
      selectedImageUrl: state.selectedImageUrl,
      selectedCollectionId: state.selectedCollectionId,
      selectedCollectionItemId: state.selectedCollectionItemId,
    }))
  );
  const resultState = useUIStore(
    useShallow((state) => ({
      showSparkResult: state.showSparkResult,
      sparkResult: state.sparkResult,
      sparkResultSessionId: state.sparkResultSessionId,
      sparkResultSourceUrl: state.sparkResultSourceUrl,
      showChatResult: state.showChatResult,
      activeSpark: state.activeSpark,
      imageResult: state.imageResult,
      imageResultSessionId: state.imageResultSessionId,
    }))
  );
  const chatState = useUIStore(
    useShallow((state) => ({
      chatId: state.chatId,
      chatMessages: state.chatMessages,
      chatSources: state.chatSources,
      chatError: state.chatError,
      isChatStreaming: state.isChatStreaming,
    }))
  );
  const activityState = useUIStore(
    useShallow((state) => ({
      isDragging: state.isDragging,
      isLoadingSpark: state.isLoadingSpark,
      isLoadingImage: state.isLoadingImage,
      pendingAction: state.pendingAction,
    }))
  );
  const actions = useUIStore(
    useShallow((state) => ({
      setPage: state.setPage,
      setWorkspace: state.setWorkspace,
      setBrand: state.setBrand,
      setProject: state.setProject,
      setSelectedSession: state.setSelectedSession,
      setSelectedMarkerId: state.setSelectedMarkerId,
      setSelectedImageUrl: state.setSelectedImageUrl,
      setShowSparkResult: state.setShowSparkResult,
      setShowChatResult: state.setShowChatResult,
      setChatId: state.setChatId,
      setChatMessages: state.setChatMessages,
      setChatSources: state.setChatSources,
      setChatError: state.setChatError,
      setChatStreaming: state.setChatStreaming,
      setIsDragging: state.setIsDragging,
      setLoadingSpark: state.setLoadingSpark,
      setLoadingImage: state.setLoadingImage,
      setImageResult: state.setImageResult,
      resetInnerViews: state.resetInnerViews,
      setPendingAction: state.setPendingAction,
      setSelectedCollectionId: state.setSelectedCollectionId,
      setSelectedCollectionItemId: state.setSelectedCollectionItemId,
    }))
  );
  const {
    currentPage,
    selectedWorkspaceId,
    selectedBrandId,
    selectedProjectId,
    selectedSession,
    selectedMarkerId,
    selectedImageUrl,
    selectedCollectionId,
    selectedCollectionItemId,
  } = navigationState;
  const {
    showSparkResult,
    sparkResult,
    sparkResultSessionId,
    sparkResultSourceUrl,
    showChatResult,
    activeSpark,
    imageResult,
    imageResultSessionId,
  } = resultState;
  const { chatId, chatMessages, chatSources, chatError, isChatStreaming } = chatState;
  const { isDragging, isLoadingSpark, isLoadingImage, pendingAction } = activityState;
  const {
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
  } = actions;

  const isLoggedIn = !!auth?.token;
  const hasChatApiKey = Boolean(chatApiKey?.trim());
  const chatApiKeyPromptAvailable = ENABLE_EURYKA_CHAT_PROVIDER && hasChatApiKey;
  const chatAbortRef = useRef<AbortController | null>(null);
  const chatRunIdRef = useRef(0);
  const [includeChatPageContent, setIncludeChatPageContent] = useState(true);
  const [includeChatSelectedText, setIncludeChatSelectedText] = useState(false);
  const [pageContextMode, setPageContextMode] = useState<PageContextMode>("compact");
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
      logWorkspace("cannot run spark without workspace", {
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

    const pageWillBeCompacted =
      pageContextMode !== "trim" && limitState.exceedsPageContentLimit;
    setChatUserNotice(
      pageWillBeCompacted && !limitState.exceedsSelectedTextLimit
        ? trimmed
          ? "Page context was compacted to fit the local model."
          : "Page context will be compacted to fit the local model."
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
        pageContextMode,
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
          pageContextMode,
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
          rightSlot={
            currentPage === "sparks" &&
            !selectedImageUrl &&
            !isSparkResultView &&
            !isChatResultView ? (
              <ContextSelector
                brands={brands}
                projects={projects}
                selectedBrandId={selectedBrandId}
                selectedProjectId={selectedProjectId}
                onSelectBrand={setBrand}
                onSelectProject={setProject}
              />
            ) : undefined
          }
          centerTitle={isSparkResultView || isChatResultView}
        />

        <main className="flex-1 overflow-hidden">
          {selectedImageUrl || currentPage === "sparks" ? (
            <SparksPage
              selectedImageUrl={selectedImageUrl}
              imageProps={{
                result: imageResult,
                sessionId: imageResultSessionId,
                wsId: selectedWorkspaceId,
                isLoading: isLoadingImage,
                onBack: () => {
                  setSelectedImageUrl(null);
                  setImageResult(null);
                },
              }}
              showChatResult={showChatResult}
              chatProps={{
                messages: chatMessages,
                sources: chatSources,
                error: chatError,
                isStreaming: isChatStreaming,
                apiKeyAvailable: !ENABLE_EURYKA_CHAT_PROVIDER || chatApiKeyPromptAvailable,
                chatId,
                mode: chatMode,
                sparkRecommendationResult,
                includePageContent: includeChatPageContent,
                pageContextMode,
                includeSelectedText: includeChatSelectedText,
                pageContentCharCount: chatContextCounts.pageContent,
                selectedTextCharCount: chatContextCounts.selectedText,
                pageContentExceedsLimit:
                  getChatContextLimitState(chatContextCounts).exceedsPageContentLimit,
                selectedTextExceedsLimit:
                  getChatContextLimitState(chatContextCounts).exceedsSelectedTextLimit,
                chatContextStatus: chatUserNotice,
                chatContextStatusTitle: chatUserNoticeTitle,
                chatProviderStatus: DEBUG ? chatProviderDebugStatus : null,
                onSubmit: (message) => handleStartChat(message, true),
                onStop: handleStopChat,
                onOpenSettings: openChatSettings,
                onOpenThread: handleOpenChatThread,
                onModeChange: setChatMode,
                onRunRecommendedSpark: handleUseSpark,
                onIncludePageContentChange: handleIncludeChatPageContentChange,
                onPageContextModeChange: setPageContextMode,
                onIncludeSelectedTextChange: handleIncludeChatSelectedTextChange,
              }}
              showSparkResult={showSparkResult}
              prospectorResult={prospectorResult}
              prospectorProps={{
                spark: LINKEDIN_PROSPECTOR_SPARK,
                sourceUrl: sparkResultSourceUrl,
                isLoading: isLoadingSpark,
                wsId: selectedWorkspaceId,
                brandId: selectedBrandId,
                projectId: selectedProjectId,
                onBack: () => {
                  setProspectorResult(null);
                  setShowSparkResult(false);
                },
              }}
              sparkResult={sparkResult}
              sparkResultProps={{
                sessionId: sparkResultSessionId,
                sourceUrl: sparkResultSourceUrl,
                spark: activeSpark,
                wsId: selectedWorkspaceId,
                onBack: () => setShowSparkResult(false),
              }}
              isLoadingSpark={isLoadingSpark}
              galleryProps={{
                lastFive: prefs?.lastFive ?? [],
                currentUrl: currentTabUrl,
                chatApiKeyAvailable: !ENABLE_EURYKA_CHAT_PROVIDER || chatApiKeyPromptAvailable,
                chatMode,
                includePageContent: includeChatPageContent,
                pageContextMode,
                includeSelectedText: includeChatSelectedText,
                pageContentCharCount: chatContextCounts.pageContent,
                selectedTextCharCount: chatContextCounts.selectedText,
                pageContentExceedsLimit:
                  getChatContextLimitState(chatContextCounts).exceedsPageContentLimit,
                selectedTextExceedsLimit:
                  getChatContextLimitState(chatContextCounts).exceedsSelectedTextLimit,
                chatContextStatus: chatUserNotice,
                chatContextStatusTitle: chatUserNoticeTitle,
                chatProviderStatus: DEBUG ? chatProviderDebugStatus : null,
                prospector: {
                  visible: prospectorStatus.visible,
                  title: LINKEDIN_PROSPECTOR_SPARK.title,
                  description: LINKEDIN_PROSPECTOR_SPARK.description ?? "",
                  icon: LINKEDIN_PROSPECTOR_SPARK.icon ?? "Search",
                  color: LINKEDIN_PROSPECTOR_SPARK.color ?? "#0A66C2",
                  onClick: handleRunProspector,
                },
                onUseSpark: handleUseSpark,
                onStartChat: (message) => handleStartChat(message, false),
                onOpenChatSettings: openChatSettings,
                onChatModeChange: setChatMode,
                onIncludePageContentChange: handleIncludeChatPageContentChange,
                onPageContextModeChange: setPageContextMode,
                onIncludeSelectedTextChange: handleIncludeChatSelectedTextChange,
              }}
            />
          ) : currentPage === "history" ? (
            <HistoryPage
              selectedSession={selectedSession}
              workspaceId={selectedWorkspaceId}
              onSelectSession={setSelectedSession}
            />
          ) : currentPage === "annotations" ? (
            <AnnotationsPage
              selectedMarkerId={selectedMarkerId}
              onSelectMarker={setSelectedMarkerId}
            />
          ) : currentPage === "collections" ? (
            <CollectionsPage
              selectedCollectionId={selectedCollectionId}
              selectedCollectionItemId={selectedCollectionItemId}
              onSelectCollection={setSelectedCollectionId}
              onSelectCollectionItem={setSelectedCollectionItemId}
              onOpenItem={openCollectionItem}
              onOpenItemFromCollection={openCollectionItemFromCollection}
            />
          ) : currentPage === "settings" ? (
            <SettingsPage
              chatProviderEnabled={ENABLE_EURYKA_CHAT_PROVIDER}
              chatApiKey={chatApiKey ?? ""}
              prefs={prefs}
              defaultPrefs={DEFAULT_USER_PREFS}
              onSaveChatApiKey={setChatApiKey}
              onChangePrefs={setPrefs}
            />
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

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <SidePanel />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
