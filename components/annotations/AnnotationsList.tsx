import { Eye, EyeOff, MapPin, Search, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useStorageItem } from "../../hooks/use-storage-item";
import {
  firestoreTimestampToMs,
  listAnnotations,
  type Annotation,
} from "../../lib/annotations-api";
import { runWithTokenRetry } from "../../lib/auth";
import { sendMessage } from "../../lib/messaging";
import { pageUrlStorage, userPrefs } from "../../lib/storage";
import type { UserPrefs } from "../../lib/types";
import { Button } from "../shared/Button";
import logo from "../../assets/ek-alt-blue.svg";

interface Props {
  onSelectMarker: (id: string) => void;
}

type AnnotationGroup = { url: string; annotations: Annotation[] };
type Tab = "current" | "all";

function formatDate(annotation: Annotation): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(firestoreTimestampToMs(annotation.createdAt)));
}

const PAGE_SIZE = 50;
const ANNOTATION_UPDATED_EVENT = "eurykaAnnotationUpdated";
const ANNOTATION_DELETED_EVENT = "eurykaAnnotationDeleted";

function filterBySearch(annotations: Annotation[], term: string): Annotation[] {
  if (!term.trim()) return annotations;
  const words = term.toLowerCase().split(/\s+/).filter(Boolean);
  return annotations.filter((annotation) => {
    const haystack = [annotation.note ?? "", annotation.selectedText ?? ""].join(" ").toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}

function buildAnnotationNumbers(annotations: Annotation[]): Map<string, number> {
  const byUrl = new Map<string, Annotation[]>();
  for (const annotation of annotations) {
    if (!byUrl.has(annotation.targetUrl)) byUrl.set(annotation.targetUrl, []);
    byUrl.get(annotation.targetUrl)!.push(annotation);
  }

  const result = new Map<string, number>();
  for (const groupAnnotations of byUrl.values()) {
    [...groupAnnotations]
      .sort((a, b) => firestoreTimestampToMs(a.createdAt) - firestoreTimestampToMs(b.createdAt))
      .forEach((annotation, index) => result.set(annotation.id, index + 1));
  }
  return result;
}

export function AnnotationsList({ onSelectMarker }: Props) {
  const [storedPageUrl] = useStorageItem(pageUrlStorage);
  const [prefs, setPrefs] = useStorageItem(userPrefs);
  const typedPrefs = prefs as UserPrefs | undefined;
  const [tab, setTab] = useState<Tab>(typedPrefs?.annotationsTab ?? "current");
  const [searchTerm, setSearchTerm] = useState("");
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const pageUrl = typeof storedPageUrl === "string" ? storedPageUrl : "";
  const hidden = typedPrefs?.annotationsHidden ?? false;

  useEffect(() => {
    if (!typedPrefs?.annotationsTab) return;
    setTab(typedPrefs.annotationsTab);
  }, [typedPrefs?.annotationsTab]);

  const fetchAnnotations = useCallback(
    async (cursor?: string) => {
      if (tab === "current" && !pageUrl) {
        return { annotations: [], nextCursor: null };
      }

      return runWithTokenRetry((token) =>
        listAnnotations(token, {
          targetUrl: tab === "current" ? pageUrl : undefined,
          limit: PAGE_SIZE,
          cursor,
        })
      );
    },
    [pageUrl, tab]
  );

  useEffect(() => {
    let cancelled = false;
    setAnnotations([]);
    setNextCursor(null);
    setIsLoading(true);
    fetchAnnotations()
      .then((response) => {
        if (cancelled) return;
        setAnnotations(response.annotations);
        setNextCursor(response.nextCursor ?? null);
      })
      .catch(() => {
        if (cancelled) return;
        setAnnotations([]);
        setNextCursor(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchAnnotations]);

  useEffect(() => {
    const handleUpdate = (event: Event) => {
      const next = (event as CustomEvent<Annotation>).detail;

      setAnnotations((current) => {
        const index = current.findIndex((annotation) => annotation.id === next.id);
        if (index < 0) {
          if (tab === "current" && pageUrl && next.targetUrl !== pageUrl) return current;
          return [next, ...current];
        }
        return current.map((annotation) => (annotation.id === next.id ? next : annotation));
      });
    };

    const handleDelete = (event: Event) => {
      const deletedId = (event as CustomEvent<string>).detail;
      setAnnotations((current) => current.filter((annotation) => annotation.id !== deletedId));
    };

    window.addEventListener(ANNOTATION_UPDATED_EVENT, handleUpdate);
    window.addEventListener(ANNOTATION_DELETED_EVENT, handleDelete);
    return () => {
      window.removeEventListener(ANNOTATION_UPDATED_EVENT, handleUpdate);
      window.removeEventListener(ANNOTATION_DELETED_EVENT, handleDelete);
    };
  }, [pageUrl, tab]);

  const loadMore = async () => {
    if (!nextCursor) return;
    setIsLoadingMore(true);
    try {
      const response = await fetchAnnotations(nextCursor);
      setAnnotations((current) => [...current, ...response.annotations]);
      setNextCursor(response.nextCursor ?? null);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const filteredAnnotations = useMemo(
    () => filterBySearch(annotations, searchTerm),
    [annotations, searchTerm]
  );

  const annotationNumbers = useMemo(() => buildAnnotationNumbers(annotations), [annotations]);

  const allGroups = useMemo<AnnotationGroup[]>(() => {
    const byUrl = new Map<string, Annotation[]>();
    for (const annotation of filteredAnnotations) {
      if (!byUrl.has(annotation.targetUrl)) byUrl.set(annotation.targetUrl, []);
      byUrl.get(annotation.targetUrl)!.push(annotation);
    }
    return Array.from(byUrl.entries())
      .map(([url, groupAnnotations]) => ({ url, annotations: groupAnnotations }))
      .sort(
        (a, b) =>
          firestoreTimestampToMs(b.annotations[0].createdAt) -
          firestoreTimestampToMs(a.annotations[0].createdAt)
      );
  }, [filteredAnnotations]);

  const noSearchResults = searchTerm.trim() !== "" && filteredAnnotations.length === 0;
  const hasAny = annotations.length > 0;

  const deleteItem = async (annotation: Annotation) => {
    await sendMessage("deleteAnnotation", { id: annotation.id });
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "current", label: "Current" },
    { key: "all", label: "All" },
  ];

  const selectTab = (nextTab: Tab) => {
    setTab(nextTab);
    void setPrefs((current) => ({
      ...current!,
      annotationsTab: nextTab,
    }));
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2">
        <div className="flex items-center gap-0.5">
          {tabs.map(({ key, label }) => (
            <Button
              key={key}
              variant={tab === key ? "secondary" : "ghost"}
              size="sm"
              onClick={() => selectTab(key)}
              className={
                tab === key
                  ? "bg-muted text-foreground"
                  : "hover:bg-transparent hover:text-foreground/70"
              }
            >
              {label}
            </Button>
          ))}
        </div>

        <Button
          variant="icon"
          size="icon-md"
          title={
            hidden
              ? "Show annotations on page (Alt+Shift+A)"
              : "Hide annotations on page (Alt+Shift+A)"
          }
          aria-label={hidden ? "Show annotations on page" : "Hide annotations on page"}
          onClick={() =>
            setPrefs((current) => {
              const currentPrefs = current as UserPrefs | undefined;
              return { ...currentPrefs!, annotationsHidden: !currentPrefs?.annotationsHidden };
            })
          }
          className={hidden ? "text-muted-foreground/40 hover:text-muted-foreground" : undefined}
        >
          {hidden ? <EyeOff size={14} /> : <Eye size={14} />}
        </Button>
      </div>

      {hasAny && (
        <div className="shrink-0 border-b border-border px-3 py-2">
          <div className="flex h-9 items-center gap-2 rounded bg-muted px-2">
            <Search size={13} className="shrink-0 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search notes..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="h-full min-w-0 flex-1 bg-transparent text-xs leading-none text-foreground outline-none placeholder:text-muted-foreground"
            />
            {searchTerm && (
              <Button
                variant="icon"
                size="icon-sm"
                onClick={() => setSearchTerm("")}
                className="shrink-0"
              >
                <X size={12} />
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {isLoading ? (
          <AnnotationsLoadingState />
        ) : !hasAny ? (
          <EmptyState
            message={tab === "current" ? "No annotations on this page" : "No annotations yet"}
            hint={
              tab === "current"
                ? "Right-click anywhere on the page to add one."
                : "Right-click a page and choose Annotate with Euryka to place one."
            }
          />
        ) : noSearchResults ? (
          <p className="py-8 text-center text-xs italic text-muted-foreground">
            No annotations match "{searchTerm}"
          </p>
        ) : tab === "current" ? (
          <div className="flex flex-col gap-2">
            <AnnotationListItems
              annotations={filteredAnnotations}
              annotationNumbers={annotationNumbers}
              onSelectAnnotation={onSelectMarker}
              onDeleteAnnotation={deleteItem}
            />
            {nextCursor && <LoadMoreButton isLoading={isLoadingMore} onClick={loadMore} />}
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {allGroups.map((group) => (
              <div key={group.url} className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => chrome.tabs.create({ url: group.url })}
                  className="min-w-0 truncate text-left text-xs font-medium text-muted-foreground underline-offset-2 transition-all hover:text-accent-foreground hover:underline active:opacity-60"
                  title={group.url}
                >
                  {group.url}
                </button>
                <AnnotationListItems
                  annotations={group.annotations}
                  annotationNumbers={annotationNumbers}
                  onSelectAnnotation={onSelectMarker}
                  onDeleteAnnotation={deleteItem}
                />
              </div>
            ))}
            {nextCursor && <LoadMoreButton isLoading={isLoadingMore} onClick={loadMore} />}
          </div>
        )}
      </div>
    </div>
  );
}

function LoadMoreButton({ isLoading, onClick }: { isLoading: boolean; onClick: () => void }) {
  return (
    <Button variant="ghost" size="sm" onClick={onClick} disabled={isLoading} className="w-full">
      {isLoading ? "Loading..." : "Load more"}
    </Button>
  );
}

function EmptyState({ message, hint }: { message: string; hint: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-card text-muted-foreground">
        <MapPin size={18} />
      </div>
      <p className="text-sm font-medium text-foreground/70">{message}</p>
      <p className="max-w-56 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function AnnotationsLoadingState() {
  return (
    <div className="flex flex-col gap-2">
      {[72, 82, 76, 88, 70].map((width, index) => (
        <div
          key={width + index}
          className="flex items-start gap-3 rounded-md border border-border bg-card/70 px-3 py-2.5"
        >
          <div className="mt-0.5 h-6 w-6 shrink-0 animate-pulse rounded-full bg-muted" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3 animate-pulse rounded bg-muted" style={{ width: `${width}px` }} />
            <div className="h-3 w-2/3 animate-pulse rounded bg-muted/80" />
          </div>
        </div>
      ))}
    </div>
  );
}

function AnnotationListItems({
  annotations,
  annotationNumbers,
  onSelectAnnotation,
  onDeleteAnnotation,
}: {
  annotations: Annotation[];
  annotationNumbers: Map<string, number>;
  onSelectAnnotation: (id: string) => void;
  onDeleteAnnotation: (annotation: Annotation) => void;
}) {
  return (
    <div className="flex flex-col gap-px">
      {annotations.map((annotation) => {
        const markerNumber = annotationNumbers.get(annotation.id);
        const metaParts = [
          annotation.selectedText ? `"${annotation.selectedText}"` : null,
          formatDate(annotation),
        ]
          .filter(Boolean)
          .join(" - ");

        return (
          <div
            key={annotation.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelectAnnotation(annotation.id)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              onSelectAnnotation(annotation.id);
            }}
            className="group flex h-[58px] w-full cursor-pointer items-center gap-3 rounded-lg border border-transparent px-3 text-left transition-all hover:border-border/60 hover:bg-card active:scale-[0.99] active:bg-muted/60"
          >
            <span
              className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-950 text-[11px] font-bold text-white"
              title={annotation.createdBy}
            >
              <img src={logo} alt="" draggable={false} className="h-3.5 w-3.5" />
              {markerNumber != null && (
                <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full border border-card bg-zinc-950 px-0.5 text-[8px] font-bold leading-none text-white">
                  {markerNumber}
                </span>
              )}
            </span>

            <div className="min-w-0 flex-1 flex flex-col justify-center gap-0.5">
              <div
                className={`truncate text-sm leading-tight ${annotation.note?.trim() ? "text-foreground/85" : "italic text-muted-foreground/50"}`}
              >
                {annotation.note?.trim() ? (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      p: ({ children }) => <span>{children}</span>,
                      h1: ({ children }) => <span className="font-semibold">{children} </span>,
                      h2: ({ children }) => <span className="font-semibold">{children} </span>,
                      h3: ({ children }) => <span className="font-semibold">{children} </span>,
                      ul: ({ children }) => <span>{children}</span>,
                      ol: ({ children }) => <span>{children}</span>,
                      li: ({ children }) => <span>{children} </span>,
                    }}
                  >
                    {annotation.note}
                  </ReactMarkdown>
                ) : (
                  "No note - click to add one"
                )}
              </div>
              <span className="min-w-0 truncate text-[11px] text-muted-foreground/45">
                {metaParts}
              </span>
            </div>

            <Button
              variant="destructive"
              size="icon-sm"
              title="Delete annotation"
              aria-label="Delete annotation"
              onClick={(event) => {
                event.stopPropagation();
                onDeleteAnnotation(annotation);
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                event.stopPropagation();
                onDeleteAnnotation(annotation);
              }}
              className="shrink-0 opacity-0 group-hover:opacity-100"
            >
              <Trash2 size={12} />
            </Button>
          </div>
        );
      })}
    </div>
  );
}
