import { repairMarkdownStructure } from "./markdown";

export function describeMarkdownContent(content: string) {
  const lines = content.split(/\r?\n/);
  return {
    characterCount: content.length,
    newlineCount: Math.max(0, lines.length - 1),
    escapedPreview: JSON.stringify(content.slice(0, 1200)),
    firstLines: lines.slice(0, 12),
    markdownHeadingLines: lines
      .map((line, index) => ({ line: index + 1, text: line }))
      .filter(({ text }) => /^#{1,6}\s/.test(text))
      .slice(0, 20),
    hasJoinedHeadingMarkers: lines.some(hasJoinedHeadingMarker),
  };
}

function hasJoinedHeadingMarker(line: string): boolean {
  for (const match of line.matchAll(/#{1,6}\s/g)) {
    const markerIndex = match.index ?? 0;
    if (markerIndex > 0 && line.slice(0, markerIndex).trim().length > 0) return true;
  }
  return false;
}

export function repairFlattenedMarkdown(content: string): {
  content: string;
  repaired: boolean;
} {
  return repairMarkdownStructure(content);
}
