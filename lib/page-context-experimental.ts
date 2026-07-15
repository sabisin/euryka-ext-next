import {
  type CompactedPageContent,
  type PageContentBlock,
  compactPageContentV2,
} from "./page-context";

interface ExperimentalChunk {
  text: string;
  heading: string;
  section: string;
  documentIndex: number;
  type: PageContentBlock["type"];
  tokens: string[];
}

const GENERIC_TERMS = new Set([
  "article",
  "content",
  "explain",
  "key",
  "main",
  "overview",
  "page",
  "point",
  "points",
  "summarise",
  "summarize",
  "summary",
  "this",
  "tldr",
  "what",
]);

const STOP_TERMS = new Set([
  "about",
  "and",
  "are",
  "for",
  "from",
  "how",
  "into",
  "that",
  "the",
  "their",
  "there",
  "they",
  "was",
  "were",
  "when",
  "where",
  "which",
  "with",
  "would",
  "you",
  "your",
]);

const LOW_VALUE_SECTIONS = new Set([
  "bibliography",
  "external links",
  "notes",
  "references",
  "referencias",
  "referências",
  "sources",
]);

/**
 * Experimental adaptive hybrid:
 * - keeps a small structural anchor;
 * - uses IDF-weighted lexical retrieval for specific questions;
 * - reserves remaining budget for section diversity using a greedy MMR-style score;
 * - penalizes reference/bibliography sections.
 */
export function compactPageContentAdaptive(
  blocks: PageContentBlock[],
  fallbackText: string,
  query: string,
  charLimit: number
): CompactedPageContent {
  const originalCharCount = fallbackText.length;
  if (fallbackText.length <= charLimit) {
    return {
      text: fallbackText,
      compacted: false,
      selectedChunkCount: blocks.length,
      totalChunkCount: blocks.length,
      originalCharCount,
    };
  }

  const sourceBlocks = blocks.length > 0 ? blocks : fallbackBlocks(fallbackText);
  const queryTerms = unique(
    tokenize(query).filter((term) => !STOP_TERMS.has(term) && !GENERIC_TERMS.has(term))
  );
  if (queryTerms.length === 0) {
    return compactPageContentV2(blocks, fallbackText, query, charLimit);
  }

  const targetSize = Math.min(900, Math.max(140, Math.floor(charLimit / 7)));
  const chunks = buildChunks(sourceBlocks, targetSize);
  if (chunks.length === 0) {
    return {
      text: fallbackText.slice(0, charLimit),
      compacted: true,
      selectedChunkCount: 1,
      totalChunkCount: 1,
      originalCharCount,
    };
  }

  const relevance = scoreRelevance(chunks, queryTerms);
  const selected = new Set<number>();

  const titleIndex = chunks.findIndex((chunk) => chunk.type === "title");
  addIfFits(chunks, selected, titleIndex >= 0 ? titleIndex : 0, charLimit);

  const relevanceBudget = Math.floor(charLimit * 0.72);
  const relevantOrder = relevance
    .map((score, index) => ({ index, score }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index);

  for (const candidate of relevantOrder) {
    if (renderSelection(chunks, selected).length >= relevanceBudget) break;
    addIfFits(chunks, selected, candidate.index, relevanceBudget);
  }

  const strongest = relevantOrder[0]?.index;
  if (strongest !== undefined) {
    addIfFits(chunks, selected, strongest - 1, Math.floor(charLimit * 0.86));
    addIfFits(chunks, selected, strongest + 1, Math.floor(charLimit * 0.86));
  }

  while (true) {
    const candidate = selectDiverseCandidate(chunks, selected, relevance, true, charLimit);
    if (candidate < 0) break;
    selected.add(candidate);
  }

  if (selected.size === 0) selected.add(0);
  let text = renderSelection(chunks, selected);
  if (text.length > charLimit) text = text.slice(0, charLimit);

  return {
    text,
    compacted: true,
    selectedChunkCount: selected.size,
    totalChunkCount: chunks.length,
    originalCharCount,
  };
}

function scoreRelevance(chunks: ExperimentalChunk[], queryTerms: string[]): number[] {
  if (queryTerms.length === 0) return chunks.map(() => 0);
  const documentFrequency = new Map<string, number>();
  for (const term of queryTerms) {
    documentFrequency.set(term, chunks.filter((chunk) => chunk.tokens.includes(term)).length);
  }

  return chunks.map((chunk) => {
    const headingTokens = new Set(tokenize(chunk.heading));
    let score = 0;
    for (const term of queryTerms) {
      const occurrences = chunk.tokens.filter((token) => token === term).length;
      if (occurrences === 0) continue;
      const frequency = documentFrequency.get(term) ?? chunks.length;
      const idf = 1 + Math.log((chunks.length + 1) / (frequency + 1));
      if (headingTokens.has(term)) score += 5 * idf;
      score += Math.min(2, occurrences) * idf;
    }
    return score;
  });
}

function selectDiverseCandidate(
  chunks: ExperimentalChunk[],
  selected: Set<number>,
  relevance: number[],
  targeted: boolean,
  budget: number
): number {
  const selectedSections = new Set([...selected].map((index) => chunks[index].section));
  let bestIndex = -1;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const [index, chunk] of chunks.entries()) {
    if (selected.has(index)) continue;
    const candidateSelection = new Set(selected);
    candidateSelection.add(index);
    if (renderSelection(chunks, candidateSelection).length > budget) continue;
    const normalizedSection = normalize(chunk.section);
    const lowValuePenalty = LOW_VALUE_SECTIONS.has(normalizedSection) ? 12 : 0;
    const sectionNovelty = selectedSections.has(chunk.section) ? 0 : 5;
    const structuralValue =
      chunk.type === "title" ? 8 : chunk.type === "heading" ? 4 : index <= 1 ? 3 : 0;
    const distance =
      selected.size === 0
        ? 1
        : Math.min(...[...selected].map((selectedIndex) => Math.abs(index - selectedIndex))) /
          chunks.length;
    const relevanceValue = targeted ? relevance[index] * 2.5 : 0;
    const lengthPenalty = Math.sqrt(Math.max(1, chunk.text.length)) / 20;
    const score =
      relevanceValue +
      sectionNovelty +
      structuralValue +
      distance * 4 -
      lowValuePenalty -
      lengthPenalty;

    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }

  return bestScore > 0 ? bestIndex : -1;
}

