/// <reference path="../../.wxt/wxt.d.ts" />

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Monitor, Moon, Sun } from "lucide-react";
import { ThemeProvider } from "../../hooks/use-theme";
import { useStorageItem } from "../../hooks/use-storage-item";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  onMessage,
  removeAllListeners,
  sendMessage,
} from "../../lib/messaging";
import {
  authStorage,
  collectionsStorage,
  collectionItemsStorage,
  currentIdentityStorage,
  pageTextStorage,
  pageUrlStorage,
  selectedTextStorage,
  userPrefs,
} from "../../lib/storage";
import {
  decodeJwt,
  fetchAndStoreToken,
  getValidToken,
  runWithTokenRetry,
} from "../../lib/auth";
import { analyseImage as apiAnalyseImage } from "../../lib/api";
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
import { ProspectorResult } from "../../components/sparks/ProspectorResult";
import { HistoryList } from "../../components/history/HistoryList";
import { SessionHeaderTitle, SessionView } from "../../components/history/SessionView";
import { DropzoneOverlay } from "../../components/image/DropzoneOverlay";
import { ImageResult } from "../../components/image/ImageResult";
import { Button } from "../../components/shared/Button";
import type {
  AuthState,
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
const DEFAULT_COLLECTION_NAME = "Saved items";
let collectionSaveQueue = Promise.resolve();

function logCollectionSave(message: string, details?: unknown) {
  console.info(`[Euryka collections] ${message}`, details ?? "");
}

// The panel page receives its tabId via the URL query string, set by the
// background when calling sidePanel.setOptions({ path: "sidepanel.html?tabId=N" }).
// This is the only way for the panel to know which tab it belongs to —
// chrome.tabs.getCurrent() returns undefined inside a side panel.
const THIS_TAB_ID = (() => {
  const v = new URLSearchParams(location.search).get("tabId");
  return v ? Number(v) : null;
})();

interface ExtensionPort {
  postMessage: (message: unknown) => void;
}

interface ExtensionTab {
  id?: number;
}

declare const chrome: {
  runtime: {
    connect: (connectInfo: { name: string }) => ExtensionPort;
  };
  tabs: {
    query: (queryInfo: {
      active: boolean;
      currentWindow: boolean;
    }) => Promise<ExtensionTab[]>;
  };
};

function SidePanel() {
  const [auth] = useStorageItem<AuthState>(authStorage);
  const [prefs, setPrefs] = useStorageItem<UserPrefs>(userPrefs);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarDocked, setSidebarDocked] = useState(false);
  const [currentTabUrl, setCurrentTabUrl] = useState<string | null>(null);
  const [prospectorStatus, setProspectorStatus] = useState<LinkedInProspectorStatus>(
    DEFAULT_LINKEDIN_PROSPECTOR_STATUS,
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
    activeSpark,
    isDragging,
    isLoadingSpark,
    isLoadingImage,
    imageResult,
    imageResultSessionId,
    pendingAction,
    setPage,
    setWorkspace,
    setBrand,
    setProject,
    setSelectedSession,
    setSelectedMarkerId,
    setSelectedImageUrl,
    setShowSparkResult,
    setIsDragging,
    setLoadingSpark,
    setLoadingImage,
    setImageResult,
    resetInnerViews,
    setPendingAction,
  } = useUIStore();

  const isLoggedIn = !!auth?.token;

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
    const identity =
      auth.email ?? payload.email ?? auth.name ?? payload.name ?? null;
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

  // ── On mount: auth + tracker port + flush pending actions ────────────────
  useEffect(() => {
    (async () => {
      const token = await fetchAndStoreToken();
      if (!token) return;
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
        await sendMessage("sidePanelReady", { tabId });
      }
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
      handleAnalyseImageRef.current({
        url: action.imageUrl,
        source: "browser",
      });
    } else if (action.type === "triggerSpark") {
      const groups = queryClient.getQueryData<SparkGroup[]>(["sparks"]);
      const spark = groups
        ?.flatMap((g) => g.sparks)
        .find((s) => s.id === action.sparkId);
      if (spark) handleUseSparkRef.current(spark);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedWorkspaceId,
    pendingAction,
    setPendingAction,
    setSelectedImageUrl,
  ]);

  // ── Spark execution ───────────────────────────────────────────────────────
  // Defined before the message-listener effect so the refs below can point at them.
  const handleUseSpark = async (spark: Spark) => {
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

    let pageText = await pageTextStorage.getValue();
    let pageUrl = await pageUrlStorage.getValue();
    let selectedText = await selectedTextStorage.getValue();

    if (THIS_TAB_ID !== null) {
      const [activeUrl, extractedText, currentSelection] = await Promise.all([
        sendMessage("getTabUrl", { tabId: THIS_TAB_ID }),
        sendMessage("extractText", undefined, THIS_TAB_ID).catch(() => null),
        sendMessage("getSelectedText", undefined, THIS_TAB_ID).catch(() => null),
      ]);
      pageUrl = activeUrl.url || pageUrl;
      pageText = extractedText?.text || pageText;
      selectedText = currentSelection?.text || selectedText;
      await Promise.all([
        pageUrlStorage.setValue(pageUrl),
        pageTextStorage.setValue(pageText),
        selectedTextStorage.setValue(selectedText),
      ]);
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
        lastFive: [
          spark.id,
          ...(p?.lastFive ?? []).filter((id) => id !== spark.id),
        ].slice(0, 5),
      }));
    } catch {
      setShowSparkResult(
        true,
        "We couldn't complete the request. Please retry shortly.",
        undefined,
        spark,
      );
    } finally {
      setLoadingSpark(false);
    }
  };

  const handleRunProspector = async () => {
    const initialProspect = buildFallbackProspect(currentTabUrl ?? "", []);
    setLoadingSpark(true);
    setProspectorResult(initialProspect);
    setShowSparkResult(true, "prospector", undefined, LINKEDIN_PROSPECTOR_SPARK, currentTabUrl ?? undefined);

    try {
      const prospect =
        THIS_TAB_ID !== null
          ? await sendMessage("getLinkedInProspectData", undefined, THIS_TAB_ID)
          : buildFallbackProspect(currentTabUrl ?? "", ["Failed to read the current LinkedIn page."]);

      setProspectorResult(prospect);
      setShowSparkResult(true, "prospector", undefined, LINKEDIN_PROSPECTOR_SPARK, prospect.pageUrl || currentTabUrl || undefined);
    } catch {
      const fallback = buildFallbackProspect(currentTabUrl ?? "", [
        "We couldn't inspect the current LinkedIn page or related entities. Please retry shortly.",
      ]);
      setProspectorResult(fallback);
      setShowSparkResult(true, "prospector", undefined, LINKEDIN_PROSPECTOR_SPARK, fallback.pageUrl || currentTabUrl || undefined);
    } finally {
      setLoadingSpark(false);
    }
  };

  // ── Image analysis ────────────────────────────────────────────────────────
  const handleAnalyseImage = async (dragResult: DragImageResult) => {
    if (!selectedWorkspaceId) return;
    const workspaceId = selectedWorkspaceId;
    setLoadingImage(true);
    setImageResult(null);

    const [pageUrl, pageText] = await Promise.all([
      pageUrlStorage.getValue(),
      pageTextStorage.getValue(),
    ]);

    try {
      let imageUrl = dragResult.url;

      if (dragResult.source === "filesystem" && dragResult.file) {
        const token = await getValidToken();
        if (!token) throw new Error("Not authenticated");
        const { imageUrl: uploaded } = await uploadFileWithRetry(
          token,
          workspaceId,
          dragResult.file,
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
        }),
      );

      setImageResult(result.content, result.id);
    } catch {
      setImageResult(null);
    } finally {
      setLoadingImage(false);
      setIsDragging(false);
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
          const next = [
            newItem,
            ...current.filter((item) => item.id !== newItem.id),
          ];
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
      window.dispatchEvent(new CustomEvent("eurykaAnnotationUpdated", {
        detail: data.annotation,
      }));
    });

    const cleanup8 = onMessage("annotationDeleted", ({ data }) => {
      window.dispatchEvent(new CustomEvent("eurykaAnnotationDeleted", {
        detail: data.id,
      }));
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

  const isSparkResultView =
    currentPage === "sparks" &&
    !selectedImageUrl &&
    (showSparkResult || isLoadingSpark);

  const navigate = (page: typeof currentPage) => {
    resetInnerViews();
    setPage(page);
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
          centerTitle={isSparkResultView}
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
            isSparkResultView ? (
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
            showSparkResult && prospectorResult ? (
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
                prospector={{
                  visible: prospectorStatus.visible,
                  title: LINKEDIN_PROSPECTOR_SPARK.title,
                  description: LINKEDIN_PROSPECTOR_SPARK.description ?? "",
                  icon: LINKEDIN_PROSPECTOR_SPARK.icon ?? "Search",
                  color: LINKEDIN_PROSPECTOR_SPARK.color ?? "#0A66C2",
                  onClick: handleRunProspector,
                }}
                onUseSpark={handleUseSpark}
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
              <HistoryList
                wsId={selectedWorkspaceId}
                onSelectSession={setSelectedSession}
              />
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
          ) : currentPage === "settings" ? (
            <div className="flex flex-col gap-px overflow-y-auto">
              <div className="flex items-center justify-between border-b border-border px-4 py-4">
                <div>
                  <p className="text-sm font-medium text-foreground">Theme</p>
                  <p className="text-xs text-muted-foreground">
                    Appearance preference
                  </p>
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
                  <p className="text-sm font-medium text-foreground">
                    Floating button
                  </p>
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

async function getOrCreateDefaultCollectionId(): Promise<string> {
  const collections = await collectionsStorage.getValue();
  logCollectionSave("Loaded collections for default collection lookup", {
    count: collections.length,
    names: collections.map((collection) => collection.name),
  });
  const existing = collections.find(
    (collection) => collection.name === DEFAULT_COLLECTION_NAME,
  );
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
