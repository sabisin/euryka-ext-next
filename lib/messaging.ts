import { defineExtensionMessaging } from "@webext-core/messaging";
import type {
  AnnotationCreateInput,
  AnnotationCreateResponse,
  AnnotationListParams,
  AnnotationListResponse,
  AnnotationUpdateInput,
  AnnotationUpdateResponse,
} from "./annotations-api";
import type { CollectionItemType, UserPrefs } from "./types";

interface ProtocolMap {
  extractText(): { text: string };
  getSelectedText(): { text: string };
  getLinkedInProspectStatus(): import("./types").LinkedInProspectorStatus;
  getLinkedInProspectData(): import("./types").LinkedInProspectData;
  textSelected(data: { text: string; selector: string }): void;
  saveText(data: { text: string }): void;
  analyseImage(data: { imageUrl: string; pageUrl?: string; pageContent?: string; forTabId?: number }): void;
  triggerSpark(data: { sparkId: string; forTabId?: number }): void;
  createAnnotationMarker(): void;
  listAnnotations(data: AnnotationListParams): AnnotationListResponse;
  createAnnotation(data: AnnotationCreateInput): AnnotationCreateResponse;
  updateAnnotation(data: { id: string; payload: AnnotationUpdateInput }): AnnotationUpdateResponse;
  deleteAnnotation(data: { id: string }): void;
  annotationUpdated(data: AnnotationCreateResponse): void;
  annotationDeleted(data: { id: string }): void;
  getUserPrefs(): UserPrefs;
  updateUserPrefs(data: Partial<UserPrefs>): UserPrefs;
  getCurrentIdentity(): string | null;
  openSidePanel(): void;
  pageDragStart(): void;
  pageDragEnd(): void;
  sidePanelReady(data: { tabId: number }): void;
  keepAlive(): void;
  reset(): void;
  fetchImage(data: { url: string }): { data: number[]; mime: string };
  getTabUrl(data: { tabId: number }): { url: string };
  saveToCollection(data: { type: CollectionItemType; title: string; content: string; thumbnail?: string; sourceUrl: string; forTabId?: number }): void;
}

// Capture the messenger so we can also expose `removeAllListeners` — needed
// for defensive cleanup when the panel re-mounts (HMR, rapid open/close,
// error-boundary retry) and stale listeners would otherwise cause the library
// to throw "only one listener can be setup for X".
const messenger = defineExtensionMessaging<ProtocolMap>();
export const { onMessage, sendMessage, removeAllListeners } = messenger;
