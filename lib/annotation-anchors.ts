import type { Annotation } from "./annotations-api";

export interface AnnotationContextPoint {
  x: number;
  y: number;
  selectedText?: string;
  textParentXPath?: string;
  textNodeIndex?: number;
  textOffset?: number;
  containerId?: string;
  containerXPath: string;
  relX: number;
  relY: number;
}

export interface ResolvedAnnotationAnchor {
  element: Element;
  range?: Range;
  relativePoint?: {
    x: number;
    y: number;
  };
}

export interface ViewportPoint {
  x: number;
  y: number;
}

const BLOCK_TAGS = new Set([
  "BODY",
  "DIV",
  "SECTION",
  "ARTICLE",
  "MAIN",
  "HEADER",
  "FOOTER",
  "ASIDE",
  "NAV",
  "FIGURE",
  "IMG",
  "TABLE",
  "FORM",
  "LI",
  "BLOCKQUOTE",
  "DETAILS",
  "UL",
  "OL",
  "P",
  "TD",
  "TH",
  "CAPTION",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
]);

export function captureAnnotationContextPoint(
  clientX: number,
  clientY: number,
  pageX: number,
  pageY: number
): AnnotationContextPoint {
  const target = document.elementFromPoint(clientX, clientY);
  const container = target ? findBlockAncestor(target) : document.body;
  const rect = container.getBoundingClientRect();
  const textAnchor = captureTextAnchor(clientX, clientY);

  return {
    x: pageX,
    y: pageY,
    ...(textAnchor ?? {}),
    selectedText: extractSelectedText(clientX, clientY),
    containerId: container.id || undefined,
    containerXPath: getXPath(container),
    relX:
      rect.width > 0
        ? clampUnit((pageX - (rect.left + window.scrollX)) / rect.width)
        : 0,
    relY:
      rect.height > 0
        ? clampUnit((pageY - (rect.top + window.scrollY)) / rect.height)
        : 0,
  };
}

export function resolveAnnotationAnchor(annotation: Annotation): ResolvedAnnotationAnchor | null {
  const selector = annotation.selector;
  const textAnchor = resolveTextAnchor(annotation);
  if (textAnchor) return textAnchor;

  if (selector.containerId && selector.relX != null) {
    const element = document.getElementById(selector.containerId);
    if (element) return createContainerAnchor(element, selector.relX, selector.relY);
  }

  if (selector.containerXPath && selector.relX != null) {
    const element = findByXPath(selector.containerXPath);
    if (element) return createContainerAnchor(element, selector.relX, selector.relY);
  }

  if (annotation.selectedText) return findSnippetAnchor(annotation.selectedText);
  return null;
}

export function getAnnotationAnchorViewportPoint(
  anchor: ResolvedAnnotationAnchor
): ViewportPoint | null {
  if (anchor.range) {
    try {
      const rect = anchor.range.getBoundingClientRect();
      if (rect.width || rect.height || rect.left || rect.top) {
        return { x: rect.left, y: rect.top + rect.height / 2 };
      }
    } catch {
      return null;
    }
  }

  if (anchor.relativePoint) {
    const rect = anchor.element.getBoundingClientRect();
    return {
      x: rect.left + anchor.relativePoint.x * rect.width,
      y: rect.top + anchor.relativePoint.y * rect.height,
    };
  }

  return null;
}

export function isAnnotationAnchorConnected(anchor: ResolvedAnnotationAnchor): boolean {
  if (!anchor.element.isConnected) return false;
  if (!anchor.range) return true;
  return anchor.range.startContainer.isConnected && anchor.range.endContainer.isConnected;
}

export function getAnnotationAnchorFingerprint(annotation: Annotation): string {
  return JSON.stringify([annotation.selector, annotation.selectedText ?? null]);
}

function resolveTextAnchor(annotation: Annotation): ResolvedAnnotationAnchor | null {
  const selector = annotation.selector;
  if (
    !selector.textParentXPath ||
    selector.textNodeIndex == null ||
    selector.textOffset == null
  ) {
    return null;
  }

  const element = findByXPath(selector.textParentXPath);
  if (!element) return null;

  const textNode = getDirectTextNodes(element)[selector.textNodeIndex];
  if (!textNode) return null;

  try {
    const range = document.createRange();
    const start = Math.min(selector.textOffset, textNode.data.length);
    const end = Math.min(start + 1, textNode.data.length);
    range.setStart(textNode, start);
    range.setEnd(textNode, Math.max(start, end));
    return { element, range };
  } catch {
    return null;
  }
}

