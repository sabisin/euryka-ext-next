import { Bold, Check, Italic, List, Loader2, Save, Strikethrough, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { firestoreTimestampToMs, type Annotation } from "../../lib/annotations-api";
import {
  captureAnnotationContextPoint,
  type AnnotationContextPoint,
} from "../../lib/annotation-anchors";
import { onMessage, sendMessage } from "../../lib/messaging";
import { DEBUG, debugLog } from "../../lib/debug";
import type { UserPrefs } from "../../lib/types";
import { identityColor, identityInitial } from "../../lib/utils";
import { Button } from "../../components/shared/Button";
import { useAnnotationAnchors } from "../../hooks/use-annotation-anchors";
import { useAnnotationMarkerPositioning } from "../../hooks/use-annotation-marker-positioning";
import logo from "../../assets/ek-alt-blue.svg";

type ResolvedTheme = "dark" | "light";

const MARKER_SIZE = 32;
const COMPOSER_WIDTH = 320;
const COMPOSER_MARKER_GAP = 4;
const FORMAT_ACTIONS = [
  { icon: <Bold size={13} />, title: "Bold", prefix: "**", suffix: "**" },
  { icon: <Italic size={13} />, title: "Italic", prefix: "_", suffix: "_" },
  { icon: <Strikethrough size={13} />, title: "Strikethrough", prefix: "~~", suffix: "~~" },
  { icon: <List size={13} />, title: "Bullet list", prefix: "\n- ", suffix: "" },
] as const;
const ANNOTATION_UPDATED_EVENT = "annotationUpdated";
const ANNOTATION_DELETED_EVENT = "annotationDeleted";
const TOGGLE_ANNOTATIONS_SHORTCUT = "a";

const debugAnnotations = debugLog("[Euryka annotations]");

function summarizeAnnotationSelector(annotation: Annotation) {
  const selector = annotation.selector;
  return {
    id: annotation.id,
    hasTextAnchor: Boolean(selector.textParentXPath),
    hasContainerAnchor: Boolean(selector.containerId || selector.containerXPath),
    hasSelectedText: Boolean(annotation.selectedText),
  };
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

export function AnnotationLayer() {
  const [hidden, setHidden] = useState(false);
  const [theme, setTheme] = useState<ResolvedTheme>("dark");
  const [myIdentity, setMyIdentity] = useState<string | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [targetUrl, setTargetUrl] = useState(getCurrentTargetUrl);
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [savedId, setSavedId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const lastContextMenuPoint = useRef<AnnotationContextPoint | null>(null);
  const activeAnnotationIdRef = useRef<string | null>(null);
  const refreshInFlightRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { anchors, visibility: anchorVisibility } = useAnnotationAnchors(
    annotations,
    targetUrl
  );
  const setMarkerElement = useAnnotationMarkerPositioning(annotations, anchors);

  const refreshAnnotations = async () => {
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    const targetUrl = getCurrentTargetUrl();
    try {
      const results: Annotation[] = [];
      let cursor: string | undefined;

      do {
        const response = await sendMessage("listAnnotations", {
          targetUrl,
          limit: 100,
          cursor,
        });
        results.push(...response.annotations);
        cursor = response.nextCursor ?? undefined;
      } while (cursor);

      // An SPA navigation may have happened while the request was in flight —
      // don't apply results that belong to the previous URL.
      if (getCurrentTargetUrl() !== targetUrl) return;

      setAnnotations(results);
      if (DEBUG) {
        debugAnnotations(
          "Loaded annotation anchor diagnostics",
          results.map(summarizeAnnotationSelector)
        );
      }
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
        const prefs = (await sendMessage("getUserPrefs", undefined)) as UserPrefs | undefined;
        if (cancelled) return;
        setHidden((current) => {
          const next = prefs?.annotationsHidden ?? false;
          return current === next ? current : next;
        });
        if (prefs?.theme === "dark" || prefs?.theme === "light") {
          const nextTheme = prefs.theme;
          setTheme((current) => (current === nextTheme ? current : nextTheme));
        } else {
          const nextTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light";
          setTheme((current) => (current === nextTheme ? current : nextTheme));
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
          setMyIdentity((current) => (current === identity ? current : identity));
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
        return current.map((annotation) => (annotation.id === next.id ? next : annotation));
      });
    });

    const cleanupDeleted = onMessage(ANNOTATION_DELETED_EVENT, ({ data }) => {
      setAnnotations((current) => current.filter((annotation) => annotation.id !== data.id));
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

    // SPA navigations (pushState/replaceState) change the URL without any
    // visibility/focus event, leaving the previous page's markers on screen.
    // Poll the URL (history events alone miss pushState) and reload on change.
    let lastUrl = getCurrentTargetUrl();
    const handleUrlChange = () => {
      const nextUrl = getCurrentTargetUrl();
      if (nextUrl === lastUrl) return;
      lastUrl = nextUrl;
      setTargetUrl(nextUrl);
      setAnnotations([]);
      setActiveAnnotationId(null);
      setNoteDraft("");
      void refreshAnnotations();
    };
    const urlInterval = window.setInterval(handleUrlChange, 1_000);
    window.addEventListener("popstate", handleUrlChange);
    window.addEventListener("hashchange", handleUrlChange);

    return () => {
      document.removeEventListener("visibilitychange", refreshOnVisible);
      window.removeEventListener("focus", refreshOnVisible);
      window.clearInterval(urlInterval);
      window.removeEventListener("popstate", handleUrlChange);
      window.removeEventListener("hashchange", handleUrlChange);
    };
  }, []);

  useEffect(() => {
    const captureContextMenuPoint = (event: MouseEvent) => {
      lastContextMenuPoint.current = captureAnnotationContextPoint(
        event.clientX,
        event.clientY,
        event.pageX,
        event.pageY
      );
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
        const response = await sendMessage("createAnnotation", {
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
        });

        setAnnotations((current) => [...current, response.annotation]);
        if (DEBUG) {
          debugAnnotations("Created annotation", {
            id: response.annotation.id,
            targetUrl: response.annotation.targetUrl,
            captured: {
              hasTextAnchor: Boolean(point.textParentXPath),
              hasContainerAnchor: Boolean(point.containerId || point.containerXPath),
              hasSelectedText: Boolean(point.selectedText),
            },
            returned: summarizeAnnotationSelector(response.annotation),
          });
        }
        setNoteDraft("");
      } catch (error) {
        debugAnnotations("Failed to create annotation", error);
      }
    });

    return cleanup;
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
        current.map((item) => (item.id === annotation.id ? response.annotation : item))
      );
      setSavedId(annotation.id);
      setTimeout(() => setSavedId(null), 2000);
    } catch (error) {
      debugAnnotations("Failed to save annotation note", error);
    } finally {
      setSavingId((current) => (current === annotation.id ? null : current));
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
        if (anchorVisibility.get(annotation.id) === false) return null;
        const isActive = annotation.id === activeAnnotationId;
        const isSaving = savingId === annotation.id;
        const isSaved = savedId === annotation.id;
        const markerNumber = markerNumbers.get(annotation.id);
        const markerColor = annotation.color ?? identityColor(annotation.createdBy);
        const initial = identityInitial(myIdentity ?? annotation.createdBy);
        const composerName = myIdentity || "Annotation";
        const isDark = theme === "dark";
        const composerClassName = isDark
          ? "border-zinc-700 bg-zinc-950 text-zinc-100 shadow-2xl"
          : "border-zinc-200 bg-white text-zinc-950 shadow-2xl";
        const headerClassName = isDark ? "border-zinc-800" : "border-zinc-200";
        const textareaClassName = isDark
          ? "text-zinc-100 placeholder:text-zinc-500"
          : "text-zinc-950 placeholder:text-slate-400";
        const footerClassName = isDark
          ? "border-zinc-800 bg-zinc-950"
          : "border-zinc-200 bg-slate-50";
        const toolButtonClassName = isDark
          ? "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          : "text-slate-600 hover:bg-slate-200 hover:text-slate-950";

        return (
          <div
            key={annotation.id}
            ref={setMarkerElement}
            data-annotation-id={annotation.id}
            className={`fixed ${isActive ? "z-[101]" : "z-[100]"}`}
            style={{
              left: 0,
              top: 0,
              transform: `translate3d(${annotation.selector.x - window.scrollX - MARKER_SIZE / 2}px, ${annotation.selector.y - window.scrollY - MARKER_SIZE / 2}px, 0)`,
              width: `${MARKER_SIZE}px`,
              height: `${MARKER_SIZE}px`,
              pointerEvents: "auto",
            }}
          >
            <button
              type="button"
              aria-label="Open annotation"
              onClick={() => openEditor(annotation)}
              className="flex h-[32px] w-[32px] cursor-pointer select-none items-center justify-center rounded-full shadow-lg transition-transform hover:scale-105"
              style={{ backgroundColor: "#18181b" }}
            >
              <img
                src={logo}
                alt=""
                draggable={false}
                className="h-[18px] w-[18px] translate-x-0.5"
              />
              {markerNumber != null && (
                <span
                  className="absolute -bottom-[4px] -right-[4px] flex h-[16px] min-w-[16px] items-center justify-center rounded-full border-[1.5px] border-white px-[4px] text-[9px] font-bold leading-none text-white shadow"
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
              className="absolute -right-[4px] -top-[4px] z-10 flex h-[16px] w-[16px] cursor-pointer items-center justify-center rounded-full border border-zinc-950 p-0 leading-none text-zinc-950 shadow hover:bg-white"
              style={{ backgroundColor: "#f4f4f5" }}
            >
              <X size={11} className="block h-[11px] w-[11px] shrink-0" />
            </button>

            {isActive && (
              <div
                data-annotation-composer
                className={`absolute overflow-hidden rounded-xl border ${composerClassName}`}
                style={{
                  left: `${MARKER_SIZE + COMPOSER_MARKER_GAP}px`,
                  top: 0,
                  width: `${COMPOSER_WIDTH}px`,
                }}
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

                  <div
                    className={`flex items-center justify-between border-t px-3 py-2.5 ${footerClassName}`}
                  >
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

function getViewportCenterPoint(): AnnotationContextPoint {
  const clientX = window.innerWidth / 2;
  const clientY = window.innerHeight / 2;
  const pageX = window.scrollX + clientX;
  const pageY = window.scrollY + clientY;
  return captureAnnotationContextPoint(clientX, clientY, pageX, pageY);
}
