const MAIN_CONTENT_SELECTORS = [
  "article",
  "main",
  "[role=main]",
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

function findMainContent(): Element | null {
  for (const selector of MAIN_CONTENT_SELECTORS) {
    const el = document.querySelector(selector);
    if (el) return el;
  }
  return document.body;
}

export function cleanText(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, " ")
    .replace(/(\r\n|\r|\n){2,}/g, "\n\n");
}

export function extractPageText(): string {
  const el = findMainContent();
  if (!el) return "";
  return cleanText(el.textContent ?? "");
}

export function getElementSelector(el: Element): string {
  const parts: string[] = [];
  let current: Element | null = el;
  while (current && current !== document.documentElement) {
    let part = current.tagName.toLowerCase();
    if (current.id) {
      part += `#${current.id}`;
      parts.unshift(part);
      break;
    }
    const classes = Array.from(current.classList)
      .slice(0, 2)
      .map((c) => `.${c}`)
      .join("");
    part += classes;
    parts.unshift(part);
    current = current.parentElement;
  }
  return parts.join(" > ");
}
