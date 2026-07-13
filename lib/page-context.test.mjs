import { describe, expect, test } from "bun:test";
import {
  compactPageContent,
  compactPageContentV2,
  serializePageBlocks,
} from "./page-context.ts";

function block(text, documentIndex, headingPath = []) {
  return { type: "paragraph", text, headingPath, documentIndex };
}

describe("compactPageContent", () => {
  test("keeps a relevant section from the middle of a long page", () => {
    const blocks = [
      { type: "title", text: "Subscription policy", headingPath: [], documentIndex: 0 },
      block("Introduction " + "background information ".repeat(18), 1, ["Introduction"]),
      block("Plans " + "plan description ".repeat(20), 2, ["Plans"]),
      block(
        "Cancellation requests receive a full refund when submitted within 45 days.",
        3,
        ["Terms", "Cancellation"]
      ),
      block("Examples " + "unrelated example ".repeat(20), 4, ["Examples"]),
      block("Conclusion: contact support if any policy detail remains unclear.", 5, ["Conclusion"]),
    ];
    const fullText = serializePageBlocks(blocks);

    const result = compactPageContent(
      blocks,
      fullText,
      "How long is the cancellation refund window?",
      700
    );

    expect(result.compacted).toBe(true);
    expect(result.text.length).toBeLessThanOrEqual(700);
    expect(result.text).toContain("Cancellation requests receive a full refund");
    expect(result.text).toContain("Subscription policy");
    expect(result.text).toContain("Conclusion");
  });

  test("uses document coverage for a generic summary request", () => {
    const blocks = Array.from({ length: 9 }, (_, index) =>
      block(`Section ${index}: ${`detail-${index} `.repeat(25)}`, index, [`Section ${index}`])
    );
    const fullText = serializePageBlocks(blocks);

    const result = compactPageContent(blocks, fullText, "Summarize this page", 750);

    expect(result.text).toContain("Section 0");
    expect(result.text).toContain("Section 8");
    expect(result.selectedChunkCount).toBeGreaterThan(2);
  });

  test("does not rewrite content already within the budget", () => {
    const blocks = [block("Short page text.", 0)];
    const result = compactPageContent(blocks, "Short page text.", "What is this?", 500);

    expect(result).toMatchObject({ text: "Short page text.", compacted: false });
  });
});

describe("compactPageContentV2", () => {
  test("combines a structural page core with prompt-relevant detail", () => {
    const blocks = [
      { type: "title", text: "Martial arts guide", headingPath: [], documentIndex: 0 },
      block("A broad introduction explaining the subject. " + "overview ".repeat(30), 1),
      block("Origins and early development. " + "history ".repeat(30), 2, ["Origins"]),
      block("Cultural importance and traditions. " + "culture ".repeat(30), 3, ["Culture"]),
      block(
        "Competition rules prohibit unsafe strikes and define scoring.",
        4,
        ["Competition rules"]
      ),
      block("Modern international practice. " + "modern practice ".repeat(30), 5, ["Modern era"]),
      block("citation-only-marker " + "citation ".repeat(40), 6, ["References"]),
    ];
    const fullText = serializePageBlocks(blocks);

    const result = compactPageContentV2(
      blocks,
      fullText,
      "What are the competition rules?",
      1_000
    );

    expect(result.compacted).toBe(true);
    expect(result.text).toContain("Martial arts guide");
    expect(result.text).toContain("broad introduction");
    expect(result.text).toContain("Competition rules prohibit unsafe strikes");
    expect(result.text).not.toContain("citation-only-marker");
  });

  test("uses the structural core for a generic request", () => {
    const blocks = [
      { type: "title", text: "Long report", headingPath: [], documentIndex: 0 },
      block("Executive introduction. " + "overview ".repeat(35), 1),
      ...Array.from({ length: 7 }, (_, index) =>
        block(
          `Core section ${index}. ${`section-${index} `.repeat(30)}`,
          index + 2,
          [`Core section ${index}`]
        )
      ),
      block("reference-marker " + "reference ".repeat(40), 9, ["References"]),
    ];
    const fullText = serializePageBlocks(blocks);

    const result = compactPageContentV2(blocks, fullText, "Summarize this page", 1_000);

    expect(result.text).toContain("Long report");
    expect(result.text).toContain("Executive introduction");
    expect(result.text).not.toContain("reference-marker");
  });
});