function createContainerAnchor(
  element: Element,
  relX: number,
  relY: number | null | undefined
): ResolvedAnnotationAnchor {
  return {
    element,
    relativePoint: {
      x: relX,
      y: relY ?? 0,
    },
  };
}

function findSnippetAnchor(snippet: string): ResolvedAnnotationAnchor | null {
  const normalizedSnippet = normalizeText(snippet);
  if (!normalizedSnippet) return null;

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode() as Text | null;

  while (node) {
    const normalizedIndex = normalizeText(node.data).indexOf(normalizedSnippet);
    if (normalizedIndex >= 0) {
      const element = node.parentElement;
      if (element) {
        const rawIndex = findRawIndexForNormalizedIndex(node.data, normalizedIndex);
        const range = document.createRange();
        range.setStart(node, rawIndex);
        range.setEnd(node, Math.min(node.data.length, rawIndex + snippet.length));
        const rect = range.getBoundingClientRect();
        if (rect.width || rect.height) return { element, range };
      }
    }

    node = walker.nextNode() as Text | null;
  }

  return null;
}

function findBlockAncestor(element: Element): Element {
  let current: Element | null = element;
  while (current && current !== document.documentElement) {
    if (BLOCK_TAGS.has(current.tagName)) return current;
    current = current.parentElement;
  }
  return document.body;
}

function getXPath(element: Element): string {
  if (element === document.body) return "/html/body";

  const parts: string[] = [];
  let current: Element | null = element;
  while (current && current !== document.body) {
    const tag = current.tagName.toLowerCase();
    const parent: Element | null = current.parentElement;
    if (parent) {
      const currentTagName = current.tagName;
      const siblings = (Array.from(parent.children) as Element[]).filter(
        (candidate) => candidate.tagName === currentTagName
      );
      parts.unshift(siblings.length > 1 ? `${tag}[${siblings.indexOf(current) + 1}]` : tag);
    }
    current = parent;
  }
  return `/html/body/${parts.join("/")}`;
}

function findByXPath(xpath: string): Element | null {
  try {
    const result = document.evaluate(
      xpath,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    );
    return result.singleNodeValue as Element | null;
  } catch {
    return null;
  }
}

function captureTextAnchor(
  clientX: number,
  clientY: number
): { textParentXPath: string; textNodeIndex: number; textOffset: number } | null {
  const caret = getCaretPoint(clientX, clientY);
  if (!caret || caret.node.nodeType !== Node.TEXT_NODE) return null;

  const textNode = caret.node as Text;
  const parent = textNode.parentElement;
  if (!parent) return null;

  const textNodeIndex = getDirectTextNodes(parent).indexOf(textNode);
  if (textNodeIndex < 0) return null;

  return {
    textParentXPath: getXPath(parent),
    textNodeIndex,
    textOffset: caret.offset,
  };
}

function extractSelectedText(clientX: number, clientY: number): string | undefined {
  const selected = window.getSelection()?.toString().replace(/\s+/g, " ").trim();
  if (selected) return selected;

  const caret = getCaretPoint(clientX, clientY);
  if (!caret || caret.node.nodeType !== Node.TEXT_NODE) return undefined;

  const fullText = (caret.node as Text).data;
  const words = fullText.split(/\s+/).filter(Boolean);
  const wordIndex = fullText.slice(0, caret.offset).split(/\s+/).filter(Boolean).length;
  const start = Math.max(0, wordIndex - 2);
  const end = Math.min(words.length, wordIndex + 3);
  return words.slice(start, end).join(" ").trim() || undefined;
}

function getCaretPoint(
  clientX: number,
  clientY: number
): { node: Node; offset: number } | null {
  const caretPosition = document.caretPositionFromPoint?.(clientX, clientY);
  if (caretPosition) {
    return { node: caretPosition.offsetNode, offset: caretPosition.offset };
  }

  const range = (
    document as Document & {
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
    }
  ).caretRangeFromPoint?.(clientX, clientY);
  return range ? { node: range.startContainer, offset: range.startOffset } : null;
}

function getDirectTextNodes(element: Element): Text[] {
  return Array.from(element.childNodes).filter(
    (node): node is Text => node.nodeType === Node.TEXT_NODE
  );
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function findRawIndexForNormalizedIndex(value: string, normalizedIndex: number): number {
  let normalizedCount = 0;
  let inWhitespace = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (/\s/.test(char)) {
      if (!inWhitespace) {
        if (normalizedCount === normalizedIndex) return index;
        normalizedCount += 1;
        inWhitespace = true;
      }
      continue;
    }

    if (normalizedCount === normalizedIndex) return index;
    normalizedCount += 1;
    inWhitespace = false;
  }

  return 0;
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}
