import { debugLog } from "./debug";

const BASE_URL = import.meta.env.WXT_BASE_URL as string;
const ANNOTATIONS_PATH = "/api/v1/extension/annotations";
const LOG_PREFIX = "[Euryka annotations API]";
const log = debugLog(LOG_PREFIX);
const inFlightListRequests = new Map<string, Promise<AnnotationListResponse>>();

export interface AnnotationSelector {
  x: number;
  y: number;
  textParentXPath?: string | null;
  textNodeIndex?: number | null;
  textOffset?: number | null;
  containerId?: string | null;
  containerXPath?: string | null;
  relX?: number | null;
  relY?: number | null;
}

export interface FirestoreTimestamp {
  _seconds: number;
  _nanoseconds: number;
}

export interface Annotation {
  id: string;
  targetUrl: string;
  targetTitle?: string;
  selectedText?: string;
  note?: string;
  color?: string;
  selector: AnnotationSelector;
  positionStart?: number;
  positionEnd?: number;
  createdBy: string;
  updatedBy: string;
  createdAt: FirestoreTimestamp;
  updatedAt: FirestoreTimestamp;
}

export interface AnnotationListParams {
  targetUrl?: string;
  limit?: number;
  cursor?: string;
}

export interface AnnotationListResponse {
  annotations: Annotation[];
  nextCursor?: string | null;
}

export interface AnnotationCreateInput {
  targetUrl: string;
  targetTitle?: string;
  selectedText?: string;
  note?: string;
  color?: string;
  selector: AnnotationSelector;
  positionStart?: number;
  positionEnd?: number;
}

export interface AnnotationCreateResponse {
  annotation: Annotation;
}

export type AnnotationGetResponse = AnnotationCreateResponse;

export interface AnnotationUpdateInput {
  targetUrl?: string;
  targetTitle?: string | null;
  selectedText?: string | null;
  note?: string | null;
  color?: string | null;
  selector?: AnnotationSelector;
  positionStart?: number | null;
  positionEnd?: number | null;
}

export type AnnotationUpdateResponse = AnnotationCreateResponse;

type RequestLogContext = {
  operation: string;
  id?: string;
  params?: AnnotationListParams;
  payload?: AnnotationCreateInput | AnnotationUpdateInput;
};

function summarizePayload(
  payload?: AnnotationCreateInput | AnnotationUpdateInput,
) {
  if (!payload) return undefined;

  return {
    targetUrl: "targetUrl" in payload ? payload.targetUrl : undefined,
    targetTitle: "targetTitle" in payload ? payload.targetTitle : undefined,
    hasSelectedText: Boolean(payload.selectedText),
    selectedTextLength: payload.selectedText?.length,
    hasNote: Boolean(payload.note),
    noteLength: typeof payload.note === "string" ? payload.note.length : undefined,
    color: payload.color,
    hasSelector: Boolean(payload.selector),
    selector: payload.selector
      ? {
          x: payload.selector.x,
          y: payload.selector.y,
          hasTextAnchor: Boolean(payload.selector.textParentXPath),
          hasContainerAnchor: Boolean(
            payload.selector.containerId || payload.selector.containerXPath,
          ),
        }
      : undefined,
    positionStart: payload.positionStart,
    positionEnd: payload.positionEnd,
  };
}

async function readErrorPreview(res: Response): Promise<unknown> {
  try {
    const contentType = res.headers.get("content-type") ?? "";
    const clone = res.clone();
    if (contentType.includes("application/json")) return await clone.json();
    return await clone.text();
  } catch (error) {
    return { message: "Failed to read error response body", error };
  }
}

function summarizeResponse(data: unknown) {
  if (!data || typeof data !== "object") return undefined;
  const response = data as Record<string, unknown>;

  if (Array.isArray(response.annotations)) {
    return {
      annotationCount: response.annotations.length,
      nextCursor: response.nextCursor,
    };
  }

  if (response.annotation && typeof response.annotation === "object") {
    const annotation = response.annotation as Partial<Annotation>;
    return {
      annotationId: annotation.id,
      targetUrl: annotation.targetUrl,
      updatedAt: annotation.updatedAt,
    };
  }

  return undefined;
}

async function request<T>(
  token: string,
  url: string | URL,
  options: RequestInit,
  logContext: RequestLogContext,
): Promise<T> {
  const method = options.method ?? "GET";
  const requestUrl = typeof url === "string" ? `${BASE_URL}${url}` : url;
  const startedAt = Date.now();

  log("request started", {
    operation: logContext.operation,
    method,
    url: String(requestUrl),
    id: logContext.id,
    params: logContext.params,
    payload: summarizePayload(logContext.payload),
  });

  const res = await fetch(requestUrl, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!res.ok) {
    console.error(`${LOG_PREFIX} request failed`, {
      operation: logContext.operation,
      method,
      url: String(requestUrl),
      status: res.status,
      statusText: res.statusText,
      elapsedMs: Date.now() - startedAt,
      error: await readErrorPreview(res),
    });
    throw res;
  }

  const contentType = res.headers.get("content-type") ?? "";
  const data = contentType.includes("application/json")
    ? ((await res.json()) as T)
    : (undefined as T);
  log("request succeeded", {
    operation: logContext.operation,
    method,
    url: String(requestUrl),
    status: res.status,
    elapsedMs: Date.now() - startedAt,
    response: summarizeResponse(data),
  });

  return data;
}

export async function listAnnotations(
  token: string,
  params: AnnotationListParams = {},
): Promise<AnnotationListResponse> {
  const url = new URL(`${BASE_URL}${ANNOTATIONS_PATH}`);
  if (params.targetUrl) url.searchParams.set("targetUrl", params.targetUrl);
  if (params.limit !== undefined) url.searchParams.set("limit", String(params.limit));
  if (params.cursor) url.searchParams.set("cursor", params.cursor);

  const cacheKey = String(url);
  const inFlight = inFlightListRequests.get(cacheKey);
  if (inFlight) return inFlight;

  const promise = request<AnnotationListResponse>(
    token,
    url,
    {},
    { operation: "listAnnotations", params },
  ).finally(() => {
    inFlightListRequests.delete(cacheKey);
  });
  inFlightListRequests.set(cacheKey, promise);
  return promise;
}

export async function createAnnotation(
  token: string,
  payload: AnnotationCreateInput,
): Promise<AnnotationCreateResponse> {
  return request<AnnotationCreateResponse>(
    token,
    ANNOTATIONS_PATH,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    { operation: "createAnnotation", payload },
  );
}

export async function getAnnotation(
  token: string,
  id: string,
): Promise<AnnotationGetResponse> {
  return request<AnnotationGetResponse>(
    token,
    `${ANNOTATIONS_PATH}/${encodeURIComponent(id)}`,
    {},
    { operation: "getAnnotation", id },
  );
}

export async function updateAnnotation(
  token: string,
  id: string,
  payload: AnnotationUpdateInput,
): Promise<AnnotationUpdateResponse> {
  return request<AnnotationUpdateResponse>(
    token,
    `${ANNOTATIONS_PATH}/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    { operation: "updateAnnotation", id, payload },
  );
}

export async function deleteAnnotation(
  token: string,
  id: string,
): Promise<void> {
  await request<unknown>(
    token,
    `${ANNOTATIONS_PATH}/${encodeURIComponent(id)}`,
    { method: "DELETE" },
    { operation: "deleteAnnotation", id },
  );
}

export function firestoreTimestampToMs(timestamp: FirestoreTimestamp): number {
  return timestamp._seconds * 1000 + Math.floor(timestamp._nanoseconds / 1_000_000);
}
