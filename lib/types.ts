export interface AuthState {
  token: string;
  expDate: string;
  name?: string;
  email?: string;
  avatarUrl?: string;
}

export interface UserIdentity {
  label: string | null;
  avatarUrl: string | null;
}

export interface UserPrefs {
  showFloatingButton: boolean;
  actionButtonY: number;
  lastUsedSpark: Spark | null;
  lastFive: string[];
  theme?: "system" | "dark" | "light";
  annotationsHidden?: boolean;
  annotationsTab?: "current" | "all";
  annotationPreviewTextSize?: "sm" | "md" | "lg";
}

export interface Collaborator {
  email: string;
  addedAt: number;
}

export interface Workspace {
  id: string;
  name: string;
  slug?: string;
}

export interface Brand {
  id: string;
  name: string;
  workspaceId: string;
}

export interface Project {
  id: string;
  name: string;
  // A project can belong to multiple brands (or none — those land under
  // "Other Projects" in the context picker).
  brands?: string[];
  workspaceId: string;
}

export interface Spark {
  id: string;
  title: string;
  description?: string;
  icon?: string;
  color?: string;
  group?: string;
}

export type ChatMode = "chat" | "spark-recommendation";

export interface SparkRecommendation {
  sparkId: string;
  sparkTitle: string;
  reason: string;
  confidence?: number;
}

export type LinkedInProspectEntityType = "person" | "company" | "discovery" | "unsupported";

export interface LinkedInProspectorStatus {
  isLinkedIn: boolean;
  entityType: LinkedInProspectEntityType;
  pageUrl: string;
  subjectName: string;
  visible: boolean;
}

export interface LinkedInRelatedPage {
  entityType: Extract<LinkedInProspectEntityType, "person" | "company">;
  name: string;
  url: string;
}

export interface LinkedInProspectData extends LinkedInProspectorStatus {
  relatedPages: LinkedInRelatedPage[];
  notes: string[];
}

export interface CreateLinkedInContactResponse {
  url: string;
  existing?: boolean;
  contactId?: string;
}

export type CreateLinkedInContactResult =
  | {
      ok: true;
      status: number;
      contact: CreateLinkedInContactResponse;
    }
  | {
      ok: false;
      status: number;
      errorText?: string;
    };

export interface SparkGroup {
  title: string;
  description?: string;
  sparks: Spark[];
}

export type SparkCache = Record<string, Spark>;

export interface FirestoreTimestamp {
  _seconds: number;
  _nanoseconds: number;
}

export interface Session {
  id: string;
  sparkId?: string;
  spark?: Spark;
  sparkTitle?: string;
  sparkIcon?: string;
  sparkColor?: string;
  content: string;
  image?: { url?: string };
  imageUrl?: string;
  sourceUrl?: string;
  createdAt: FirestoreTimestamp;
}

export interface SessionsPage {
  sessions: Session[];
  lastVisibleId?: string;
}

export interface SparkResult {
  id: string;
  content: string;
  page?: {
    url?: string;
    content?: string;
  };
  metadata?: Record<string, unknown>;
}

export type ChatMessageRole = "user" | "assistant" | "system";

export type ChatMessagePart =
  | { type: "text"; text: string }
  | { type: "file"; mediaType: string; url: string; filename?: string }
  | { type: "image"; image: string; mediaType?: string };

export interface ChatMessage {
  id?: string;
  role: ChatMessageRole;
  parts: ChatMessagePart[];
}

export interface ChatRequest {
  chatId?: string;
  messages: ChatMessage[];
  model?: string;
  isThinking?: boolean;
  isResearch?: boolean;
  brandId?: string;
  projectId?: string;
  personaId?: string;
  assistantId?: string;
  timestampString?: string;
}

export type MessageChunk =
  | { type: "start"; messageId?: string }
  | { type: "start-step" }
  | { type: "finish-step" }
  | { type: "finish"; finishReason?: string }
  | { type: "abort"; reason?: string }
  | { type: "error"; errorText: string }
  | { type: "text-start"; id: string }
  | { type: "text-delta"; id: string; delta: string }
  | { type: "text-end"; id: string }
  | { type: "reasoning-start"; id: string }
  | { type: "reasoning-delta"; id: string; delta: string }
  | { type: "reasoning-end"; id: string }
  | { type: "tool-input-start"; toolCallId: string; toolName: string }
  | { type: "tool-input-delta"; toolCallId: string; inputTextDelta: string }
  | { type: "tool-input-available"; toolCallId: string; toolName: string; input: unknown }
  | {
      type: "tool-input-error";
      toolCallId: string;
      toolName: string;
      input: unknown;
      errorText: string;
    }
  | { type: "tool-output-available"; toolCallId: string; output: unknown; preliminary?: boolean }
  | { type: "tool-output-error"; toolCallId: string; errorText: string }
  | { type: "source-url"; sourceId: string; url: string; title?: string }
  | {
      type: "source-document";
      sourceId: string;
      mediaType: string;
      title: string;
      filename?: string;
    }
  | { type: "file"; url: string; mediaType: string };

export interface ChatSource {
  sourceId: string;
  url: string;
  title?: string;
}

export interface ChatUiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
}

export interface ImageAnalysisResult {
  id: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface UploadUrlResponse {
  url: string;
  image: { url: string };
}

export type PageKey = "sparks" | "annotations" | "history" | "collections" | "settings";

export type CollectionItemType = "url" | "text" | "image" | "video";

export interface Collection {
  id: string;
  name: string;
  emoji?: string;
  createdAt: number;
  sharedWith?: string[];
}

export interface CollectionItem {
  id: string;
  collectionId: string;
  type: CollectionItemType;
  title: string;
  content: string;
  thumbnail?: string;
  sourceUrl: string;
  note?: string;
  createdAt: number;
}

export type DragImageSource = "browser" | "filesystem";
export type DragImageOrigin = "html" | "uri";

export interface DragImageResult {
  url: string;
  source: DragImageSource;
  origin?: DragImageOrigin;
  name?: string;
  mimeHint?: string;
  isDataUrl?: boolean;
  file?: File;
  objectUrl?: string;
  mime?: string;
}
