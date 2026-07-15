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
  const trimmed = content.trim();
  const newlineCount = (trimmed.match(/\r?\n/g) ?? []).length;
  if (trimmed.length < 200 || newlineCount > 1 || !/^\s*#{1,6}\s/.test(trimmed)) {
    return { content, repaired: false };
  }

  let repaired = splitLeadingHeading(trimmed);
  repaired = repaired.replace(/\s+---\s+/g, "\n\n---\n\n");
  repaired = repaired.replace(/#{1,6}\s/g, (marker, offset: number, source: string) => {
    if (offset === 0 || source[offset - 1] === "\n") return marker;
    return `\n\n${marker}`;
  });
  repaired = repaired.replace(/\s+-\s{2,}(?=\S)/g, "\n- ");
  repaired = repaired
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return {
    content: repaired,
    repaired: repaired !== trimmed,
  };
}

function splitLeadingHeading(content: string): string {
  const structuralMarkerIndex = content.search(/\s+(?:---|##)\s/);
  const leadingEnd = structuralMarkerIndex > 0 ? structuralMarkerIndex : content.length;
  const leadingSection = content.slice(0, Math.min(leadingEnd, 400));
  const sentenceBoundary = /[.!?]["')\]]*\s+(?=[\p{Lu}\d])/u.exec(leadingSection);

  if (sentenceBoundary && sentenceBoundary.index >= 40) {
    const splitAt = sentenceBoundary.index + sentenceBoundary[0].trimEnd().length;
    return `${content.slice(0, splitAt)}\n\n${content.slice(splitAt).trimStart()}`;
  }

  if (leadingEnd <= 320) return content;
  const fallbackSpace = content.lastIndexOf(" ", 180);
  if (fallbackSpace <= 40) return content;
  return `${content.slice(0, fallbackSpace)}\n\n${content.slice(fallbackSpace + 1)}`;
}
