import { Bold, Check, Italic, List, Loader2, Save, Strikethrough, X } from "lucide-react";
import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import {
  firestoreTimestampToMs,
  type Annotation,
} from "../../lib/annotations-api";
import { onMessage, sendMessage } from "../../lib/messaging";
import type { UserPrefs } from "../../lib/types";
import { identityColor, identityInitial } from "../../lib/utils";
import { Button } from "../../components/shared/Button";
import logo from "../../assets/ek-alt-blue.svg";

type ContextPoint = {
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
};

type ResolvedTheme = "dark" | "light";

const MARKER_SIZE = 32;
const COMPOSER_WIDTH = 320;
const COMPOSER_ESTIMATED_HEIGHT = 280;
const COMPOSER_MARKER_GAP = 4;
const COMPOSER_EDGE_GAP = 12;
const DEBUG_ANNOTATION_POSITIONING = false;
const FORMAT_ACTIONS = [
  { icon: <Bold size={13} />, title: "Bold", prefix: "**", suffix: "**" },
  { icon: <Italic size={13} />, title: "Italic", prefix: "_", suffix: "_" },
  { icon: <Strikethrough size={13} />, title: "Strikethrough", prefix: "~~", suffix: "~~" },
  { icon: <List size={13} />, title: "Bullet list", prefix: "\n- ", suffix: "" },
] as const;
const ANNOTATION_UPDATED_EVENT = "annotationUpdated";
const ANNOTATION_DELETED_EVENT = "annotationDeleted";
const TOGGLE_ANNOTATIONS_SHORTCUT = "a";

function debugAnnotations(message: string, details?: unknown) {
  console.info(`[Euryka annotations] ${message}`, details ?? "");
}

function debugAnnotationPosition(message: string, details?: unknown) {
  if (!DEBUG_ANNOTATION_POSITIONING) return;
  debugAnnotations(message, details);
}

function isToggleAnnotationsShortcut(event: KeyboardEvent) {
  return (
    event.altKey &&
    event.shiftKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    event.key.toLowerCase() === TOGGLE_ANNOTATIONS_SHORTCUT
  );
}

function rectToDebug(rect: DOMRect) {
  return {
    left: Math.round(rect.left),
    top: Math.round(rect.top),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}

const BLOCK_TAGS = new Set([
  "BODY", "DIV", "SECTION", "ARTICLE", "MAIN", "HEADER", "FOOTER",
  "ASIDE", "NAV", "FIGURE", "IMG", "TABLE", "FORM", "LI",
  "BLOCKQUOTE", "DETAILS", "UL", "OL",
  "P", "TD", "TH", "CAPTION", "H1", "H2", "H3", "H4", "H5", "H6",
]);

function findBlockAncestor(el: Element): Element {
  let current: Element | null = el;
  while (current && current !== document.documentElement) {
    if (BLOCK_TAGS.has(current.tagName)) return current;
    current = current.parentElement;
  }
  return document.body;
}

function getXPath(el: Element): string {
  if (el === document.body) return "/html/body";
  const parts: string[] = [];
  let current: Element | null = el;
  while (current && current !== document.body) {
    const tag = current.tagName.toLowerCase();
    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter((c) => c.tagName === current!.tagName);
      parts.unshift(siblings.length > 1 ? `${tag}[${siblings.indexOf(current) + 1}]` : tag);
    }
    current = parent;
  }
  return `/html/body/${parts.join("/")}`;
}

function findByXPath(xpath: string): Element | null {
  try {
    const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
    return result.singleNodeValue as Element | null;
  } catch {
    return null;
  }
}

function extractSelectedText(clientX: number, clientY: number): string | undefined {
  const selected = window.getSelection()?.toString().replace(/\s+/g, " ").trim();
  if (selected) return selected;

  const range = (document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  }).caretRangeFromPoint?.(clientX, clientY);
  if (!range || range.startContainer.nodeType !== Node.TEXT_NODE) return undefined;

  const fullText = (range.startContainer as Text).data;
  const offset = range.startOffset;
  const words = fullText.split(/\s+/).filter(Boolean);
  const before = fullText.slice(0, offset);
  const wordIndex = before.split(/\s+/).filter(Boolean).length;
  const start = Math.max(0, wordIndex - 2);
  const end = Math.min(words.length, wordIndex + 3);
  const snippet = words.slice(start, end).join(" ").trim();
  return snippet || undefined;
}

