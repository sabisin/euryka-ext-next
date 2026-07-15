import { describe, expect, test } from "bun:test";
import {
  buildSparkCatalog,
  buildSparkCatalogText,
  summarizeSparkCatalog,
} from "./spark-catalog.ts";
import {
  buildSparkRecommendationAssistantMessage,
  buildSparkRecommendationUserPrompt,
  resolveSparkRecommendation,
} from "./spark-recommendation.ts";

const sparks = [
  { id: "summary", title: "Page Summary", description: "Summarize a page" },
  { id: "rewrite", title: "Rewrite", description: "Rewrite selected text" },
];

describe("Spark catalog", () => {
  test("deduplicates sparks and merges their group names", () => {
    const groups = [
      { title: "Writing", sparks: [sparks[1]] },
      { title: "Popular", sparks: [sparks[0], sparks[1]] },
    ];

    const catalog = buildSparkCatalog(groups);

    expect(catalog).toHaveLength(2);
    expect(catalog.find((item) => item.id === "rewrite")?.groups).toEqual(["Writing", "Popular"]);
    expect(summarizeSparkCatalog(groups, catalog)).toMatchObject({
      groupCount: 2,
      sparkCount: 3,
      uniqueSparkCount: 2,
    });
  });

  test("normalizes whitespace in catalog prompt text", () => {
    const text = buildSparkCatalogText([
      { id: "one", title: "A  useful\nSpark", description: "Do   work", groups: ["Tools"] },
    ]);

    expect(text).toContain("title=A useful Spark");
    expect(text).toContain("desc=Do work");
  });
});

describe("Spark recommendation", () => {
  test("builds a prompt containing the authoritative spark IDs", () => {
    const prompt = buildSparkRecommendationUserPrompt(
      "Summarize this",
      buildSparkCatalog([{ title: "Popular", sparks }])
    );

    expect(prompt).toContain("User intent:\nSummarize this");
    expect(prompt).toContain("id=summary");
    expect(prompt).toContain("id=rewrite");
    expect(prompt).toContain("Use 1.0 for a direct title-and-intent match");
    expect(prompt).not.toContain('"confidence":0.0');
  });

  test("parses fenced JSON and normalizes percentage confidence", () => {
    const result = resolveSparkRecommendation(
      '```json\n{"sparkId":"summary","reason":"Best match","confidence":80}\n```',
      sparks
    );

    expect(result?.recommendation).toEqual({
      sparkId: "summary",
      sparkTitle: "Page Summary",
      reason: "Best match",
      confidence: 0.8,
    });
    expect(buildSparkRecommendationAssistantMessage(result)).toBe(
      "I recommend **Page Summary**.\n\nBest match"
    );
  });

  test("falls back to normalized title matching and rejects unknown sparks", () => {
    expect(
      resolveSparkRecommendation('{"sparkTitle":"  PAGE summary  ","reason":"Match"}', sparks)
        ?.spark.id
    ).toBe("summary");
    expect(resolveSparkRecommendation('{"sparkId":"missing"}', sparks)).toBeNull();
    expect(resolveSparkRecommendation("not json", sparks)).toBeNull();
  });
});
