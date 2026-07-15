import type { QueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { decodeJwt, getValidToken } from "../lib/auth";
import { debugLog } from "../lib/debug";
import { onMessage, removeAllListeners, sendMessage } from "../lib/messaging";
import { collectionItemsStorage, collectionsStorage, currentIdentityStorage } from "../lib/storage";
import type {
  AuthState,
  Collection,
  CollectionItem,
  DragImageResult,
  Spark,
  SparkGroup,
  Workspace,
} from "../lib/types";
import { useUIStore } from "../store/ui";

const EXPANDED_SIDEBAR_THRESHOLD = 900;
const DEFAULT_COLLECTION_NAME = "Saved items";
const logCollectionSave = debugLog("[Euryka collections]");
let collectionSaveQueue = Promise.resolve();

type UseSidePanelLifecycleOptions = {
  auth: AuthState | null | undefined;
  tabId: number | null;
  selectedWorkspaceId: string | null;
  workspaces: Workspace[];
  setWorkspace: (id: string | null) => void;
  queryClient: QueryClient;
  handleUseSpark: (spark: Spark) => Promise<void>;
  handleAnalyseImage: (result: DragImageResult, pageUrl?: string) => Promise<void>;
};

export function useSidePanelLifecycle({
  auth,
  tabId,
  selectedWorkspaceId,
  workspaces,
  setWorkspace,
  queryClient,
  handleUseSpark,
  handleAnalyseImage,
}: UseSidePanelLifecycleOptions) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarDocked, setSidebarDocked] = useState(false);
  const { pendingAction, setPendingAction, setSelectedImageUrl, setPage, setIsDragging } =
    useUIStore(
      useShallow((state) => ({
        pendingAction: state.pendingAction,
        setPendingAction: state.setPendingAction,
        setSelectedImageUrl: state.setSelectedImageUrl,
        setPage: state.setPage,
        setIsDragging: state.setIsDragging,
      }))
    );
  const handleUseSparkRef = useRef(handleUseSpark);
  const handleAnalyseImageRef = useRef(handleAnalyseImage);
  handleUseSparkRef.current = handleUseSpark;
  handleAnalyseImageRef.current = handleAnalyseImage;

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

  useEffect(() => {
    if (!selectedWorkspaceId || !pendingAction) return;
    const action = pendingAction;
    setPendingAction(null);
    if (action.type === "analyseImage") {
      setSelectedImageUrl(action.imageUrl);
      void handleAnalyseImageRef.current(
        { url: action.imageUrl, source: "browser" },
        action.pageUrl
      );
      return;
    }

    const groups = queryClient.getQueryData<SparkGroup[]>(["sparks"]);
    const spark = groups
      ?.flatMap((group) => group.sparks)
      .find((item) => item.id === action.sparkId);
    if (spark) void handleUseSparkRef.current(spark);
  }, [pendingAction, queryClient, selectedWorkspaceId, setPendingAction, setSelectedImageUrl]);

  useEffect(() => {
    removeAllListeners();

    const cleanups = [
      onMessage("analyseImage", ({ data }) => {
        if (data.forTabId !== undefined && data.forTabId !== tabId) return;
        setPage("sparks");
        setPendingAction({
          type: "analyseImage",
          imageUrl: data.imageUrl,
          pageUrl: data.pageUrl,
        });
      }),
      onMessage("triggerSpark", ({ data }) => {
        if (data.forTabId !== undefined && data.forTabId !== tabId) return;
        setPendingAction({ type: "triggerSpark", sparkId: data.sparkId });
      }),
      onMessage("pageDragStart", () => setIsDragging(true)),
      onMessage("pageDragEnd", () => setIsDragging(false)),
      onMessage("openSidePanel", ({ sender }) => {
        if (tabId !== null && sender.tab?.id === tabId) {
          window.setTimeout(() => window.close(), 50);
        }
      }),
      onMessage("saveToCollection", async ({ data }) => {
        if (data.forTabId !== undefined && data.forTabId !== tabId) return;
        logCollectionSave("Sidepanel received saveToCollection", { tabId, data });
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
      }),
      onMessage("annotationUpdated", ({ data }) => {
        window.dispatchEvent(
          new CustomEvent("eurykaAnnotationUpdated", { detail: data.annotation })
        );
      }),
      onMessage("annotationDeleted", ({ data }) => {
        window.dispatchEvent(new CustomEvent("eurykaAnnotationDeleted", { detail: data.id }));
      }),
    ];

    return () => {
      for (const cleanup of cleanups) cleanup();
    };
  }, [setIsDragging, setPage, setPendingAction, tabId]);

  useEffect(() => {
    if (!auth?.token) {
      void currentIdentityStorage.setValue(null);
      return;
    }
    const payload = decodeJwt(auth.token);
    const identity = auth.email ?? payload.email ?? auth.name ?? payload.name ?? null;
    void currentIdentityStorage.setValue(identity);
  }, [auth]);

  useEffect(() => {
    void (async () => {
      let resolvedTabId = tabId;
      if (!resolvedTabId) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        resolvedTabId = tab?.id ?? null;
      }
      if (resolvedTabId) {
        const port = chrome.runtime.connect({ name: "sidePanelTracker" });
        port.postMessage({ type: "PING", tabId: resolvedTabId });
        await sendMessage("sidePanelReady", { tabId: resolvedTabId }).catch(() => {});
      }
      await getValidToken();
    })();
  }, [tabId]);

  useEffect(() => {
    if (!selectedWorkspaceId && workspaces.length > 0) {
      setWorkspace(workspaces[0].id);
    }
  }, [selectedWorkspaceId, setWorkspace, workspaces]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      sendMessage("keepAlive", undefined).catch(() => {});
    }, 25_000);
    return () => window.clearInterval(intervalId);
  }, []);

  return { sidebarOpen, setSidebarOpen, sidebarDocked };
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
  logCollectionSave("Default collection created", { id: collection.id });
  return collection.id;
}
