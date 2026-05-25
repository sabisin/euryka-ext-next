import { ArrowLeft, Bold, Check, ChevronDown, Eye, Heading1, Heading2, Heading3, Italic, List, Pencil, Pilcrow, Save, Strikethrough, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import { useStorageItem } from "../../hooks/use-storage-item";
import {
  firestoreTimestampToMs,
  getAnnotation,
  type Annotation,
} from "../../lib/annotations-api";
import { runWithTokenRetry } from "../../lib/auth";
import { sendMessage } from "../../lib/messaging";
import { userPrefs } from "../../lib/storage";
import type { UserPrefs } from "../../lib/types";
import { Button } from "../shared/Button";

interface Props {
  markerId: string;
  onBack: () => void;
}

interface HeaderTitleProps {
  markerId: string;
  onBack: () => void;
}

const FORMAT_ACTIONS = [
  { icon: <Bold size={13} />, title: "Bold", prefix: "**", suffix: "**" },
  { icon: <Italic size={13} />, title: "Italic", prefix: "_", suffix: "_" },
  { icon: <Strikethrough size={13} />, title: "Strikethrough", prefix: "~~", suffix: "~~" },
] as const;

const BLOCK_FORMATS = [
  { value: "normal", label: "Normal text", prefix: "", icon: <Pilcrow size={13} /> },
  { value: "h1", label: "Heading 1", prefix: "# ", icon: <Heading1 size={13} /> },
  { value: "h2", label: "Heading 2", prefix: "## ", icon: <Heading2 size={13} /> },
  { value: "h3", label: "Heading 3", prefix: "### ", icon: <Heading3 size={13} /> },
] as const;

const PREVIEW_TEXT_SIZES = [
  { value: "sm", label: "A", className: "prose-sm text-sm" },
  { value: "md", label: "A", className: "prose-base text-base" },
  { value: "lg", label: "A", className: "prose-lg text-lg" },
] as const;

const ANNOTATION_UPDATED_EVENT = "eurykaAnnotationUpdated";
const ANNOTATION_DELETED_EVENT = "eurykaAnnotationDeleted";

export function AnnotationHeaderTitle({ markerId, onBack }: HeaderTitleProps) {
  const [annotation, setAnnotation] = useState<Annotation | null>(null);

  useEffect(() => {
    let cancelled = false;
    runWithTokenRetry((token) => getAnnotation(token, markerId))
      .then(({ annotation }) => {
        if (!cancelled) setAnnotation(annotation);
      })
      .catch(() => {
        if (!cancelled) setAnnotation(null);
      });
    return () => {
      cancelled = true;
    };
  }, [markerId]);

  useEffect(() => {
    const handleUpdate = (event: Event) => {
      const next = (event as CustomEvent<Annotation>).detail;
      if (next.id === markerId) setAnnotation(next);
    };
    const handleDelete = (event: Event) => {
      const deletedId = (event as CustomEvent<string>).detail;
      if (deletedId === markerId) setAnnotation(null);
    };
    window.addEventListener(ANNOTATION_UPDATED_EVENT, handleUpdate);
    window.addEventListener(ANNOTATION_DELETED_EVENT, handleDelete);
    return () => {
      window.removeEventListener(ANNOTATION_UPDATED_EVENT, handleUpdate);
      window.removeEventListener(ANNOTATION_DELETED_EVENT, handleDelete);
    };
  }, [markerId]);

  return (
    <div className="flex min-w-0 items-center gap-3">
      <Button
        variant="icon"
        size="icon-md"
        onClick={onBack}
        className="shrink-0"
      >
        <ArrowLeft size={15} />
      </Button>

      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground leading-tight">
          {annotation?.note?.trim()
            ? annotation.note.split("\n")[0].replace(/[*_~`#]/g, "").slice(0, 50)
            : "New annotation"}
        </p>
        {annotation && (
          <p className="truncate text-[11px] text-muted-foreground/60 leading-tight mt-0.5">
            {formatDate(annotation)}
            {annotation.selectedText ? ` - "${annotation.selectedText}"` : ""}
          </p>
        )}
      </div>
    </div>
  );
}

export function AnnotationView({ markerId, onBack }: Props) {
  const [prefs, setPrefs] = useStorageItem(userPrefs);
  const typedPrefs = prefs as UserPrefs | undefined;
  const previewTextSize = typedPrefs?.annotationPreviewTextSize ?? "sm";
  const previewTextSizeClassName =
    PREVIEW_TEXT_SIZES.find((size) => size.value === previewTextSize)?.className ??
    PREVIEW_TEXT_SIZES[0].className;
  const [annotation, setAnnotation] = useState<Annotation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [isPreview, setIsPreview] = useState(false);
  const [isBlockMenuOpen, setIsBlockMenuOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    runWithTokenRetry((token) => getAnnotation(token, markerId))
      .then(({ annotation }) => {
        if (cancelled) return;
        setAnnotation(annotation);
        setDraft(annotation.note ?? "");
        setSaved(false);
      })
      .catch(() => {
        if (cancelled) return;
        setAnnotation(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [markerId]);

  useEffect(() => {
    const handleUpdate = (event: Event) => {
      const next = (event as CustomEvent<Annotation>).detail;
      if (next.id !== markerId) return;
      setAnnotation(next);
      setDraft(next.note ?? "");
      setSaved(true);
    };

    const handleDelete = (event: Event) => {
      const deletedId = (event as CustomEvent<string>).detail;
      if (deletedId !== markerId) return;
      setAnnotation(null);
      onBack();
    };

    window.addEventListener(ANNOTATION_UPDATED_EVENT, handleUpdate);
    window.addEventListener(ANNOTATION_DELETED_EVENT, handleDelete);
    return () => {
      window.removeEventListener(ANNOTATION_UPDATED_EVENT, handleUpdate);
      window.removeEventListener(ANNOTATION_DELETED_EVENT, handleDelete);
    };
  }, [markerId, onBack]);

  const applyFormat = (prefix: string, suffix: string) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = draft.slice(start, end);
    const newValue = draft.slice(0, start) + prefix + selected + suffix + draft.slice(end);
    setDraft(newValue);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + prefix.length, end + prefix.length);
    });
  };

  const applyBlockFormat = (prefix: string) => {
    const el = textareaRef.current;
    if (!el) return;

    const start = el.selectionStart;
    const end = el.selectionEnd;
    const lineStart = draft.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
    const nextLineBreak = draft.indexOf("\n", end);
    const lineEnd = nextLineBreak === -1 ? draft.length : nextLineBreak;
    const before = draft.slice(0, lineStart);
    const selectedBlock = draft.slice(lineStart, lineEnd);
    const after = draft.slice(lineEnd);
    const nextBlock = selectedBlock
      .split("\n")
      .map((line) => {
        const withoutHeading = line.replace(/^\s{0,3}#{1,6}\s+/, "");
        return withoutHeading.trim() ? `${prefix}${withoutHeading}` : withoutHeading;
      })
      .join("\n");
    const nextDraft = before + nextBlock + after;

    setDraft(nextDraft);
    setSaved(false);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(lineStart, lineStart + nextBlock.length);
    });
  };

  const selectBlockFormat = (prefix: string) => {
    setIsBlockMenuOpen(false);
    applyBlockFormat(prefix);
  };

  const applyListFormat = () => {
    const el = textareaRef.current;
    if (!el) return;

    const start = el.selectionStart;
    const end = el.selectionEnd;
    const lineStart = draft.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
    const nextLineBreak = draft.indexOf("\n", end);
    const lineEnd = nextLineBreak === -1 ? draft.length : nextLineBreak;
    const before = draft.slice(0, lineStart);
    const selectedBlock = draft.slice(lineStart, lineEnd);
    const after = draft.slice(lineEnd);
    const lines = selectedBlock.split("\n");
    const allListItems = lines
      .filter((line) => line.trim())
      .every((line) => /^\s*-\s+/.test(line));
    const nextBlock = lines
      .map((line) => {
        if (!line.trim()) return line;
        const withoutList = line.replace(/^\s*-\s+/, "");
        return allListItems ? withoutList : `- ${withoutList}`;
      })
      .join("\n");
    const nextDraft = before + nextBlock + after;

    setDraft(nextDraft);
    setSaved(false);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(lineStart, lineStart + nextBlock.length);
    });
  };

  const handleEditorShortcut = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!event.ctrlKey && !event.metaKey) return;
    if (event.altKey) return;

    const key = event.key.toLowerCase();
    if (key === "b") {
      event.preventDefault();
      applyFormat("**", "**");
      return;
    }
    if (key === "i") {
      event.preventDefault();
      applyFormat("_", "_");
      return;
    }
    if (key === "s") {
      event.preventDefault();
      void save();
      return;
    }
    if (key === "l") {
      event.preventDefault();
      applyListFormat();
      return;
    }
    if (key === "0") {
      event.preventDefault();
      applyBlockFormat("");
      return;
    }
    if (key === "1") {
      event.preventDefault();
      applyBlockFormat("# ");
      return;
    }
    if (key === "2") {
      event.preventDefault();
      applyBlockFormat("## ");
      return;
    }
    if (key === "3") {
      event.preventDefault();
      applyBlockFormat("### ");
    }
  };

  const save = async () => {
    if (!annotation) return;
    const response = await sendMessage("updateAnnotation", {
      id: annotation.id,
      payload: { note: draft.trim() || null },
    });
    setAnnotation(response.annotation);
    setDraft(response.annotation.note ?? "");
    setSaved(true);
  };

  const saveAndExitEditMode = async () => {
    setIsBlockMenuOpen(false);
    setIsPreview(true);
    await save();
  };

  const togglePreview = async () => {
    setIsBlockMenuOpen(false);
    if (isPreview) {
      setIsPreview(false);
      return;
    }

    await saveAndExitEditMode();
  };

  useEffect(() => {
    if (isPreview) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (textareaRef.current?.contains(target) || toolbarRef.current?.contains(target)) return;
      void saveAndExitEditMode();
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [isPreview, draft, annotation?.id]);

  const remove = async () => {
    if (!annotation) return;
    await sendMessage("deleteAnnotation", { id: annotation.id });
  };

  const enterEditMode = () => {
    setIsBlockMenuOpen(false);
    setIsPreview(false);
  };

  const setPreviewTextSize = (size: UserPrefs["annotationPreviewTextSize"]) => {
    void setPrefs((current) => ({
      ...current!,
      annotationPreviewTextSize: size,
    }));
  };

  if (isLoading) {
    return <div className="p-4 text-sm text-muted-foreground">Loading annotation...</div>;
  }

  if (!annotation) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
        <p className="text-sm">Annotation not found.</p>
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="h-auto px-0 py-0 text-xs underline hover:bg-transparent"
        >
          Go back
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2.5">
        <div ref={toolbarRef} className="flex w-full items-center justify-between">
          <div className="flex items-center gap-px">
            <Button
              variant="icon"
              size="icon-sm"
              title={isPreview ? "Edit" : "Preview"}
              onClick={() => void togglePreview()}
            >
              {isPreview ? <Pencil size={12} /> : <Eye size={12} />}
            </Button>

            {!isPreview &&
              <>
                <div className="relative mr-1 border-r border-border pr-2">
                  <Button
                    variant="icon"
                    size="icon-sm"
                    title="Text style"
                    aria-haspopup="menu"
                    aria-expanded={isBlockMenuOpen}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      setIsBlockMenuOpen((open) => !open);
                    }}
                    className="w-9 gap-0.5"
                  >
                    <Pilcrow size={13} />
                    <ChevronDown size={10} />
                  </Button>
                  {isBlockMenuOpen && (
                    <div className="absolute left-0 top-7 z-20 min-w-32 overflow-hidden rounded-md border border-border bg-popover py-1 text-popover-foreground shadow-lg">
                      {BLOCK_FORMATS.map((format) => (
                        <button
                          key={format.value}
                          type="button"
                          role="menuitem"
                          className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                          onMouseDown={(event) => {
                            event.preventDefault();
                            selectBlockFormat(format.prefix);
                          }}
                        >
                          {format.icon}
                          <span>{format.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {FORMAT_ACTIONS.map((action) => (
                  <Button
                    key={action.title}
                    variant="icon"
                    size="icon-sm"
                    title={action.title}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      applyFormat(action.prefix, action.suffix);
                    }}
                  >
                    {action.icon}
                  </Button>
                ))}
                <Button
                  variant="icon"
                  size="icon-sm"
                  title="Bullet list"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    applyListFormat();
                  }}
                >
                  <List size={13} />
                </Button>
              </>}
            {isPreview && (
              <div className="ml-1 flex items-center gap-px border-l border-border pl-2">
                {PREVIEW_TEXT_SIZES.map((size) => (
                  <Button
                    key={size.value}
                    variant={previewTextSize === size.value ? "secondary" : "icon"}
                    size="icon-sm"
                    title={`Preview text ${size.value}`}
                    onClick={() => setPreviewTextSize(size.value)}
                    className={
                      size.value === "sm"
                        ? "text-[10px]"
                        : size.value === "md"
                          ? "text-xs"
                          : "text-sm"
                    }
                  >
                    {size.label}
                  </Button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-px">
            <Button
              variant="icon"
              size="icon-sm"
              title={saved ? "Saved" : "Save"}
              onClick={save}
              disabled={saved}
              className={saved ? "text-green-400" : undefined}
            >
              {saved ? <Check size={12} /> : <Save size={12} />}
            </Button>
            <Button
              variant="destructive"
              size="icon-sm"
              title="Delete"
              onClick={remove}
            >
              <Trash2 size={12} />
            </Button>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="flex min-h-0 flex-1 px-4 py-4">
          {isPreview ? (
            <div
              className={`prose min-h-[360px] w-full max-w-none cursor-text rounded-md border border-border/70 bg-card/25 px-3 py-3 text-foreground/75 ${previewTextSizeClassName}`}
              onClick={enterEditMode}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                enterEditMode();
              }}
              role="button"
              tabIndex={0}
              title="Edit annotation"
            >
              {draft.trim() ? (
                <ReactMarkdown components={MARKDOWN_COMPONENTS}>
                  {withHardLineBreaks(draft)}
                </ReactMarkdown>
              ) : (
                <p className="italic text-muted-foreground/50 text-sm">
                  No note yet - switch to edit mode to add one.
                </p>
              )}
            </div>
          ) : (
            <textarea
              ref={textareaRef}
              autoFocus
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                setSaved(false);
              }}
              onKeyDown={handleEditorShortcut}
              placeholder={"Write a note...\n\nTip: **bold**, _italic_, ~~strikethrough~~, - list"}
              className="ek-scroll min-h-[360px] w-full flex-1 resize-none rounded-md border border-border/70 bg-card/25 px-3 py-3 text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/40 focus:border-muted-foreground/45"
            />
          )}
        </div>
      </div>
    </div>
  );
}

function formatDate(annotation: Annotation): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(firestoreTimestampToMs(annotation.createdAt)));
}

function withHardLineBreaks(value: string): string {
  return value.replace(/\n/g, "  \n");
}

const MARKDOWN_COMPONENTS = {
  h1: ({ children }: { children?: ReactNode }) => (
    <h1 className="mb-3 mt-1 text-2xl font-semibold leading-tight text-foreground">
      {children}
    </h1>
  ),
  h2: ({ children }: { children?: ReactNode }) => (
    <h2 className="mb-2.5 mt-4 text-xl font-semibold leading-tight text-foreground">
      {children}
    </h2>
  ),
  h3: ({ children }: { children?: ReactNode }) => (
    <h3 className="mb-2 mt-3 text-lg font-semibold leading-tight text-foreground">
      {children}
    </h3>
  ),
  p: ({ children }: { children?: ReactNode }) => (
    <p className="mb-2 leading-relaxed text-foreground/80">{children}</p>
  ),
  ul: ({ children }: { children?: ReactNode }) => (
    <ul className="mb-3 ml-5 list-disc space-y-1 text-foreground/80">{children}</ul>
  ),
  ol: ({ children }: { children?: ReactNode }) => (
    <ol className="mb-3 ml-5 list-decimal space-y-1 text-foreground/80">{children}</ol>
  ),
  li: ({ children }: { children?: ReactNode }) => (
    <li className="pl-1 leading-relaxed">{children}</li>
  ),
  strong: ({ children }: { children?: ReactNode }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  em: ({ children }: { children?: ReactNode }) => (
    <em className="italic text-foreground/85">{children}</em>
  ),
  del: ({ children }: { children?: ReactNode }) => (
    <del className="text-foreground/65">{children}</del>
  ),
};
