import type { SparkCatalogItem } from "./spark-catalog";
import { buildSparkCatalogText } from "./spark-catalog";
import type { Spark, SparkRecommendation } from "./types";

export interface SparkRecommendationResult {
  recommendation: SparkRecommendation;
  spark: Spark;
  rawText: string;
}

export function buildSparkRecommendationUserPrompt(
  userIntent: string,
  sparks: SparkCatalogItem[]
): string {
  const catalogText = buildSparkCatalogText(sparks);
  return [
    "You are recommending one Euryka spark for the user's intent.",
    "Choose exactly one spark from the provided catalog.",
    "Return strict JSON only. Do not include markdown, commentary, or extra keys.",
    'The JSON shape is: {"sparkId":"...","sparkTitle":"...","reason":"...","confidence":0.0}',
    "Use sparkId as the authoritative identifier.",
    "",
    `User intent:\n${userIntent}`,
    "",
    `Spark catalog:\n${catalogText}`,
  ].join("\n");
}

export function resolveSparkRecommendation(
  responseText: string,
  sparks: Spark[]
): SparkRecommendationResult | null {
  const parsed = parseJsonObject(responseText);
  if (!parsed) return null;

  const sparkId = readString(parsed.sparkId);
  const sparkTitle = readString(parsed.sparkTitle);
  const normalizedTitle = normalizeSparkName(sparkTitle);
  const spark =
    (sparkId ? sparks.find((item) => item.id === sparkId) : undefined) ??
    (normalizedTitle
      ? sparks.find((item) => normalizeSparkName(item.title) === normalizedTitle)
      : undefined);

  if (!spark) return null;

  const reason = readString(parsed.reason) || "This spark best matches the request you described.";
  const confidence = readConfidence(parsed.confidence);

  return {
    spark,
    rawText: responseText,
    recommendation: {
      sparkId: spark.id,
      sparkTitle: spark.title,
      reason,
      ...(confidence !== undefined ? { confidence } : {}),
    },
  };
}

export function buildSparkRecommendationAssistantMessage(
  result: SparkRecommendationResult
): string {
  return `I recommend **${result.spark.title}**.\n\n${result.recommendation.reason}`;
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidate = fenced ?? trimmed.slice(trimmed.indexOf("{"), trimmed.lastIndexOf("}") + 1);
  if (!candidate || !candidate.startsWith("{") || !candidate.endsWith("}")) return null;

  try {
    const parsed: unknown = JSON.parse(candidate);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readConfidence(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  if (value >= 0 && value <= 1) return value;
  if (value > 1 && value <= 100) return value / 100;
  return undefined;
}

function normalizeSparkName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}