function captureTextAnchor(clientX: number, clientY: number):
  | { textParentXPath: string; textNodeIndex: number; textOffset: number }
  | null {
  const range = (document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  }).caretRangeFromPoint?.(clientX, clientY);
  if (!range || range.startContainer.nodeType !== Node.TEXT_NODE) return null;

  const textNode = range.startContainer as Text;
  const parent = textNode.parentElement;
  if (!parent) return null;

  const textNodes = Array.from(parent.childNodes).filter(
    (n) => n.nodeType === Node.TEXT_NODE,
  );
  const textNodeIndex = textNodes.indexOf(textNode);
  if (textNodeIndex < 0) return null;

  return {
    textParentXPath: getXPath(parent),
    textNodeIndex,
    textOffset: range.startOffset,
  };
}

function computeAnchor(clientX: number, clientY: number, pageX: number, pageY: number): Omit<ContextPoint, "x" | "y"> {
  const target = document.elementFromPoint(clientX, clientY);
  const container = target ? findBlockAncestor(target) : document.body;
  const rect = container.getBoundingClientRect();

  const relX = rect.width > 0 ? Math.max(0, Math.min(1, (pageX - (rect.left + window.scrollX)) / rect.width)) : 0;
  const relY = rect.height > 0 ? Math.max(0, Math.min(1, (pageY - (rect.top + window.scrollY)) / rect.height)) : 0;
  const textAnchor = captureTextAnchor(clientX, clientY);
  const selectedText = extractSelectedText(clientX, clientY);

  return {
    ...(textAnchor ?? {}),
    selectedText,
    containerId: container.id || undefined,
    containerXPath: getXPath(container),
    relX,
    relY,
  };
}

function resolveViewportPos(annotation: Annotation): { left: number; top: number } {
  const selector = annotation.selector;
  debugAnnotationPosition("Resolving annotation position", {
    id: annotation.id,
    createdBy: annotation.createdBy,
    hasTextAnchor: Boolean(selector.textParentXPath),
    hasContainerAnchor: Boolean(selector.containerId || selector.containerXPath),
    hasSelectedText: Boolean(annotation.selectedText),
    x: selector.x,
    y: selector.y,
  });

  if (
    selector.textParentXPath &&
    selector.textNodeIndex != null &&
    selector.textOffset != null
  ) {
    const parent = findByXPath(selector.textParentXPath);
    if (parent) {
      const textNodes = Array.from(parent.childNodes).filter(
        (n) => n.nodeType === Node.TEXT_NODE,
      ) as Text[];
      const textNode = textNodes[selector.textNodeIndex];
      if (textNode) {
        try {
          const range = document.createRange();
          const max = textNode.data.length;
          const start = Math.min(selector.textOffset, max);
          const end = Math.min(start + 1, max);
          range.setStart(textNode, start);
          range.setEnd(textNode, Math.max(end, start));
          const rect = range.getBoundingClientRect();
          if (rect.width || rect.height || rect.left || rect.top) {
            debugAnnotationPosition("Resolved annotation with text anchor", {
              id: annotation.id,
              rect: rectToDebug(rect),
            });
            return {
              left: rect.left - MARKER_SIZE / 2,
              top: rect.top + rect.height / 2 - MARKER_SIZE / 2,
            };
          }
        } catch {
          // Fall through to container fallback.
        }
      }
    }
  }

  const tryContainer = (el: Element) => {
    const rect = el.getBoundingClientRect();
    return {
      left: rect.left + (selector.relX ?? 0) * rect.width - MARKER_SIZE / 2,
      top: rect.top + (selector.relY ?? 0) * rect.height - MARKER_SIZE / 2,
    };
  };

  if (selector.containerId && selector.relX != null) {
    const el = document.getElementById(selector.containerId);
    if (el) return tryContainer(el);
  }

  if (selector.containerXPath && selector.relX != null) {
    const el = findByXPath(selector.containerXPath);
    if (el) return tryContainer(el);
  }

  if (annotation.selectedText) {
    const rect = findSnippetRect(annotation.selectedText);
    if (rect) {
      return {
        left: rect.left - MARKER_SIZE / 2,
        top: rect.top + rect.height / 2 - MARKER_SIZE / 2,
      };
    }
  }

  return {
    left: selector.x - window.scrollX - MARKER_SIZE / 2,
    top: selector.y - window.scrollY - MARKER_SIZE / 2,
  };
}

