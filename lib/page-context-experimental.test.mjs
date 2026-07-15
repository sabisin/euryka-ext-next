import { describe, expect, test } from "bun:test";
import { compactPageContentAdaptive } from "./page-context-experimental.ts";
import { compactPageContentV2, serializePageBlocks } from "./page-context.ts";

function paragraph(text, documentIndex, headingPath = []) {
  return { type: "paragraph", text, headingPath, documentIndex };
}

describe("compactPageContentAdaptive", () => {
  test("uses the structural-core strategy for generic requests", () => {
    const blocks = [
      { type: "title", text: "Long guide", headingPath: [], documentIndex: 0 },
      paragraph(`Introduction. ${"overview detail. ".repeat(60)}`, 1),
      paragraph(`Late section. ${"late detail. ".repeat(60)}`, 2, ["Late section"]),
    ];
    const text = serializePageBlocks(blocks);

    expect(compactPageContentAdaptive(blocks, text, "Summarize this page", 700)).toEqual(
      compactPageContentV2(blocks, text, "Summarize this page", 700)
    );
  });

  test("retrieves camelCase configuration values at a tight budget", () => {
    const blocks = [
      { type: "title", text: "Worker guide", headingPath: [], documentIndex: 0 },
      paragraph(`Introduction. ${"architecture detail. ".repeat(90)}`, 1, ["Introduction"]),
      paragraph(
        `Set retryBackoffMs to 2500 and maxRetryAttempts to 6. ${"retry configuration detail. ".repeat(35)}`,
        2,
        ["Failure recovery", "Retries"]
      ),
      paragraph(`REFERENCE_MARKER ${"citation. ".repeat(100)}`, 3, ["References"]),
    ];
    const text = serializePageBlocks(blocks);

    const result = compactPageContentAdaptive(
      blocks,
      text,
      "What retry backoff and maximum attempts should I configure?",
      700
    );

    expect(result.text).toContain("retryBackoffMs to 2500");
    expect(result.text).toContain("maxRetryAttempts to 6");
    expect(result.text).not.toContain("REFERENCE_MARKER");
    expect(result.text.length).toBeLessThanOrEqual(700);
  });

  test("matches inflected query terms against unstructured content", () => {
    const blocks = [
      paragraph(`Opening. ${"background detail. ".repeat(90)}`, 0),
      paragraph(
        `The incident cause was connection pool exhaustion. Mitigation increased the pool to 60. ${"database detail. ".repeat(30)}`,
        1
      ),
    ];
    const text = serializePageBlocks(blocks);

    const result = compactPageContentAdaptive(
      blocks,
      text,
      "What caused the incident and how was it mitigated?",
      700
    );

    expect(result.text).toContain("connection pool exhaustion");
    expect(result.text).toContain("increased the pool to 60");
  });
});
