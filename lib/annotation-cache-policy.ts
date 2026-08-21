import type { AnnotationListParams } from "./annotations-api";

export const ANNOTATION_CACHE_TTL_MS = 60_000;

export function buildAnnotationCacheKey(
  userKey: string,
  params: AnnotationListParams
): string {
  return JSON.stringify([
    userKey,
    params.targetUrl ?? null,
    params.limit ?? null,
    params.cursor ?? null,
  ]);
}

export function isAnnotationCacheFresh(
  fetchedAt: number,
  now = Date.now(),
  ttlMs = ANNOTATION_CACHE_TTL_MS
): boolean {
  return fetchedAt > 0 && now - fetchedAt < ttlMs;
}
