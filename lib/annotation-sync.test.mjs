import { describe, expect, test } from "bun:test";
import { isSameAnnotationTarget, upsertAnnotationById } from "./annotation-sync.ts";

describe("annotation tab targeting", () => {
  test("matches only the complete annotation URL", () => {
    const target = "https://example.com/article?id=7#section";

    expect(isSameAnnotationTarget(target, target)).toBe(true);
    expect(isSameAnnotationTarget("https://example.com/article?id=7", target)).toBe(false);
    expect(isSameAnnotationTarget("https://example.com/article?id=8#section", target)).toBe(false);
    expect(isSameAnnotationTarget("https://other.example/article?id=7#section", target)).toBe(
      false
    );
  });

  test("handles encoded and missing tab URLs safely", () => {
    expect(
      isSameAnnotationTarget("https://example.com/a%20page", "https://example.com/a%20page")
    ).toBe(true);
    expect(isSameAnnotationTarget(undefined, "https://example.com")).toBe(false);
  });
});

describe("annotation state synchronization", () => {
  const broadcastAnnotation = { id: "annotation-1", note: null };
  const responseAnnotation = { id: "annotation-1", note: "Saved note" };

  test("does not duplicate a create delivered by broadcast before its response", () => {
    const afterBroadcast = upsertAnnotationById([], broadcastAnnotation);
    const afterResponse = upsertAnnotationById(afterBroadcast, responseAnnotation);

    expect(afterResponse).toEqual([responseAnnotation]);
  });

  test("does not duplicate a create delivered by response before its broadcast", () => {
    const afterResponse = upsertAnnotationById([], responseAnnotation);
    const afterBroadcast = upsertAnnotationById(afterResponse, broadcastAnnotation);

    expect(afterBroadcast).toEqual([broadcastAnnotation]);
  });

  test("collapses duplicate state left by an earlier synchronization race", () => {
    const repaired = upsertAnnotationById(
      [broadcastAnnotation, broadcastAnnotation],
      responseAnnotation
    );

    expect(repaired).toEqual([responseAnnotation]);
  });
});
