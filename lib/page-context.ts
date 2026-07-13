export type PageContextMode = "trim" | "compact" | "compact-v2";

export type PageContentBlockType =
  | "title"
  | "heading"
  | "paragraph"
  | "list-item"
  | "table"
  | "quote"
  | "code"
  | "caption";

export interface PageContentBlock {
  type: PageContentBlockType;
  text: string;
  headingPath: string[];
  documentIndex: number;
}

export interface CompactedPageContent {
  text: string;
  compacted: boolean;
  selectedChunkCount: number;
  totalChunkCount: number;
  originalCharCount: number;
}

interface PageChunk {
  text: string;
  heading: string;
  documentIndex: number;
}

const GENERIC_QUERY_WORDS = new Set([
  "about",
  "article",
  "content",
  "explain",
  "give",
  "key",
  "main",
  "overview",
  "page",
  "please",
  "point",
  "points",
  "summarise",
  "summarize",
  "summary",
  "tell",
  "this",
  "tldr",
  "what",
]);

const COMMON_STOP_WORDS = new Set([
  "and",
  "are",
  "but",
  "for",
  "from",
  "has",
  "have",
  "how",
  "into",
  "not",
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
  "who",
  "why",
  "with",
  "would",
  "you",
  "your",
]);

const LOW_VALUE_SECTION_NAMES = new Set([
  "bibliografia",
  "bibliography",
  "enlaces externos",
  "external links",
  "fontes",
  "further reading",
  "ligacoes externas",
  "liens externes",
  "literatur",
  "notas",
  "notes",
  "referencias",
  "referências",
  "references",
  "sources",
  "ver tambem",
  "voir aussi",
  "vease tambien",
  "weblinks",
]);

export function serializePageBlocks(blocks: PageContentBlock[]): string {
  return blocks.map(formatBlock).filter(Boolean).join("\n\n");
}

export function compactPageContent(
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
  const targetChunkSize = Math.min(1_200, Math.max(180, Math.floor(charLimit / 6)));
  const chunks = buildChunks(sourceBlocks, targetChunkSize);
  if (chunks.length === 0) {
    return {
      text: fallbackText.slice(0, charLimit),
      compacted: true,
      selectedChunkCount: 1,
      totalChunkCount: 1,
      originalCharCount,
    };
  }

  const queryTerms = tokenize(query).filter(
    (term) => !COMMON_STOP_WORDS.has(term) && !GENERIC_QUERY_WORDS.has(term)
  );
  const order =
    queryTerms.length > 0 ? relevanceOrder(chunks, queryTerms) : coverageOrder(chunks.length);
  const selected = new Set<number>();

  for (const index of order) {
    const candidate = new Set(selected);
    candidate.add(index);
    if (renderSelection(chunks, candidate).length <= charLimit) selected.add(index);
  }

  if (selected.size === 0) {
    selected.add(order[0] ?? 0);
  }

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

export function compactPageContentV2(
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
  const targetChunkSize = Math.min(1_000, Math.max(180, Math.floor(charLimit / 8)));
  const chunks = buildChunks(sourceBlocks, targetChunkSize);
  if (chunks.length === 0) {
    return {
      text: fallbackText.slice(0, charLimit),
      compacted: true,
      selectedChunkCount: 1,
      totalChunkCount: 1,
      originalCharCount,
    };
  }

  const selected = new Set<number>();
  const coreOrder = structuralCoreOrder(chunks);
  addWithinBudget(chunks, selected, coreOrder, Math.floor(charLimit * 0.75));

  const queryTerms = tokenize(query).filter(
    (term) => !COMMON_STOP_WORDS.has(term) && !GENERIC_QUERY_WORDS.has(term)
  );
  if (queryTerms.length > 0) {
    addWithinBudget(chunks, selected, relevanceOrder(chunks, queryTerms, true), charLimit);
  }

  // Use any budget left after the query supplement to strengthen the
  // task-independent core instead of filling it with arbitrary detail.
  addWithinBudget(chunks, selected, coreOrder, charLimit);

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

function buildChunks(blocks: PageContentBlock[], targetSize: number): PageChunk[] {
  const chunks: PageChunk[] = [];
  let currentParts: string[] = [];
  let currentHeading = "";
  let currentIndex = 0;

  const flush = () => {
    const text = currentParts.join("\n\n").trim();
    if (text) chunks.push({ text, heading: currentHeading, documentIndex: currentIndex });
    currentParts = [];
  };

  for (const block of blocks) {
    const blockText = formatBlock(block);
    if (!blockText) continue;
    const heading = block.headingPath.join(" > ");
    const pieces = splitAtBoundaries(blockText, targetSize);

    for (const piece of pieces) {
      const projectedLength = currentParts.join("\n\n").length + piece.length + 2;
      if (currentParts.length > 0 && (heading !== currentHeading || projectedLength > targetSize)) {
        flush();
      }
      if (currentParts.length === 0) {
        currentHeading = heading;
        currentIndex = block.documentIndex;
      }
      currentParts.push(piece);
    }
  }
  flush();
  return chunks;
}

function relevanceOrder(
  chunks: PageChunk[],
  queryTerms: string[],
  positiveMatchesOnly = false
): number[] {
  const scores = chunks.map((chunk, index) => {
    const headingTokens = new Set(tokenize(chunk.heading));
    const bodyTokens = tokenize(chunk.text);
    let score = 0;
    for (const term of new Set(queryTerms)) {
      if (headingTokens.has(term)) score += 3;
      score += Math.min(3, bodyTokens.filter((token) => token === term).length);
    }
    return { index, score };
  });

  const ranked = scores
    .filter(({ score }) => !positiveMatchesOnly || score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ index }) => index);
  if (positiveMatchesOnly) return ranked;
  return uniqueIndexes([ranked[0], 0, chunks.length - 1, ...ranked]);
}

