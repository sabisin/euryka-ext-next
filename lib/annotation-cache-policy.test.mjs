import { describe, expect, test } from "bun:test";
import {
  ANNOTATION_CACHE_TTL_MS,
  buildAnnotationCacheKey,
  isAnnotationCacheFresh,
} from "./annotation-cache-policy.ts";

describe("annotation cache policy", () => {
  test("isolates users, exact URLs, views, and pagination cursors", () => {
    const base = buildAnnotationCacheKey("user-1", {
      targetUrl: "https://example.com/article?id=7#notes",
      limit: 50,
    });

    expect(
      buildAnnotationCacheKey("user-1", {
        targetUrl: "https://example.com/article?id=7#notes",
        limit: 50,
      })
    ).toBe(base);
    expect(
      buildAnnotationCacheKey("user-2", {
        targetUrl: "https://example.com/article?id=7#notes",
        limit: 50,
      })
    ).not.toBe(base);
    expect(
      buildAnnotationCacheKey("user-1", {
        targetUrl: "https://example.com/article?id=7",
        limit: 50,
      })
    ).not.toBe(base);
    expect(buildAnnotationCacheKey("user-1", { limit: 50 })).not.toBe(base);
    expect(
      buildAnnotationCacheKey("user-1", {
        targetUrl: "https://example.com/article?id=7#notes",
        limit: 50,
        cursor: "next-page",
      })
    ).not.toBe(base);
  });

  test("expires entries at the configured freshness boundary", () => {
    const now = 1_000_000;
    expect(isAnnotationCacheFresh(now - ANNOTATION_CACHE_TTL_MS + 1, now)).toBe(true);
    expect(isAnnotationCacheFresh(now - ANNOTATION_CACHE_TTL_MS, now)).toBe(false);
    expect(isAnnotationCacheFresh(0, now)).toBe(false);
  });
});
