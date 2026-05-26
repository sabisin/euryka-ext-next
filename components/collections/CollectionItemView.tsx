import { ArrowLeft, Check, ExternalLink, Eye, ImageIcon, Link, Pencil, Play, Save, Trash2, Type } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import { formatDistanceToNow, isValid } from "date-fns";
import { useStorageItem } from "../../hooks/use-storage-item";
import { collectionsStorage, collectionItemsStorage } from "../../lib/storage";
import type { CollectionItem, CollectionItemType } from "../../lib/types";
import { Button } from "../shared/Button";

interface Props {
  itemId: string;
  onBack: () => void;
}

function TypeIcon({ type }: { type: CollectionItemType }) {
  switch (type) {
    case "text":
      return <Type size={14} />;
    case "image":
      return <ImageIcon size={14} />;
    case "video":
      return <Play size={14} />;
    default:
      return <Link size={14} />;
  }
}

function domain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function CollectionItemView({ itemId, onBack }: Props) {
  const [collections] = useStorageItem(collectionsStorage);
  const [items, setItems] = useStorageItem(collectionItemsStorage);
  const item = items?.find((current) => current.id === itemId);
  const collection = collections?.find((current) => current.id === item?.collectionId);
  const [draft, setDraft] = useState("");
  const [isPreview, setIsPreview] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDraft(item?.note ?? "");
    setSaved(false);
    setIsPreview(false);
  }, [item?.id, item?.note]);

  const save = async () => {
    if (!item) return;
    const nextNote = draft.trim();
    await setItems((current) =>
      (current ?? []).map((currentItem) =>
        currentItem.id === item.id
          ? { ...currentItem, note: nextNote || undefined }
          : currentItem,
      ),
    );
    setSaved(true);
    setIsPreview(true);
  };

  const remove = async () => {
    if (!item) return;
    await setItems((current) => (current ?? []).filter((currentItem) => currentItem.id !== item.id));
    onBack();
  };

  if (items === undefined) {
    return <div className="p-4 text-sm text-muted-foreground">Loading item...</div>;
  }

  if (!item) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
        <p className="text-sm">Collection item not found.</p>
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

  const date = new Date(item.createdAt);
  const ago = isValid(date) ? formatDistanceToNow(date, { addSuffix: true }) : "";

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-3 py-2.5">
        <Button variant="icon" size="icon-md" onClick={onBack} className="shrink-0">
          <ArrowLeft size={15} />
        </Button>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <TypeIcon type={item.type} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight text-foreground">
            {item.title}
          </p>
          <p className="mt-0.5 truncate text-[11px] leading-tight text-muted-foreground/70">
            {collection?.name ?? "Collection"} - {domain(item.sourceUrl)}
            {ago ? ` - ${ago}` : ""}
          </p>
        </div>
        <Button variant="destructive" size="icon-sm" title="Delete item" onClick={remove}>
          <Trash2 size={12} />
        </Button>
      </div>

      <div className="ek-scroll flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="border-b border-border px-4 py-4">
          <ItemPreview item={item} />
        </div>

        <div className="flex min-h-[280px] flex-1 flex-col">
          <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2.5">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Comments
            </p>
            <div className="flex items-center gap-px">
              <Button
                variant="icon"
                size="icon-sm"
                title={isPreview ? "Edit comments" : "Preview comments"}
                onClick={() => setIsPreview((value) => !value)}
              >
                {isPreview ? <Pencil size={12} /> : <Eye size={12} />}
              </Button>
              <Button
                variant="icon"
                size="icon-sm"
                title={saved ? "Saved" : "Save comments"}
                onClick={() => void save()}
                disabled={saved}
                className={saved ? "text-green-400" : undefined}
              >
                {saved ? <Check size={12} /> : <Save size={12} />}
              </Button>
            </div>
          </div>

          <div className="flex flex-1 px-4 py-4">
            {isPreview ? (
              <button
                type="button"
                onClick={() => setIsPreview(false)}
                className="prose prose-sm min-h-[220px] w-full max-w-none rounded-md border border-border/70 bg-card/25 px-3 py-3 text-left text-foreground/75 outline-none hover:border-muted-foreground/35 focus-visible:ring-1 focus-visible:ring-ring"
              >
                {draft.trim() ? (
                  <ReactMarkdown components={MARKDOWN_COMPONENTS}>
                    {withHardLineBreaks(draft)}
                  </ReactMarkdown>
                ) : (
                  <p className="text-sm italic text-muted-foreground/50">
                    No comments yet.
                  </p>
                )}
              </button>
            ) : (
              <textarea
                autoFocus
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value);
                  setSaved(false);
                }}
                placeholder="Write a comment..."
                className="ek-scroll min-h-[220px] w-full flex-1 resize-none rounded-md border border-border/70 bg-card/25 px-3 py-3 text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/40 focus:border-muted-foreground/45"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ItemPreview({ item }: { item: CollectionItem }) {
  if (item.type === "image") {
    return (
      <div className="flex flex-col gap-3">
        <div className="max-h-[320px] overflow-hidden rounded-md border border-border bg-muted">
          <img
            src={item.content}
            alt={item.title}
            className="max-h-[320px] w-full object-contain"
          />
        </div>
        <SourceLink item={item} />
      </div>
    );
  }

  if (item.type === "video") {
    return (
      <div className="flex flex-col gap-3">
        <video
          controls
          src={item.content}
          className="max-h-[320px] w-full rounded-md border border-border bg-muted"
        />
        <SourceLink item={item} />
      </div>
    );
  }

  if (item.type === "text") {
    return (
      <div className="flex flex-col gap-3">
        <div className="rounded-md border border-border/70 bg-card/25 px-3 py-3 text-sm leading-relaxed text-foreground/85">
          {item.content}
        </div>
        <SourceLink item={item} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <a
        href={item.content}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-3 rounded-md border border-border/70 bg-card/25 px-3 py-3 text-sm text-foreground hover:border-muted-foreground/45"
      >
        <Link size={15} className="shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">{item.content}</span>
        <ExternalLink size={13} className="shrink-0 text-muted-foreground" />
      </a>
      <SourceLink item={item} />
    </div>
  );
}

function SourceLink({ item }: { item: CollectionItem }) {
  return (
    <a
      href={item.sourceUrl}
      target="_blank"
      rel="noreferrer"
      className="inline-flex max-w-full items-center gap-1.5 self-start text-xs text-muted-foreground hover:text-foreground"
    >
      <ExternalLink size={12} />
      <span className="truncate">{domain(item.sourceUrl)}</span>
    </a>
  );
}

function withHardLineBreaks(value: string): string {
  return value.replace(/\n/g, "  \n");
}

const MARKDOWN_COMPONENTS = {
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
};
