import type { SparkCatalogItem } from "./spark-catalog";

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "can",
  "do",
  "for",
  "from",
  "i",
  "in",
  "is",
  "it",
  "me",
  "my",
  "of",
  "on",
  "or",
  "please",
  "the",
  "to",
  "want",
  "with",
]);

const FIELD_WEIGHTS = {
  title: 6,
  description: 3,
  groups: 2,
} as const;

export interface SparkCandidateSearchResult {
  candidates: SparkCatalogItem[];
  matched: boolean;
  queryTokens: string[];
  scores: Array<{ id: string; score: number }>;
  elapsedMs: number;
}

export function selectSparkRecommendationCandidates(
  userIntent: string,
  catalog: SparkCatalogItem[],
  maxCandidates = 12
): SparkCandidateSearchResult {
  const startedAt = performance.now();
  const queryTokens = tokenize(userIntent);
  if (queryTokens.length === 0 || catalog.length === 0) {
    return fallback(catalog, queryTokens, startedAt);
  }

  const postings = buildInvertedIndex(catalog);
  const scores = new Map<number, number>();

  for (const token of queryTokens) {
    const matches = postings.get(token);
    if (!matches) continue;

    const rarityBoost = 1 + Math.log(catalog.length / matches.size);
    for (const [catalogIndex, fieldWeight] of matches) {
      scores.set(catalogIndex, (scores.get(catalogIndex) ?? 0) + fieldWeight * rarityBoost);
    }
  }

  if (scores.size === 0) return fallback(catalog, queryTokens, startedAt);

  const ranked = [...scores.entries()].sort(
    ([leftIndex, leftScore], [rightIndex, rightScore]) =>
      rightScore - leftScore || catalog[leftIndex].title.localeCompare(catalog[rightIndex].title)
  );
  const topScore = ranked[0][1];
  const relevant = ranked
    .filter(([, score]) => score >= topScore * 0.35)
    .slice(0, Math.max(1, maxCandidates));

  return {
    candidates: relevant.map(([index]) => catalog[index]),
    matched: true,
    queryTokens,
    scores: relevant.map(([index, score]) => ({ id: catalog[index].id, score })),
    elapsedMs: performance.now() - startedAt,
  };
}

function buildInvertedIndex(catalog: SparkCatalogItem[]) {
  const postings = new Map<string, Map<number, number>>();

  for (const [catalogIndex, spark] of catalog.entries()) {
    addField(postings, catalogIndex, spark.title, FIELD_WEIGHTS.title);
    addField(postings, catalogIndex, spark.description, FIELD_WEIGHTS.description);
    addField(postings, catalogIndex, spark.groups.join(" "), FIELD_WEIGHTS.groups);
  }

  return postings;
}

function addField(
  postings: Map<string, Map<number, number>>,
  catalogIndex: number,
  value: string,
  weight: number
) {
  for (const token of tokenize(value)) {
    const matches = postings.get(token) ?? new Map<number, number>();
    matches.set(catalogIndex, Math.max(matches.get(catalogIndex) ?? 0, weight));
    postings.set(token, matches);
  }
}

function tokenize(value: string): string[] {
  const normalized = value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
  const tokens = normalized.match(/[a-z0-9]+/g) ?? [];
  return [
    ...new Set(tokens.map(stemToken).filter((token) => token.length > 1 && !STOP_WORDS.has(token))),
  ];
}

function stemToken(token: string): string {
  if (token.length > 6 && token.endsWith("ing")) return token.slice(0, -3);
  if (token.length > 5 && token.endsWith("ied")) return `${token.slice(0, -3)}y`;
  if (token.length > 5 && token.endsWith("ed")) return token.slice(0, -2);
  if (token.length > 4 && token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (
    token.length > 4 &&
    token.endsWith("s") &&
    !token.endsWith("ss") &&
    !token.endsWith("is") &&
    !token.endsWith("us")
  ) {
    return token.slice(0, -1);
  }
  return token;
}

function fallback(
  catalog: SparkCatalogItem[],
  queryTokens: string[],
  startedAt: number
): SparkCandidateSearchResult {
  return {
    candidates: catalog,
    matched: false,
    queryTokens,
    scores: [],
    elapsedMs: performance.now() - startedAt,
  };
}