function coverageOrder(length: number): number[] {
  if (length <= 0) return [];
  const selected = [0];
  if (length > 1) selected.push(length - 1);
  const remaining = new Set(Array.from({ length }, (_, index) => index).slice(1, -1));

  while (remaining.size > 0) {
    let bestIndex = -1;
    let bestDistance = -1;
    for (const index of remaining) {
      const distance = Math.min(...selected.map((selectedIndex) => Math.abs(index - selectedIndex)));
      if (distance > bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }
    selected.push(bestIndex);
    remaining.delete(bestIndex);
  }
  return selected;
}

function structuralCoreOrder(chunks: PageChunk[]): number[] {
  const sectionOpeners: number[] = [];
  const seenSections = new Set<string>();

  chunks.forEach((chunk, index) => {
    const topLevelHeading = chunk.heading.split(" > ")[0]?.trim() ?? "";
    const normalizedHeading = normalizeSectionName(topLevelHeading);
    if (!normalizedHeading || seenSections.has(normalizedHeading)) return;
    seenSections.add(normalizedHeading);
    if (!LOW_VALUE_SECTION_NAMES.has(normalizedHeading)) sectionOpeners.push(index);
  });

  const distributedSections = coverageOrder(sectionOpeners.length).map(
    (position) => sectionOpeners[position]
  );
  return uniqueIndexes([0, chunks.length > 1 ? 1 : undefined, ...distributedSections]);
}

function addWithinBudget(
  chunks: PageChunk[],
  selected: Set<number>,
  order: number[],
  budget: number
): void {
  for (const index of order) {
    if (selected.has(index)) continue;
    const candidate = new Set(selected);
    candidate.add(index);
    if (renderSelection(chunks, candidate).length <= budget) selected.add(index);
  }
}

function renderSelection(chunks: PageChunk[], selected: Set<number>): string {
  return [...selected]
    .sort((a, b) => chunks[a].documentIndex - chunks[b].documentIndex)
    .map((index) => {
      const chunk = chunks[index];
      return chunk.heading ? `[Section: ${chunk.heading}]\n${chunk.text}` : chunk.text;
    })
    .join("\n\n---\n\n");
}

function splitAtBoundaries(text: string, limit: number): string[] {
  if (text.length <= limit) return [text];
  const sentences = text.match(/[^.!?\n]+(?:[.!?]+|$)/gu)?.map((part) => part.trim()).filter(Boolean) ?? [text];
  const pieces: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if (sentence.length > limit) {
      if (current) pieces.push(current);
      for (let start = 0; start < sentence.length; start += limit) {
        pieces.push(sentence.slice(start, start + limit).trim());
      }
      current = "";
      continue;
    }
    const next = current ? `${current} ${sentence}` : sentence;
    if (next.length > limit) {
      pieces.push(current);
      current = sentence;
    } else {
      current = next;
    }
  }
  if (current) pieces.push(current);
  return pieces.filter(Boolean);
}

function tokenize(text: string): string[] {
  return (
    text
      .normalize("NFKC")
      .toLocaleLowerCase()
      .match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []
  ).filter((token) => token.length > 2 || /^\d+$/u.test(token));
}

function normalizeSectionName(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function formatBlock(block: PageContentBlock): string {
  switch (block.type) {
    case "title":
      return `# ${block.text}`;
    case "heading":
      return `## ${block.text}`;
    case "list-item":
      return `- ${block.text}`;
    case "quote":
      return `> ${block.text}`;
    case "code":
      return `Code:\n${block.text}`;
    case "table":
      return `Table:\n${block.text}`;
    default:
      return block.text;
  }
}

function fallbackBlocks(text: string): PageContentBlock[] {
  return text
    .split(/\n{2,}/u)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part, documentIndex) => ({
      type: "paragraph" as const,
      text: part,
      headingPath: [],
      documentIndex,
    }));
}

function uniqueIndexes(indexes: Array<number | undefined>): number[] {
  return [...new Set(indexes.filter((index): index is number => index !== undefined && index >= 0))];
}
