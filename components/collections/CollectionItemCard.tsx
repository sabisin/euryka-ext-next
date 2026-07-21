import { useRef, useState } from "react";
import { formatDistanceToNow, isValid } from "date-fns";
import {
  ExternalLink,
  GripVertical,
  ImageIcon,
  Link,
  MoreHorizontal,
  Play,
  Trash2,
  Type,
} from "lucide-react";
import type { Collection, CollectionItem, CollectionItemType } from "../../lib/types";
import { Button } from "../shared/Button";

interface Props {
  item: CollectionItem;
  collections?: Collection[];
  onDelete: (id: string) => void;
  onMove?: (itemId: string, toCollectionId: string) => void;
  onOpen?: (item: CollectionItem) => void;
}

function TypeIcon({ type }: { type: CollectionItemType }) {
  switch (type) {
    case "text":
      return <Type size={12} />;
    case "image":
      return <ImageIcon size={12} />;
    case "video":
      return <Play size={12} />;
    default:
      return <Link size={12} />;
  }
}

function domain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

const CLICK_DRAG_THRESHOLD = 6;

export function CollectionItemCard({ item, collections, onDelete, onMove, onOpen }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const didDragRef = useRef(false);
  const date = new Date(item.createdAt);
  const ago = isValid(date) ? formatDistanceToNow(date, { addSuffix: true }) : "";

  const moveTargets = collections?.filter((c) => c.id !== item.collectionId) ?? [];

  return (
    <div
      draggable
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onPointerDown={(e) => {
        pointerStartRef.current = { x: e.clientX, y: e.clientY };
        didDragRef.current = false;
      }}
      onPointerMove={(e) => {
        const start = pointerStartRef.current;
        if (!start) return;
        const distance = Math.hypot(e.clientX - start.x, e.clientY - start.y);
        if (distance >= CLICK_DRAG_THRESHOLD) didDragRef.current = true;
      }}
      onPointerUp={(e) => {
        if (menuOpen || !onOpen || didDragRef.current) return;
        if ((e.target as HTMLElement).closest("button,a")) return;
        onOpen(item);
      }}
      onKeyDown={(e) => {
        if (!onOpen || (e.key !== "Enter" && e.key !== " ")) return;
        e.preventDefault();
        onOpen(item);
      }}
      onDragStart={(e) => {
        setDragging(true);
        didDragRef.current = true;
        e.dataTransfer.setData("text/plain", item.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragEnd={() => {
        setDragging(false);
        window.setTimeout(() => {
          didDragRef.current = false;
          pointerStartRef.current = null;
        }, 0);
      }}
      className={`group relative flex w-full cursor-grab items-center gap-3 rounded-md bg-card/70 px-3 py-2.5 text-left transition-all duration-150 hover:-translate-y-px hover:bg-card hover:shadow-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring active:translate-y-0 active:scale-[0.998] active:cursor-grabbing active:bg-muted/60 ${dragging ? "opacity-40" : ""}`}
    >
      {/* Drag handle */}
      <GripVertical
        size={12}
        className="flex-shrink-0 text-muted-foreground/30 opacity-0 transition-opacity group-hover:opacity-100"
      />

      {/* Type icon or thumbnail */}
      {item.type === "image" && item.thumbnail ? (
        <div className="h-8 w-8 flex-shrink-0 overflow-hidden rounded-md bg-muted">
          <img src={item.thumbnail} alt="" className="h-full w-full object-cover" />
        </div>
      ) : (
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <TypeIcon type={item.type} />
        </div>
      )}

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-xs font-medium text-foreground">{item.title}</span>
        <span className="truncate text-[10px] text-muted-foreground">
          {domain(item.sourceUrl)}
          {ago && <span className="ml-1.5 opacity-60">· {ago}</span>}
        </span>
      </div>

      {/* Actions */}
      <div className="relative flex-shrink-0">
        <Button
          variant="icon"
          size="icon-md"
          onClick={() => setMenuOpen((o) => !o)}
          className="text-muted-foreground/40 opacity-70 hover:text-foreground hover:opacity-100 group-hover:opacity-100"
        >
          <MoreHorizontal size={13} />
        </Button>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 top-7 z-50 w-40 rounded-md border border-border bg-card py-1 shadow-xl">
              {item.type !== "text" && (
                <a
                  href={item.content}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setMenuOpen(false)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-foreground/80 hover:bg-accent"
                >
                  <ExternalLink size={12} />
                  Open link
                </a>
              )}

              {onMove && moveTargets.length > 0 && (
                <>
                  <div className="my-1 border-t border-border" />
                  <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Move to
                  </p>
                  {moveTargets.map((c) => (
                    <Button
                      key={c.id}
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setMenuOpen(false);
                        onMove(item.id, c.id);
                      }}
                      className="w-full justify-start text-foreground/80"
                    >
                      {c.emoji && <span>{c.emoji}</span>}
                      <span className="truncate">{c.name}</span>
                    </Button>
                  ))}
                </>
              )}

              <div className="my-1 border-t border-border" />
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  setMenuOpen(false);
                  onDelete(item.id);
                }}
                className="w-full justify-start text-destructive"
              >
                <Trash2 size={12} />
                Delete
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
