/// <reference path="../../.wxt/wxt.d.ts" />

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { AnnotationHeaderTitle } from "../../components/annotations/AnnotationView";
import { SessionHeaderTitle } from "../../components/history/SessionView";
import {
  DROP_ERROR_EXIT_DURATION_MS,
  DropErrorToast,
  DropzoneOverlay,
} from "../../components/image/DropzoneOverlay";
import { AppSidebar, NavRail } from "../../components/layout/AppSidebar";
import { Header } from "../../components/layout/Header";
import { LoggedOut } from "../../components/layout/LoggedOut";
import { AnnotationsPage } from "../../components/pages/AnnotationsPage";
import { CollectionsPage } from "../../components/pages/CollectionsPage";
import { HistoryPage } from "../../components/pages/HistoryPage";
import { SettingsPage } from "../../components/pages/SettingsPage";
import { SparksPage } from "../../components/pages/SparksPage";
import { Button } from "../../components/shared/Button";
import { ContextSelector } from "../../components/sparks/ContextSelector";
import { useChatController } from "../../hooks/use-chat-controller";
import { useSidePanelLifecycle } from "../../hooks/use-sidepanel-lifecycle";
import { useSparkController } from "../../hooks/use-spark-controller";
import { useRunSpark } from "../../hooks/use-sparks";
import { useStorageItem } from "../../hooks/use-storage-item";
import { useTabContext } from "../../hooks/use-tab-context";
import { ThemeProvider } from "../../hooks/use-theme";
import { useWorkspaceData } from "../../hooks/use-workspace";
import { fetchAndStoreToken } from "../../lib/auth";
import {
  SPARK_RECOMMENDATION_CHROME_PROMPT_LIMITS,
  getChatContextLimitState,
} from "../../lib/chat-prompt";
import { DEBUG } from "../../lib/debug";
import { LINKEDIN_PROSPECTOR_SPARK } from "../../lib/prospector";
import { authStorage, chatApiKeyStorage, userPrefs } from "../../lib/storage";
import type { AuthState, CollectionItem, UserPrefs } from "../../lib/types";
import { useUIStore } from "../../store/ui";

const queryClient = new QueryClient();
const DEFAULT_USER_PREFS: UserPrefs = {
  showFloatingButton: true,
  actionButtonY: 0.6,
  lastUsedSpark: null,
  lastFive: [],
};
const ENABLE_EURYKA_CHAT_PROVIDER = false;

// The panel page receives its tabId via the URL query string, set by the
// background when calling sidePanel.setOptions({ path: "sidepanel.html?tabId=N" }).
// This is the only way for the panel to know which tab it belongs to —
// chrome.tabs.getCurrent() returns undefined inside a side panel.
const THIS_TAB_ID = (() => {
  const v = new URLSearchParams(location.search).get("tabId");
  return v ? Number(v) : null;
})();

