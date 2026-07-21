import { X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import logo from "../../assets/logo-remade-red-white.svg";
import { AnnotationAvatar } from "../../components/annotations/AnnotationAvatar";
import { MarkdownAnnotationEditor } from "../../components/annotations/MarkdownAnnotationEditor";
import { Button } from "../../components/shared/Button";
import { useAnnotationAnchors } from "../../hooks/use-annotation-anchors";
import { useAnnotationMarkerPositioning } from "../../hooks/use-annotation-marker-positioning";
import { useTheme } from "../../hooks/use-resolved-theme";
import {
  type AnnotationContextPoint,
  captureAnnotationContextPoint,
} from "../../lib/annotation-anchors";
import { type Annotation, firestoreTimestampToMs } from "../../lib/annotations-api";
import { DEBUG, debugLog } from "../../lib/debug";
import { onMessage, sendMessage } from "../../lib/messaging";
import type { UserIdentity } from "../../lib/types";
import { identityColor } from "../../lib/utils";

const MARKER_SIZE = 32;
const COMPOSER_WIDTH = 320;
const COMPOSER_MARKER_GAP = 4;
const ANNOTATION_UPDATED_EVENT = "annotationUpdated";
const ANNOTATION_DELETED_EVENT = "annotationDeleted";
const TOGGLE_ANNOTATIONS_SHORTCUT = "a";
// Identity fallback stored with annotations when no user label is available.
const DEFAULT_ANNOTATION_COLOR = "#18181b";

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

interface AnnotationLayerProps {
  annotationsHidden?: boolean;
}

export function AnnotationLayer({ annotationsHidden }: AnnotationLayerProps) {
  const theme = useTheme();
  const [hidden, setHidden] = useState(false);
  const [currentUser, setCurrentUser] = useState<UserIdentity>({
    label: null,
    avatarUrl: null,
  });
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [targetUrl, setTargetUrl] = useState(getCurrentTargetUrl);
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [savedId, setSavedId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const lastContextMenuPoint = useRef<AnnotationContextPoint | null>(null);
  const activeAnnotationIdRef = useRef<string | null>(null);
  const refreshInFlightRef = useRef(false);
  const { anchors, visibility: anchorVisibility } = useAnnotationAnchors(annotations, targetUrl);
  const setMarkerElement = useAnnotationMarkerPositioning(annotations, anchors);

  const refreshAnnotations = useCallback(async () => {
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
  }, []);

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
    if (annotationsHidden !== undefined) setHidden(annotationsHidden);
  }, [annotationsHidden]);

  useEffect(() => {
    let cancelled = false;

    const refreshIdentity = async () => {
      try {
        const identity = await sendMessage("getCurrentUser", undefined);
        if (!cancelled) {
          setCurrentUser(identity);
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
  }, [refreshAnnotations]);

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
        const createdBy = (await sendMessage("getCurrentUser", undefined)).label ?? undefined;
        const color = createdBy ? identityColor(createdBy) : DEFAULT_ANNOTATION_COLOR;
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

  const saveNote = async (annotation: Annotation, markdown = noteDraft) => {
    if (savingId === annotation.id) return;
    setSavingId(annotation.id);
    setSavedId(null);
    try {
      const response = await sendMessage("updateAnnotation", {
        id: annotation.id,
        payload: { note: markdown.trim() || null },
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
        const isSaved = savedId === annotation.id;
        const markerNumber = markerNumbers.get(annotation.id);
        const composerName = currentUser.label || annotation.createdBy || "Annotation";
        return (
          <div
            key={annotation.id}
            ref={setMarkerElement}
            data-annotation-id={annotation.id}
            className={`group fixed ${isActive ? "z-[101]" : "z-[100]"}`}
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
              className="flex h-[32px] w-[32px] cursor-pointer select-none items-center justify-center rounded-full bg-annotation-marker shadow-lg transition-transform hover:scale-105"
            >
              <img src={logo} alt="" draggable={false} className="h-[18px] w-[18px]" />
              {annotations.length > 1 && markerNumber != null && (
                <span className="absolute -bottom-[4px] -right-[4px] flex h-[16px] min-w-[16px] items-center justify-center rounded-full border-[1.5px] border-annotation-marker-foreground bg-annotation-marker px-[4px] text-[9px] font-bold leading-none text-annotation-marker-foreground shadow">
                  {markerNumber}
                </span>
              )}
            </button>

            <button
              type="button"
              aria-label="Remove annotation"
              onClick={() => removeAnnotation(annotation)}
              className="absolute -right-[4px] -top-[4px] z-10 flex h-[16px] w-[16px] cursor-pointer items-center justify-center rounded-full border border-annotation-marker bg-annotation-marker-foreground p-0 leading-none text-annotation-marker opacity-0 shadow transition-opacity hover:bg-annotation-marker-foreground focus-visible:opacity-100 group-hover:opacity-100"
            >
              <X size={11} className="block h-[11px] w-[11px] shrink-0" />
            </button>

            {isActive && (
              <div
                data-annotation-composer
                data-theme={theme}
                className="absolute overflow-hidden rounded-xl border border-border bg-background text-foreground shadow-2xl"
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
                  className="absolute right-3 top-3 z-10 rounded-full text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                >
                  <X size={17} />
                </Button>
                <div>
                  <div className="flex items-center gap-3 border-b border-border bg-background px-4 py-3">
                    <AnnotationAvatar avatarUrl={currentUser.avatarUrl} label={composerName} />
                    <div className="min-w-0 pr-8">
                      <p className="truncate text-sm font-semibold leading-tight">{composerName}</p>
                    </div>
                  </div>

                  <MarkdownAnnotationEditor
                    compact
                    autoFocus
                    content={noteDraft}
                    saved={isSaved}
                    onChange={(markdown) => {
                      setNoteDraft(markdown);
                      setSavedId(null);
                    }}
                    onSave={(markdown) => saveNote(annotation, markdown)}
                    onDelete={() => removeAnnotation(annotation)}
                  />
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
