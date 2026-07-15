import { describe, expect, test } from "bun:test";
import { selectSparkRecommendationCandidates } from "./spark-candidate-search.ts";

const catalog = [
  {
    id: "brand-research",
    title: "Brand Research",
    description: "Research a brand, its market, positioning, and competitors.",
    groups: ["Marketing"],
  },
  {
    id: "video-script",
    title: "Video Script",
    description: "Create an engaging script for a marketing video.",
    groups: ["Content"],
  },
  {
    id: "meeting-notes",
    title: "Meeting Notes",
    description: "Summarize a meeting into decisions and action items.",
    groups: ["Productivity"],
  },
];

describe("Spark candidate search", () => {
  test("ranks title and description token matches before unrelated sparks", () => {
    const result = selectSparkRecommendationCandidates("I want to research a brand", catalog);

    expect(result.matched).toBe(true);
    expect(result.candidates[0].id).toBe("brand-research");
    expect(result.candidates.some((spark) => spark.id === "video-script")).toBe(false);
  });

  test("normalizes simple plural and inflected forms", () => {
    const result = selectSparkRecommendationCandidates("researching brands", catalog);

    expect(result.candidates[0].id).toBe("brand-research");
  });

  test("falls back to the complete catalog when no lexical terms match", () => {
    const result = selectSparkRecommendationCandidates("quantum entanglement", catalog);

    expect(result.matched).toBe(false);
    expect(result.candidates).toEqual(catalog);
  });
});