function SidePanel() {
  const [dropError, setDropError] = useState<{
    message: string;
    durationMs: number;
  } | null>(null);
  const [dropErrorExiting, setDropErrorExiting] = useState(false);
  const [auth] = useStorageItem<AuthState>(authStorage);
  const [authResolved, setAuthResolved] = useState(false);
  const [chatApiKey, setChatApiKey] = useStorageItem<string>(chatApiKeyStorage);
  const [prefs, setPrefs] = useStorageItem<UserPrefs>(userPrefs);
  const { currentTabUrl, prospectorStatus } = useTabContext(THIS_TAB_ID);

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
      setIsDragging: state.setIsDragging,
      setImageResult: state.setImageResult,
      resetInnerViews: state.resetInnerViews,
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
  const { isDragging, isLoadingSpark, isLoadingImage } = activityState;
  const {
    setPage,
    setWorkspace,
    setBrand,
    setProject,
    setSelectedSession,
    setSelectedMarkerId,
    setSelectedImageUrl,
    setShowSparkResult,
    setIsDragging,
    setImageResult,
    resetInnerViews,
    setSelectedCollectionId,
    setSelectedCollectionItemId,
  } = actions;

  useEffect(() => {
    if (!dropError) return;
    const exitTimeoutId = window.setTimeout(
      () => setDropErrorExiting(true),
      Math.max(0, dropError.durationMs - DROP_ERROR_EXIT_DURATION_MS)
    );
    const removeTimeoutId = window.setTimeout(() => {
      setDropError(null);
      setDropErrorExiting(false);
    }, dropError.durationMs);
    return () => {
      window.clearTimeout(exitTimeoutId);
      window.clearTimeout(removeTimeoutId);
    };
  }, [dropError]);

  useEffect(() => {
    let cancelled = false;
    let validating = false;

    const validateSession = async () => {
      if (validating) return;
      validating = true;
      try {
        const token = await fetchAndStoreToken();
        if (token) {
          await queryClient.invalidateQueries({ queryKey: ["workspace"] });
        }
      } finally {
        validating = false;
        if (!cancelled) setAuthResolved(true);
      }
    };

    const validateWhenVisible = () => {
      if (document.visibilityState === "visible") void validateSession();
    };

    void validateSession();
    window.addEventListener("focus", validateWhenVisible);
    document.addEventListener("visibilitychange", validateWhenVisible);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", validateWhenVisible);
      document.removeEventListener("visibilitychange", validateWhenVisible);
    };
  }, []);

  const isLoggedIn = authResolved && !!auth?.token;
  const hasChatApiKey = Boolean(chatApiKey?.trim());
  const chatApiKeyPromptAvailable = ENABLE_EURYKA_CHAT_PROVIDER && hasChatApiKey;
  // Workspace data
  const { data: wsData } = useWorkspaceData(selectedWorkspaceId, isLoggedIn);
  const workspaces = wsData?.workspaces ?? [];
  const brands = wsData?.brands ?? [];
  const projects = wsData?.projects ?? [];

  const runSpark = useRunSpark(selectedWorkspaceId);

  const {
    includeChatPageContent,
    includeChatSelectedText,
    chatMode,
    sparkRecommendationResult,
    chatContextCounts,
    chatUserNotice,
    chatUserNoticeTitle,
    chatProviderDebugStatus,
    setChatMode,
    handleIncludeChatPageContentChange,
    handleIncludeChatSelectedTextChange,
    handleStartChat: startChat,
    handleStopChat,
    handleRetryChat,
    handleBackFromChat,
    handleOpenChatThread,
    clearSparkRecommendation,
  } = useChatController({
    queryClient,
    tabId: THIS_TAB_ID,
    currentTabUrl,
    chatApiKey,
    selectedBrandId,
    selectedProjectId,
  });
  const chatContextLimitState = getChatContextLimitState(
    chatContextCounts,
    chatMode === "spark-recommendation" ? SPARK_RECOMMENDATION_CHROME_PROMPT_LIMITS : undefined
  );

  const {
    prospectorResult,
    setProspectorResult,
    handleUseSpark,
    handleRunProspector,
    handleAnalyseImage,
  } = useSparkController({
    tabId: THIS_TAB_ID,
    currentTabUrl,
    selectedWorkspaceId,
    selectedBrandId,
    selectedProjectId,
    workspaces,
    runSpark: runSpark.mutateAsync,
    setPrefs,
    stopChat: handleStopChat,
    clearSparkRecommendation,
  });

  const handleStartChat = (message: string, continueConversation: boolean) => {
    setProspectorResult(null);
    return startChat(message, continueConversation);
  };
  const { sidebarOpen, setSidebarOpen, sidebarDocked } = useSidePanelLifecycle({
    auth,
    tabId: THIS_TAB_ID,
    selectedWorkspaceId,
    workspaces,
    setWorkspace,
    queryClient,
    handleUseSpark,
    handleAnalyseImage,
  });
  if (!authResolved) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Checking session...
      </div>
    );
  }
  if (!isLoggedIn) return <LoggedOut />;

  const isChatResultView = currentPage === "sparks" && !selectedImageUrl && showChatResult;

  const isImageResultView = currentPage === "sparks" && Boolean(selectedImageUrl);

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

  const closeImageResult = () => {
    setSelectedImageUrl(null);
    setImageResult(null);
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
            isImageResultView ? (
              <Button
                variant="ghost"
                size="md"
                onClick={closeImageResult}
                disabled={isLoadingImage}
                className="px-0 hover:bg-transparent"
              >
                <ArrowLeft size={16} />
                Back
              </Button>
            ) : isChatResultView ? (
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
          centerTitle={isImageResultView || isSparkResultView || isChatResultView}
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
                includeSelectedText: includeChatSelectedText,
                pageContentCharCount: chatContextCounts.pageContent,
                selectedTextCharCount: chatContextCounts.selectedText,
                pageContentExceedsLimit: chatContextLimitState.exceedsPageContentLimit,
                selectedTextExceedsLimit: chatContextLimitState.exceedsSelectedTextLimit,
                chatContextStatus: chatUserNotice,
                chatContextStatusTitle: chatUserNoticeTitle,
                chatProviderStatus: DEBUG ? chatProviderDebugStatus : null,
                onSubmit: (message) => handleStartChat(message, true),
                onStop: handleStopChat,
                onRetry: handleRetryChat,
                onOpenSettings: openChatSettings,
                onOpenThread: handleOpenChatThread,
                onModeChange: setChatMode,
                onRunRecommendedSpark: handleUseSpark,
                onIncludePageContentChange: handleIncludeChatPageContentChange,
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
                chatApiKeyAvailable: !ENABLE_EURYKA_CHAT_PROVIDER || chatApiKeyPromptAvailable,
                chatMode,
                includePageContent: includeChatPageContent,
                includeSelectedText: includeChatSelectedText,
                pageContentCharCount: chatContextCounts.pageContent,
                selectedTextCharCount: chatContextCounts.selectedText,
                pageContentExceedsLimit: chatContextLimitState.exceedsPageContentLimit,
                selectedTextExceedsLimit: chatContextLimitState.exceedsSelectedTextLimit,
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

        {isDragging && !isLoadingImage && (
          <DropzoneOverlay
            onDrop={(result) => {
              setDropError(null);
              setDropErrorExiting(false);
              setIsDragging(false);
              setPage("sparks");
              handleAnalyseImage(result);
            }}
            onClose={() => setIsDragging(false)}
            onError={(message, durationMs) => {
              setDropErrorExiting(false);
              setDropError({ message, durationMs });
            }}
          />
        )}
        {dropError && <DropErrorToast message={dropError.message} exiting={dropErrorExiting} />}
      </div>
    </div>
  );
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