function getComposerPositionStyle(markerLeft: number, markerTop: number): CSSProperties {
  const opensLeft =
    markerLeft + MARKER_SIZE + COMPOSER_MARKER_GAP + COMPOSER_WIDTH + COMPOSER_EDGE_GAP >
    window.innerWidth;
  const opensUp =
    markerTop + COMPOSER_ESTIMATED_HEIGHT + COMPOSER_EDGE_GAP >
    window.innerHeight;

  return {
    width: `${COMPOSER_WIDTH}px`,
    ...(opensLeft
      ? { right: `${MARKER_SIZE + COMPOSER_MARKER_GAP}px` }
      : { left: `${MARKER_SIZE + COMPOSER_MARKER_GAP}px` }),
    ...(opensUp ? { bottom: "0" } : { top: "0" }),
  };
}

function findSnippetRect(snippet: string): DOMRect | null {
  const normalizedSnippet = normalizeText(snippet);
  if (!normalizedSnippet) return null;

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode() as Text | null;

  while (node) {
    const text = node.data;
    const normalizedText = normalizeText(text);
    const normalizedIndex = normalizedText.indexOf(normalizedSnippet);

    if (normalizedIndex >= 0) {
      const rawIndex = findRawIndexForNormalizedIndex(text, normalizedIndex);
      const range = document.createRange();
      range.setStart(node, rawIndex);
      range.setEnd(node, Math.min(text.length, rawIndex + snippet.length));
      const rect = range.getBoundingClientRect();
      if (rect.width || rect.height) return rect;
    }

    node = walker.nextNode() as Text | null;
  }

  return null;
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

export function AnnotationLayer() {
  const [hidden, setHidden] = useState(false);
  const [theme, setTheme] = useState<ResolvedTheme>("dark");
  const [myIdentity, setMyIdentity] = useState<string | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [savedId, setSavedId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [, setViewportTick] = useState(0);
  const lastContextMenuPoint = useRef<ContextPoint | null>(null);
  const activeAnnotationIdRef = useRef<string | null>(null);
  const refreshInFlightRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const refreshAnnotations = async () => {
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    try {
      const results: Annotation[] = [];
      let cursor: string | undefined;

      do {
        const response = await sendMessage("listAnnotations", {
          targetUrl: getCurrentTargetUrl(),
          limit: 100,
          cursor,
        });
        results.push(...response.annotations);
        cursor = response.nextCursor ?? undefined;
      } while (cursor);

      setAnnotations(results);
      if (
        activeAnnotationIdRef.current &&
        !results.some((annotation) => annotation.id === activeAnnotationIdRef.current)
      ) {
        setActiveAnnotationId(null);
        setNoteDraft("");
      }
    } catch (error) {
      debugAnnotations("Failed to refresh annotations", error);
    } finally {
      refreshInFlightRef.current = false;
    }
  };

  useEffect(() => {
    debugAnnotations("Annotation layer mounted", {
      url: getCurrentTargetUrl(),
    });
  }, []);

  const markerNumbers = useMemo(() => {
    const result = new Map<string, number>();
    [...annotations]
      .sort((a, b) => firestoreTimestampToMs(a.createdAt) - firestoreTimestampToMs(b.createdAt))
      .forEach((annotation, index) => result.set(annotation.id, index + 1));
    return result;
  }, [annotations]);

  useEffect(() => {
    let cancelled = false;

    const refreshPrefs = async () => {
      try {
        const prefs = await sendMessage("getUserPrefs", undefined) as UserPrefs | undefined;
        if (cancelled) return;
        setHidden((current) => {
          const next = prefs?.annotationsHidden ?? false;
          return current === next ? current : next;
        });
        if (prefs?.theme === "dark" || prefs?.theme === "light") {
          setTheme((current) => current === prefs.theme ? current : prefs.theme);
        } else {
          const nextTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
          setTheme((current) => current === nextTheme ? current : nextTheme);
        }
      } catch (error) {
        debugAnnotations("Failed to load user preferences", error);
      }
    };

    void refreshPrefs();
    const interval = window.setInterval(() => void refreshPrefs(), 1_000);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handleSystemTheme = () => void refreshPrefs();
    media.addEventListener("change", handleSystemTheme);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      media.removeEventListener("change", handleSystemTheme);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const refreshIdentity = async () => {
      try {
        const identity = await sendMessage("getCurrentIdentity", undefined);
        if (!cancelled) {
          setMyIdentity((current) => current === identity ? current : identity);
        }
      } catch (error) {
        debugAnnotations("Failed to load current identity", error);
      }
    };

    void refreshIdentity();
    const interval = window.setInterval(() => void refreshIdentity(), 1_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    activeAnnotationIdRef.current = activeAnnotationId;
  }, [activeAnnotationId]);

  useEffect(() => {
    let toggling = false;

    const toggleAnnotations = async (event: KeyboardEvent) => {
      if (!isToggleAnnotationsShortcut(event) || event.repeat || toggling) return;

      event.preventDefault();
      event.stopPropagation();
      toggling = true;

      const nextHidden = !hidden;
      setHidden(nextHidden);

      try {
        await sendMessage("updateUserPrefs", { annotationsHidden: nextHidden });
      } catch (error) {
        setHidden(hidden);
        debugAnnotations("Failed to toggle annotations with shortcut", error);
      } finally {
        toggling = false;
      }
    };

    window.addEventListener("keydown", toggleAnnotations, true);
    return () => window.removeEventListener("keydown", toggleAnnotations, true);
  }, [hidden]);

  useEffect(() => {
    const cleanupUpdated = onMessage(ANNOTATION_UPDATED_EVENT, ({ data }) => {
      const next = data.annotation;
      setAnnotations((current) => {
        const index = current.findIndex((annotation) => annotation.id === next.id);
        if (index < 0) {
          if (next.targetUrl !== getCurrentTargetUrl()) return current;
          return [...current, next];
        }
        return current.map((annotation) => annotation.id === next.id ? next : annotation);
      });
    });

    const cleanupDeleted = onMessage(ANNOTATION_DELETED_EVENT, ({ data }) => {
      setAnnotations((current) =>
        current.filter((annotation) => annotation.id !== data.id),
      );
      if (activeAnnotationIdRef.current === data.id) {
        setActiveAnnotationId(null);
        setNoteDraft("");
      }
    });

    return () => {
      cleanupUpdated();
      cleanupDeleted();
    };
  }, []);

  useEffect(() => {
    void refreshAnnotations();

    const refreshOnVisible = () => {
      if (document.visibilityState === "visible") void refreshAnnotations();
    };
    document.addEventListener("visibilitychange", refreshOnVisible);
    window.addEventListener("focus", refreshOnVisible);

    return () => {
      document.removeEventListener("visibilitychange", refreshOnVisible);
      window.removeEventListener("focus", refreshOnVisible);
    };
  }, []);

  useEffect(() => {
    const captureContextMenuPoint = (event: MouseEvent) => {
      lastContextMenuPoint.current = {
        x: event.pageX,
        y: event.pageY,
        ...computeAnchor(event.clientX, event.clientY, event.pageX, event.pageY),
      };
    };

    window.addEventListener("contextmenu", captureContextMenuPoint, true);
    return () => window.removeEventListener("contextmenu", captureContextMenuPoint, true);
  }, []);

  useEffect(() => {
    const cleanup = onMessage("createAnnotationMarker", async () => {
      try {
        const point = lastContextMenuPoint.current ?? getViewportCenterPoint();
        const createdBy = (await sendMessage("getCurrentIdentity", undefined)) ?? undefined;
        const color = createdBy ? identityColor(createdBy) : "#18181b";
        const response = await sendMessage(
          "createAnnotation",
          {
            targetUrl: getCurrentTargetUrl(),
            targetTitle: document.title || undefined,
            selectedText: point.selectedText,
            color,
            selector: {
              x: point.x,
              y: point.y,
              textParentXPath: point.textParentXPath ?? null,
              textNodeIndex: point.textNodeIndex ?? null,
              textOffset: point.textOffset ?? null,
              containerId: point.containerId ?? null,
              containerXPath: point.containerXPath ?? null,
              relX: point.relX,
              relY: point.relY,
            },
            positionStart: point.textOffset,
            positionEnd: point.textOffset != null ? point.textOffset + 1 : undefined,
          },
        );

        setAnnotations((current) => [...current, response.annotation]);
        debugAnnotations("Created annotation", {
          id: response.annotation.id,
          targetUrl: response.annotation.targetUrl,
          selectedText: response.annotation.selectedText,
        });
        setNoteDraft("");
      } catch (error) {
        debugAnnotations("Failed to create annotation", error);
      }
    });

    return cleanup;
  }, []);

  useEffect(() => {
    const updateViewport = () => setViewportTick((tick) => tick + 1);
    window.addEventListener("scroll", updateViewport, { passive: true });
    window.addEventListener("resize", updateViewport);
    return () => {
      window.removeEventListener("scroll", updateViewport);
      window.removeEventListener("resize", updateViewport);
    };
  }, []);

  const openEditor = (annotation: Annotation) => {
    if (activeAnnotationId === annotation.id) {
      setActiveAnnotationId(null);
      setNoteDraft("");
    } else {
      setActiveAnnotationId(annotation.id);
      setNoteDraft(annotation.note ?? "");
    }
  };

  const applyFormat = (prefix: string, suffix: string) => {
    const el = textareaRef.current;
    if (!el) return;

    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = noteDraft.slice(start, end);
    const nextDraft = noteDraft.slice(0, start) + prefix + selected + suffix + noteDraft.slice(end);
    setNoteDraft(nextDraft);

    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + prefix.length, end + prefix.length);
    });
  };

  const saveNote = async (annotation: Annotation) => {
    if (savingId === annotation.id) return;
    setSavingId(annotation.id);
    setSavedId(null);
    try {
      const response = await sendMessage("updateAnnotation", {
        id: annotation.id,
        payload: { note: noteDraft.trim() || null },
      });
      setAnnotations((current) =>
        current.map((item) => item.id === annotation.id ? response.annotation : item),
      );
      setSavedId(annotation.id);
      setTimeout(() => setSavedId(null), 2000);
    } catch (error) {
      debugAnnotations("Failed to save annotation note", error);
    } finally {
      setSavingId((current) => current === annotation.id ? null : current);
    }
  };

  const removeAnnotation = async (annotation: Annotation) => {
    try {
      await sendMessage("deleteAnnotation", { id: annotation.id });
      setAnnotations((current) => current.filter((item) => item.id !== annotation.id));
      if (activeAnnotationId === annotation.id) {
        setActiveAnnotationId(null);
        setNoteDraft("");
      }
    } catch (error) {
      debugAnnotations("Failed to delete annotation", error);
    }
  };

  if (hidden) return null;

  return (
    <>
      {annotations.map((annotation) => {
        const { left, top } = resolveViewportPos(annotation);
        const isActive = annotation.id === activeAnnotationId;
        const isSaving = savingId === annotation.id;
        const isSaved = savedId === annotation.id;
        const markerNumber = markerNumbers.get(annotation.id);
        const markerColor = annotation.color ?? identityColor(annotation.createdBy);
        const initial = identityInitial(myIdentity ?? annotation.createdBy);
        const composerName = myIdentity || "Annotation";
        const isDark = theme === "dark";
        const composerPositionStyle = getComposerPositionStyle(left, top);
        const composerClassName = isDark
          ? "border-zinc-700 bg-zinc-950 text-zinc-100 shadow-2xl"
          : "border-zinc-200 bg-white text-zinc-950 shadow-2xl";
        const headerClassName = isDark ? "border-zinc-800" : "border-zinc-200";
        const textareaClassName = isDark
          ? "text-zinc-100 placeholder:text-zinc-500"
          : "text-zinc-950 placeholder:text-slate-400";
        const footerClassName = isDark ? "border-zinc-800 bg-zinc-950" : "border-zinc-200 bg-slate-50";
        const toolButtonClassName = isDark
          ? "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          : "text-slate-600 hover:bg-slate-200 hover:text-slate-950";

        return (
          <div
            key={annotation.id}
            className={`fixed ${isActive ? "z-[101]" : "z-[100]"}`}
            style={{
              left: `${left}px`,
              top: `${top}px`,
              width: `${MARKER_SIZE}px`,
              height: `${MARKER_SIZE}px`,
              pointerEvents: "auto",
            }}
          >
            <button
              type="button"
              aria-label="Open annotation"
              onClick={() => openEditor(annotation)}
              className="flex h-8 w-8 cursor-pointer select-none items-center justify-center rounded-full shadow-lg transition-transform hover:scale-105"
              style={{ backgroundColor: "#18181b" }}
            >
              <img src={logo} alt="" draggable={false} className="h-[18px] w-[18px]" />
              {markerNumber != null && (
                <span
                  className="absolute -bottom-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full border-[1.5px] border-white px-1 text-[9px] font-bold leading-none text-white shadow"
                  style={{ backgroundColor: "#18181b" }}
                >
                  {markerNumber}
                </span>
              )}
            </button>

            <button
              type="button"
              aria-label="Remove annotation"
              onClick={() => removeAnnotation(annotation)}
              className="absolute -right-1 -top-1 z-10 flex h-4 w-4 cursor-pointer items-center justify-center rounded-full border border-zinc-950 bg-zinc-100 text-zinc-950 shadow hover:bg-white"
            >
              <X size={11} />
            </button>

            {isActive && (
              <div
                className={`absolute overflow-hidden rounded-xl border ${composerClassName}`}
                style={composerPositionStyle}
              >
                <Button
                  variant="icon"
                  size="icon-md"
                  onClick={() => setActiveAnnotationId(null)}
                  title="Close"
                  className={`absolute right-3 top-3 z-10 rounded-full ${
                    isDark
                      ? "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                      : "text-slate-500 hover:bg-slate-100 hover:text-slate-950"
                  }`}
                >
                  <X size={17} />
                </Button>
                <div>
                  <div className={`flex items-center gap-3 border-b px-4 py-3 ${headerClassName}`}>
                    <div
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                      style={{ backgroundColor: markerColor }}
                    >
                      {initial}
                    </div>
                    <div className="min-w-0 pr-8">
                      <p className="truncate text-sm font-semibold leading-tight">{composerName}</p>
                    </div>
                  </div>

                  <textarea
                    ref={textareaRef}
                    autoFocus
                    value={noteDraft}
                    onChange={(event) => {
                      setNoteDraft(event.target.value);
                      setSavedId(null);
                    }}
                    placeholder="What's new?"
                    className={`ek-scroll min-h-28 max-h-40 w-full resize-none overflow-y-auto bg-transparent px-4 py-3 text-sm leading-relaxed outline-none ${textareaClassName}`}
                  />

                  <div className={`flex items-center justify-between border-t px-3 py-2.5 ${footerClassName}`}>
                    <div className="flex items-center gap-1">
                      {FORMAT_ACTIONS.map((action) => (
                        <Button
                          key={action.title}
                          variant="icon"
                          size="icon-lg"
                          title={action.title}
                          onMouseDown={(event) => {
                            event.preventDefault();
                            applyFormat(action.prefix, action.suffix);
                          }}
                          className={`h-8 w-8 ${toolButtonClassName}`}
                        >
                          {action.icon}
                        </Button>
                      ))}
                    </div>
                    <Button
                      variant="primary"
                      size="md"
                      onClick={() => saveNote(annotation)}
                      disabled={isSaving}
                      title={isSaving ? "Saving" : isSaved ? "Saved" : "Save"}
                      className={
                        isSaved
                          ? "!bg-green-600 !text-white hover:!bg-green-600 active:!bg-green-700"
                          : undefined
                      }
                    >
                      {isSaving ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : isSaved ? (
                        <Check size={14} />
                      ) : (
                        <Save size={14} />
                      )}
                      {isSaving ? "Saving" : isSaved ? "Saved" : "Save"}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

function getCurrentTargetUrl(): string {
  return location.href;
}

function getViewportCenterPoint(): ContextPoint {
  const clientX = window.innerWidth / 2;
  const clientY = window.innerHeight / 2;
  const pageX = window.scrollX + clientX;
  const pageY = window.scrollY + clientY;
  return { x: pageX, y: pageY, ...computeAnchor(clientX, clientY, pageX, pageY) };
}
