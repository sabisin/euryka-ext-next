import remend from "remend";

const GENERATED_SECTION_LABELS = ["Core Message", "Main Points", "Context and Clarity"];
const GENERATED_SECTION_PATTERN = GENERATED_SECTION_LABELS.join("|");

export function repairMarkdownStructure(content: string): {
  content: string;
  repaired: boolean;
} {
  if (!content.trim()) return { content, repaired: false };

  let repaired = repairFullyFlattenedMarkdown(content);
  repaired = repairJoinedGeneratedSections(repaired);
  repaired = repairJoinedListItems(repaired);
  const wasRepaired = repaired !== content;
  if (wasRepaired) repaired = repaired.replace(/\n{3,}/g, "\n\n").trim();

  return {
    content: repaired,
    repaired: wasRepaired,
  };
}

export function repairMarkdownForDisplay(content: string): string {
  return remend(repairMarkdownStructure(content).content, { linkMode: "text-only" });
}

function repairFullyFlattenedMarkdown(content: string): string {
  const newlineCount = (content.match(/\r?\n/g) ?? []).length;
  if (content.length < 200 || newlineCount > 1 || !/^\s*#{1,6}\s/.test(content)) {
    return content;
  }

  let repaired = splitLeadingHeading(content);
  repaired = repaired.replace(/\s+---\s+/g, "\n\n---\n\n");
  repaired = repaired.replace(/#{1,6}\s/g, (marker, offset: number, source: string) => {
    if (offset === 0 || source[offset - 1] === "\n") return marker;
    return `\n\n${marker}`;
  });
  repaired = repaired.replace(/\s+-\s{2,}(?=\S)/g, "\n- ");

  return repaired.replace(/[ \t]*\n[ \t]*/g, "\n");
}

function repairJoinedGeneratedSections(content: string): string {
  const detachedLabel = new RegExp(
    `^(#{1,6})[ \\t]+(\\d+\\.)[ \\t]*(?:\\r?\\n[ \\t]*)+(${GENERATED_SECTION_PATTERN})(?=[\\p{Lu}*-])`,
    "gmu"
  );
  const inlineLabel = new RegExp(
    `^(#{1,6}[ \\t]+\\d+\\.[ \\t]+)(${GENERATED_SECTION_PATTERN})(?=[\\p{Lu}*-])`,
    "gmu"
  );

  return content.replace(detachedLabel, "$1 $2 $3\n\n").replace(inlineLabel, "$1$2\n\n");
}

function repairJoinedListItems(content: string): string {
  return content.replace(/([.!?])-[ \t]*(?=[\p{Lu}\d*])/gu, "$1\n- ");
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
