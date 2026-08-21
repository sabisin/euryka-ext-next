import {
  type AnnotationListParams,
  type AnnotationListResponse,
  listAnnotations,
} from "./annotations-api";
import { decodeJwt } from "./auth";
import { buildAnnotationCacheKey, isAnnotationCacheFresh } from "./annotation-cache-policy";
import { annotationCacheStorage } from "./storage";

const inFlightRequests = new Map<string, Promise<AnnotationListResponse>>();
let cacheRevision = 0;
let storageWriteQueue = Promise.resolve();

function updateStoredCache(
  updater: (
    current: Awaited<ReturnType<typeof annotationCacheStorage.getValue>>
  ) => Awaited<ReturnType<typeof annotationCacheStorage.getValue>>
): Promise<void> {
  const write = storageWriteQueue.then(async () => {
    const current = await annotationCacheStorage.getValue();
    await annotationCacheStorage.setValue(updater(current));
  });
  storageWriteQueue = write.catch(() => {});
  return write;
}

function getTokenUserKey(token: string): string | null {
  const payload = decodeJwt(token);
  const identity = payload.sub ?? payload.user_id ?? payload.email;
  return typeof identity === "string" && identity ? identity : null;
}

export async function listAnnotationsWithCache(
  token: string,
  params: AnnotationListParams = {}
): Promise<AnnotationListResponse> {
  const userKey = getTokenUserKey(token);
  if (!userKey) return listAnnotations(token, params);

  const cacheKey = buildAnnotationCacheKey(userKey, params);
  const stored = await annotationCacheStorage.getValue();
  const cached = stored[cacheKey];
  if (cached && isAnnotationCacheFresh(cached.fetchedAt)) return cached.response;

  const inFlight = inFlightRequests.get(cacheKey);
  if (inFlight) return inFlight;

  const revisionAtStart = cacheRevision;
  const request = listAnnotations(token, params)
    .then(async (response) => {
      if (revisionAtStart !== cacheRevision) return response;
      await updateStoredCache((current) => {
        const freshEntries = Object.entries(current).filter(([, entry]) =>
          isAnnotationCacheFresh(entry.fetchedAt)
        );
        return {
          ...Object.fromEntries(freshEntries),
          [cacheKey]: { userKey, fetchedAt: Date.now(), response },
        };
      });
      return response;
    })
    .finally(() => {
      inFlightRequests.delete(cacheKey);
    });

  inFlightRequests.set(cacheKey, request);
  return request;
}

export async function invalidateAnnotationCacheForToken(token: string): Promise<void> {
  cacheRevision += 1;
  const userKey = getTokenUserKey(token);
  if (!userKey) {
    await clearAnnotationCache();
    return;
  }

  await updateStoredCache((current) =>
    Object.fromEntries(Object.entries(current).filter(([, entry]) => entry.userKey !== userKey))
  );
}

export async function clearAnnotationCache(): Promise<void> {
  cacheRevision += 1;
  inFlightRequests.clear();
  await updateStoredCache(() => ({}));
}
