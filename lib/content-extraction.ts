import { serializePageBlocks, type PageContentBlock } from "./page-context";

const MAIN_CONTENT_SELECTORS = [
  "main",
  "[role=main]",
  "article",
  ".post-content",
  ".article-content",
  ".entry-content",
  "#content",
  ".content",
  ".story-content",
  ".article-body",
  ".mw-parser-output",
  ".post-body",
  ".blog-post-content",
  ".story-body",
  ".article__body",
  ".article-text",
  ".rich-text",
  ".text-content",
  "body",
];

const BLOCK_SELECTOR =
  "h1, h2, h3, h4, h5, h6, p, li, blockquote, pre, table, figcaption, dt, dd";

function findMainContent(): Element | null {
  const candidates = new Set<Element>();
  for (const selector of MAIN_CONTENT_SELECTORS) {
    for (const el of document.querySelectorAll(selector)) candidates.add(el);
  }
  if (candidates.size === 0) return document.body;
  return [...candidates].sort((a, b) => contentCandidateScore(b) - contentCandidateScore(a))[0];
}

export function cleanText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[\t\f\v ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function extractPageText(): string {
  return extractPageContent().text;
}

export function extractPageContent(): { text: string; blocks: PageContentBlock[] } {
  const el = findMainContent();
  if (!el) return { text: "", blocks: [] };

  const blocks = extractContentBlocks(el);
  const text = serializePageBlocks(blocks);
  if (text && blocks.some((block) => block.type !== "title")) return { text, blocks };

  const fallbackText = cleanText((el as HTMLElement).innerText ?? el.textContent ?? "");
  const titleBlocks = blocks.filter((block) => block.type === "title");
  return {
    text: [titleBlocks.length > 0 ? serializePageBlocks(titleBlocks) : "", fallbackText]
      .filter(Boolean)
      .join("\n\n"),
    blocks: fallbackText
      ? [
          ...titleBlocks,
          {
            type: "paragraph",
            text: fallbackText,
            headingPath: [],
            documentIndex: titleBlocks.length,
          } as PageContentBlock,
        ]
      : titleBlocks,
  };
}

function extractContentBlocks(root: Element): PageContentBlock[] {
  const blocks: PageContentBlock[] = [];
  const headingPath: string[] = [];
  const title = cleanText(document.title);
  if (title) blocks.push({ type: "title", text: title, headingPath: [], documentIndex: 0 });

  for (const element of root.querySelectorAll<HTMLElement>(BLOCK_SELECTOR)) {
    if (!isVisibleContent(element) || hasSemanticContainer(element, root)) continue;
    const tag = element.tagName.toLowerCase();
    const text = extractBlockText(element, tag);
    if (!text) continue;

    if (/^h[1-6]$/u.test(tag)) {
      const level = Number(tag[1]);
      headingPath.length = level - 1;
      headingPath[level - 1] = text;
      blocks.push({
        type: "heading",
        text,
        headingPath: headingPath.filter(Boolean),
        documentIndex: blocks.length,
      });
      continue;
    }

    blocks.push({
      type: getBlockType(tag),
      text,
      headingPath: headingPath.filter(Boolean),
      documentIndex: blocks.length,
    });
  }
  return blocks;
}

function contentCandidateScore(element: Element): number {
  if (element === document.body) return 0;
  const textLength = cleanText(element.textContent ?? "").length;
  if (textLength === 0) return 0;
  const linkLength = [...element.querySelectorAll("a")].reduce(
    (total, link) => total + cleanText(link.textContent ?? "").length,
    0
  );
  const linkDensity = Math.min(0.9, linkLength / textLength);
  const tagBonus = element.matches("main, [role=main]") ? 1.2 : 1;
  return textLength * (1 - linkDensity) * tagBonus;
}

function isVisibleContent(element: HTMLElement): boolean {
  if (element.closest("[hidden], [inert], [aria-hidden=true]")) return false;
  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden";
}

function hasSemanticContainer(element: Element, root: Element): boolean {
  const parent = element.parentElement?.closest("li, blockquote, pre, table, figcaption, dt, dd");
  if (element.matches("li") && parent?.matches("li")) return false;
  return Boolean(parent && parent !== root);
}

function extractBlockText(element: HTMLElement, tag: string): string {
  if (tag === "table") {
    return [...element.querySelectorAll("tr")]
      .map((row) =>
        [...row.querySelectorAll("th, td")]
          .map((cell) => cleanText((cell as HTMLElement).innerText || cell.textContent || ""))
          .filter(Boolean)
          .join(" | ")
      )
      .filter(Boolean)
      .join("\n");
  }
  if (tag === "li") {
    const clone = element.cloneNode(true) as HTMLElement;
    for (const nestedList of clone.querySelectorAll("ul, ol")) nestedList.remove();
    return cleanText(clone.innerText || clone.textContent || "");
  }
  return cleanText(element.innerText || element.textContent || "");
}

function getBlockType(tag: string): PageContentBlock["type"] {
  if (tag === "li") return "list-item";
  if (tag === "table") return "table";
  if (tag === "blockquote") return "quote";
  if (tag === "pre") return "code";
  if (tag === "figcaption") return "caption";
  return "paragraph";
}

// CSS.escape exists in all extension contexts (content scripts, side panel),
// but guard anyway so this never throws in an unexpected environment.
function cssEscape(value: string): string {
  return typeof CSS !== "undefined" && typeof CSS.escape === "function"
    ? CSS.escape(value)
    : value.replace(/[^\w-]/g, (ch) => `\\${ch}`);
}

export function getElementSelector(el: Element): string {
  const parts: string[] = [];
  let current: Element | null = el;
  while (current && current !== document.documentElement) {
    let part = current.tagName.toLowerCase();
    if (current.id) {
      // Escape so ids with `:`, `/`, spaces or a leading digit stay valid.
      part += `#${cssEscape(current.id)}`;
      parts.unshift(part);
      break;
    }
    const classes = Array.from(current.classList)
      .slice(0, 2)
      .map((c) => `.${cssEscape(c)}`)
      .join("");
    part += classes;
    parts.unshift(part);
    current = current.parentElement;
  }
  return parts.join(" > ");
}
