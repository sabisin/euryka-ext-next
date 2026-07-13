import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { firestoreTimestampToMs, getAnnotation, type Annotation } from "../../lib/annotations-api";
import { runWithTokenRetry } from "../../lib/auth";
import { sendMessage } from "../../lib/messaging";
import { Button } from "../shared/Button";
import { MarkdownAnnotationEditor } from "./MarkdownAnnotationEditor";

interface Props {
  markerId: string;
  onBack: () => void;
}

interface HeaderTitleProps {
  markerId: string;
  onBack: () => void;
}

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
      <Button variant="icon" size="icon-md" onClick={onBack} className="shrink-0">
        <ArrowLeft size={15} />
      </Button>

      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground leading-tight">
          {annotation?.note?.trim()
            ? annotation.note
                .split("\n")[0]
                .replace(/[*_~`#]/g, "")
                .slice(0, 50)
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
  const [saved, setSaved] = useState(false);

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

  const save = async (markdown: string) => {
    if (!annotation) return;
    const response = await sendMessage("updateAnnotation", {
      id: annotation.id,
      payload: { note: markdown.trim() || null },
    });
    setAnnotation(response.annotation);
    setDraft(response.annotation.note ?? "");
    setSaved(true);
  };

  const remove = async () => {
    if (!annotation) return;
    await sendMessage("deleteAnnotation", { id: annotation.id });
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
    <MarkdownAnnotationEditor
      content={draft}
      saved={saved}
      onChange={(markdown) => {
        setDraft(markdown);
        setSaved(false);
      }}
      onSave={save}
      onDelete={remove}
    />
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
