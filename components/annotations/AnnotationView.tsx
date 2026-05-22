import { ArrowLeft, Bold, Check, Eye, Italic, List, Pencil, Save, Strikethrough, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  firestoreTimestampToMs,
  getAnnotation,
  type Annotation,
} from "../../lib/annotations-api";
import { runWithTokenRetry } from "../../lib/auth";
import { sendMessage } from "../../lib/messaging";
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
  { icon: <List size={13} />, title: "Bullet list", prefix: "\n- ", suffix: "" },
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
  const [annotation, setAnnotation] = useState<Annotation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [isPreview, setIsPreview] = useState(false);
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
    setIsPreview(true);
    await save();
  };

  const togglePreview = async () => {
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

  const enterEditMode = () => setIsPreview(false);

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
              FORMAT_ACTIONS.map((action) => (
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

      <div className="flex flex-1 flex-col overflow-y-auto">
        <div className="px-4 py-4">
          {isPreview ? (
            <div
              className="prose prose-sm max-w-none cursor-text text-foreground/75"
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
                <ReactMarkdown>{draft}</ReactMarkdown>
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
              placeholder={"Write a note...\n\nTip: **bold**, _italic_, ~~strikethrough~~, - list"}
              className="min-h-36 w-full resize-none bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/40 leading-relaxed"
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
