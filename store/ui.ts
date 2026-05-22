import { create } from "zustand";
import type { CollectionItem, PageKey, Session, Spark } from "../lib/types";

type PendingCollectionItem = Omit<CollectionItem, "id" | "collectionId" | "createdAt">;

type PendingAction =
  | { type: "analyseImage"; imageUrl: string; pageUrl?: string; pageContent?: string }
  | { type: "triggerSpark"; sparkId: string };

interface UIState {
  currentPage: PageKey;
  selectedWorkspaceId: string | null;
  selectedBrandId: string | null;
  selectedProjectId: string | null;
  selectedSession: Session | null;
  selectedMarkerId: string | null;
  selectedImageUrl: string | null;
  showSparkResult: boolean;
  sparkResult: string | null;
  sparkResultSessionId: string | null;
  sparkResultSourceUrl: string | null;
  activeSpark: Spark | null;
  isDragging: boolean;
  isLoadingSpark: boolean;
  isLoadingImage: boolean;
  imageResult: string | null;
  imageResultSessionId: string | null;
  pendingAction: PendingAction | null;
  selectedCollectionId: string | null;
  pendingCollectionItem: PendingCollectionItem | null;

  setPage: (page: PageKey) => void;
  setWorkspace: (id: string | null) => void;
  setBrand: (id: string | null) => void;
  setProject: (id: string | null) => void;
  setSelectedSession: (session: Session | null) => void;
  setSelectedMarkerId: (id: string | null) => void;
  setSelectedImageUrl: (url: string | null) => void;
  setShowSparkResult: (show: boolean, result?: string, sessionId?: string, spark?: Spark, sourceUrl?: string) => void;
  setIsDragging: (dragging: boolean) => void;
  setLoadingSpark: (loading: boolean) => void;
  setLoadingImage: (loading: boolean) => void;
  setImageResult: (result: string | null, sessionId?: string | null) => void;
  setPendingAction: (action: PendingAction | null) => void;
  setSelectedCollectionId: (id: string | null) => void;
  setPendingCollectionItem: (item: PendingCollectionItem | null) => void;
  resetInnerViews: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  currentPage: "sparks",
  selectedWorkspaceId: null,
  selectedBrandId: null,
  selectedProjectId: null,
  selectedSession: null,
  selectedMarkerId: null,
  selectedImageUrl: null,
  showSparkResult: false,
  sparkResult: null,
  sparkResultSessionId: null,
  sparkResultSourceUrl: null,
  activeSpark: null,
  isDragging: false,
  isLoadingSpark: false,
  isLoadingImage: false,
  imageResult: null,
  imageResultSessionId: null,
  pendingAction: null,
  selectedCollectionId: null,
  pendingCollectionItem: null,

  setPage: (page) => set({ currentPage: page }),
  setWorkspace: (id) => set({ selectedWorkspaceId: id, selectedBrandId: null, selectedProjectId: null }),
  setBrand: (id) => set({ selectedBrandId: id, selectedProjectId: null }),
  setProject: (id, ) => set({ selectedProjectId: id }),
  setSelectedSession: (session) => set({ selectedSession: session }),
  setSelectedMarkerId: (id) => set({ selectedMarkerId: id }),
  setSelectedImageUrl: (url) => set({ selectedImageUrl: url }),
  setShowSparkResult: (show, result, sessionId, spark, sourceUrl) =>
    set({
      showSparkResult: show,
      sparkResult: result ?? null,
      sparkResultSessionId: sessionId ?? null,
      sparkResultSourceUrl: sourceUrl ?? null,
      activeSpark: spark ?? null,
    }),
  setIsDragging: (dragging) => set({ isDragging: dragging }),
  setLoadingSpark: (loading) => set({ isLoadingSpark: loading }),
  setLoadingImage: (loading) => set({ isLoadingImage: loading }),
  setImageResult: (result, sessionId) =>
    set({ imageResult: result, imageResultSessionId: sessionId ?? null }),
  setPendingAction: (action) => set({ pendingAction: action }),
  setSelectedCollectionId: (id) => set({ selectedCollectionId: id }),
  setPendingCollectionItem: (item) => set({ pendingCollectionItem: item }),
  resetInnerViews: () =>
    set({
      selectedSession: null,
      selectedMarkerId: null,
      selectedImageUrl: null,
      showSparkResult: false,
      sparkResult: null,
      sparkResultSourceUrl: null,
      imageResult: null,
      selectedCollectionId: null,
      pendingCollectionItem: null,
    }),
}));