function addIfFits(
  chunks: ExperimentalChunk[],
  selected: Set<number>,
  index: number,
  budget: number
): boolean {
  if (index < 0 || index >= chunks.length || selected.has(index)) return false;
  const candidate = new Set(selected);
  candidate.add(index);
  if (renderSelection(chunks, candidate).length > budget) return false;
  selected.add(index);
  return true;
}

function buildChunks(blocks: PageContentBlock[], targetSize: number): ExperimentalChunk[] {
  const chunks: ExperimentalChunk[] = [];
  for (const block of blocks) {
    const formatted = formatBlock(block);
    const heading = block.headingPath.join(" > ");
    const section = block.headingPath[0] ?? (block.type === "title" ? "__title" : "__intro");
    for (const piece of splitText(formatted, targetSize)) {
      chunks.push({
        text: piece,
        heading,
        section,
        documentIndex: block.documentIndex,
        type: block.type,
        tokens: tokenize(`${heading} ${piece}`),
      });
    }
  }
  return chunks;
}

function renderSelection(chunks: ExperimentalChunk[], selected: Set<number>): string {
  return [...selected]
    .sort((left, right) => chunks[left].documentIndex - chunks[right].documentIndex || left - right)
    .map((index) => {
      const chunk = chunks[index];
      return chunk.heading ? `[Section: ${chunk.heading}]\n${chunk.text}` : chunk.text;
    })
    .join("\n\n---\n\n");
}

function splitText(text: string, limit: number): string[] {
  if (text.length <= limit) return [text];
  const sentences = text.match(/[^.!?\n]+(?:[.!?]+|$)/gu) ?? [text];
  const pieces: string[] = [];
  let current = "";
  for (const rawSentence of sentences) {
    const sentence = rawSentence.trim();
    if (!sentence) continue;
    if (sentence.length > limit) {
      if (current) pieces.push(current);
      for (let start = 0; start < sentence.length; start += limit) {
        pieces.push(sentence.slice(start, start + limit).trim());
      }
      current = "";
      continue;
    }
    const combined = current ? `${current} ${sentence}` : sentence;
    if (combined.length > limit) {
      pieces.push(current);
      current = sentence;
    } else {
      current = combined;
    }
  }
  if (current) pieces.push(current);
  return pieces.filter(Boolean);
}

function formatBlock(block: PageContentBlock): string {
  if (block.type === "title") return `# ${block.text}`;
  if (block.type === "heading") return `## ${block.text}`;
  if (block.type === "list-item") return `- ${block.text}`;
  if (block.type === "quote") return `> ${block.text}`;
  return block.text;
}

function fallbackBlocks(text: string): PageContentBlock[] {
  return text
    .split(/\n{2,}/u)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((text, documentIndex) => ({
      type: "paragraph" as const,
      text,
      headingPath: [],
      documentIndex,
    }));
}

function tokenize(text: string): string[] {
  const separated = text.replace(/([\p{Ll}\d])([\p{Lu}])/gu, "$1 $2");
  const rawTokens = normalize(separated).match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? [];
  return unique(
    rawTokens.flatMap(expandToken).filter((token) => token.length > 2 || /^\d+$/u.test(token))
  );
}

function expandToken(token: string): string[] {
  const variants = [token];
  if (token.length > 6 && token.endsWith("ing")) {
    variants.push(token.slice(0, -3), `${token.slice(0, -3)}e`);
  }
  if (token.length > 5 && token.endsWith("ed")) {
    variants.push(token.slice(0, -2), token.slice(0, -1));
  }
  if (token.length > 6 && token.endsWith("ation")) variants.push(token.slice(0, -3));
  if (token.length > 4 && token.endsWith("ies")) variants.push(`${token.slice(0, -3)}y`);
  if (token.length > 4 && token.endsWith("s") && !token.endsWith("ss") && !token.endsWith("is")) {
    variants.push(token.slice(0, -1));
  }
  return variants;
}

function normalize(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}'’ -]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
