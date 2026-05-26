import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { EmojiPicker, type EmojiPickerListCategoryHeaderProps, type EmojiPickerListEmojiProps, type EmojiPickerListRowProps } from "frimousse";
import { Bookmark, Check, ChevronDown, Pencil, Plus, Trash2, UserPlus, X } from "lucide-react";
import { useStorageItem } from "../../hooks/use-storage-item";
import { collectionEmojiHistoryStorage, collectionsStorage, collectionItemsStorage } from "../../lib/storage";
import type { Collection, CollectionItem } from "../../lib/types";
import { CollectionItemCard } from "./CollectionItemCard";
import { Button } from "../shared/Button";

interface Props {
  onSelectCollection: (id: string) => void;
  onSelectItem: (item: CollectionItem) => void;
}

const EMOJIS = ["📁", "⭐", "🔖", "💡", "🎨", "📌", "🧠", "🔗", "📚", "🎯"];
const CUSTOM_EMOJI_LIMIT = 3;

type Filter = "all" | string;

export function CollectionsList({ onSelectCollection, onSelectItem }: Props) {
  const [collections, setCollections] = useStorageItem(collectionsStorage);
  const [allItems, setAllItems] = useStorageItem(collectionItemsStorage);
  const [customEmojis, setCustomEmojis] = useStorageItem(collectionEmojiHistoryStorage);

  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmoji, setNewEmoji] = useState(EMOJIS[0]);
  const [newEmojiPickerOpen, setNewEmojiPickerOpen] = useState(false);
  const [filters, setFilters] = useState<Filter[]>(["all"]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmoji, setEditEmoji] = useState(EMOJIS[0]);
  const [editEmojiPickerOpen, setEditEmojiPickerOpen] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  const isLoading = collections === undefined || allItems === undefined;
  const collectionList = collections ?? [];
  const items = allItems ?? [];

  const startCreating = () => {
    setIsCreating(true);
    setNewName("");
    setNewEmoji(EMOJIS[0]);
    setNewEmojiPickerOpen(false);
    setTimeout(() => nameInputRef.current?.focus(), 50);
  };

  const confirmCreate = () => {
    const name = newName.trim();
    if (!name) { setIsCreating(false); return; }
    const newCollection: Collection = {
      id: crypto.randomUUID(),
      name,
      emoji: newEmoji,
      createdAt: Date.now(),
      sharedWith: [],
    };
    setCollections((prev) => [...(prev ?? []), newCollection]);
    setIsCreating(false);
    setNewName("");
  };

  const handleDeleteCollection = (collectionId: string) => {
    setCollections((prev) => (prev ?? []).filter((c) => c.id !== collectionId));
    setAllItems((prev) => (prev ?? []).filter((i) => i.collectionId !== collectionId));
  };

  const startEditing = (collection: Collection) => {
    setEditingId(collection.id);
    setEditName(collection.name);
    setEditEmoji(collection.emoji);
    setEditEmojiPickerOpen(false);
    setTimeout(() => editInputRef.current?.focus(), 50);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditName("");
  };

  const confirmEdit = () => {
    if (!editingId) return;
    const name = editName.trim();
    if (!name) {
      cancelEditing();
      return;
    }
    setCollections((prev) =>
      (prev ?? []).map((collection) =>
        collection.id === editingId
          ? { ...collection, name, emoji: editEmoji }
          : collection,
      ),
    );
    cancelEditing();
  };

  const handleDeleteItem = (itemId: string) => {
    setAllItems((prev) => (prev ?? []).filter((i) => i.id !== itemId));
  };

  const handleMoveItem = (itemId: string, toCollectionId: string) => {
    setAllItems((prev) => (prev ?? []).map((i) => i.id === itemId ? { ...i, collectionId: toCollectionId } : i));
  };

  const shareCollection = (collectionId: string, email: string) => {
    const normalized = email.trim().toLowerCase();
    if (!normalized) return;
    setCollections((prev) =>
      (prev ?? []).map((collection) => {
        if (collection.id !== collectionId) return collection;
        const sharedWith = collection.sharedWith ?? [];
        if (sharedWith.includes(normalized)) return collection;
        return { ...collection, sharedWith: [...sharedWith, normalized] };
      }),
    );
  };

  const unshareCollection = (collectionId: string, email: string) => {
    setCollections((prev) =>
      (prev ?? []).map((collection) =>
        collection.id === collectionId
          ? {
              ...collection,
              sharedWith: (collection.sharedWith ?? []).filter((item) => item !== email),
            }
          : collection,
      ),
    );
  };

  // --- Sections ---
  type Section = { id: string; label: string; emoji?: string; items: CollectionItem[] };
  const sections: Section[] = [];

  const showAll = filters.includes("all");

  if (showAll) {
    for (const c of collectionList) {
      sections.push({ id: c.id, label: c.name, emoji: c.emoji, items: items.filter((i) => i.collectionId === c.id) });
    }
  } else {
    for (const selectedFilter of filters) {
      if (selectedFilter === "all") continue;
      const c = collectionList.find((col) => col.id === selectedFilter);
      if (c) {
        sections.push({ id: c.id, label: c.name, emoji: c.emoji, items: items.filter((i) => i.collectionId === c.id) });
      }
    }
  }

  const isEmpty = collectionList.length === 0;

  const filterLabel =
    showAll ? "All" :
    filters.length === 0 ? "Select collections" :
    filters.length === 1 ? collectionList.find((c) => c.id === filters[0])?.name ?? "Select collections" :
    `${filters.length} selected`;

  const filterOptions: Filter[] = ["all", ...collectionList.map((c) => c.id)];

  const rememberCustomEmoji = (emoji: string) => {
    if (EMOJIS.includes(emoji)) return;
    void setCustomEmojis((current) => [
      emoji,
      ...(current ?? []).filter((item) => item !== emoji),
    ].slice(0, CUSTOM_EMOJI_LIMIT));
  };

  const selectNewEmoji = (emoji: string) => {
    setNewEmoji(emoji);
    rememberCustomEmoji(emoji);
  };

  const selectEditEmoji = (emoji: string) => {
    setEditEmoji(emoji);
    rememberCustomEmoji(emoji);
  };

  const toggleFilter = (key: Filter) => {
    if (key === "all") {
      setFilters(["all"]);
      setFilterOpen(false);
      return;
    }

    setFilters((current) => {
      const withoutAll = current.filter((item) => item !== "all");
      const next = withoutAll.includes(key)
        ? withoutAll.filter((item) => item !== key)
        : [...withoutAll, key];
      return next.length > 0 ? next : ["all"];
    });
  };

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <div className="relative flex-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFilterOpen((o) => !o)}
            className="w-full bg-muted"
          >
            <span className="flex-1 truncate text-left">{filterLabel}</span>
            <ChevronDown size={11} className="flex-shrink-0 text-muted-foreground" />
          </Button>

          {filterOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setFilterOpen(false)} />
              <div className="absolute left-0 top-[calc(100%+4px)] z-50 min-w-full rounded-md border border-border bg-card py-1 shadow-xl">
                {filterOptions.map((key) => {
                  const label = key === "all" ? "All" : collectionList.find((c) => c.id === key)?.name ?? key;
                  const emoji = key !== "all" ? collectionList.find((c) => c.id === key)?.emoji : undefined;
                  return (
                    <Button
                      key={key}
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleFilter(key)}
                      className={`w-full justify-start ${filters.includes(key) ? "font-medium text-foreground" : "text-foreground/80"}`}
                    >
                      <span className="flex h-3 w-3 items-center justify-center rounded-sm border border-border text-[9px]">
                        {filters.includes(key) ? "✓" : ""}
                      </span>
                      {emoji && <span>{emoji}</span>}
                      {label}
                    </Button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <Button
          variant="outline"
          size="icon-md"
          onClick={startCreating}
          title="New collection"
          className="flex-shrink-0"
        >
          <Plus size={14} />
        </Button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {/* Inline create form */}
        {isCreating && (
          <div className="border-b border-border px-4 py-3">
            <div className="mb-2 flex flex-wrap gap-1">
              {[...EMOJIS, ...(customEmojis ?? [])].map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => selectNewEmoji(e)}
                  className={`h-7 w-7 rounded text-sm transition-colors ${newEmoji === e ? "bg-primary/20 ring-1 ring-primary" : "hover:bg-accent"}`}
                >
                  {e}
                </button>
              ))}
              <EmojiPickerPopover
                open={newEmojiPickerOpen}
                selectedEmoji={newEmoji}
                onOpenChange={setNewEmojiPickerOpen}
                onSelect={(emoji) => {
                  selectNewEmoji(emoji);
                  setNewEmojiPickerOpen(false);
                }}
              />
            </div>
            <input
              ref={nameInputRef}
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") confirmCreate(); if (e.key === "Escape") setIsCreating(false); }}
              placeholder="Collection name…"
              className="w-full rounded-md border border-border bg-muted px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
            />
            <div className="mt-2 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setIsCreating(false)} className="h-7">
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={confirmCreate} className="h-7">
                Create
              </Button>
            </div>
          </div>
        )}

        {isLoading ? (
          <CollectionsLoadingState />
        ) : isEmpty && !isCreating ? (
          <div className="flex h-40 flex-col items-center justify-center px-6 text-center">
            <Bookmark size={22} className="mb-2 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">No collections yet.</p>
            <p className="mt-1 text-xs text-muted-foreground">Click + to create your first collection.</p>
          </div>
        ) : (
          <div className="mt-2 flex flex-col divide-y divide-border">
            {sections.map((section) => {
              const sectionKey = section.id;
              const isDropTarget = dropTarget === sectionKey;
              const collection = collectionList.find((c) => c.id === section.id);
              const isEditing = section.id !== "" && editingId === section.id;
              return (
              <div
                key={sectionKey}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setDropTarget(sectionKey);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setDropTarget(null);
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const itemId = e.dataTransfer.getData("text/plain");
                  if (itemId) handleMoveItem(itemId, section.id);
                  setDropTarget(null);
                }}
                className={`transition-colors ${isDropTarget ? "bg-primary/5 ring-1 ring-inset ring-primary/20" : ""}`}
              >
                {isEditing ? (
                  <div className="border-b border-border/60 px-4 py-3">
                    <div className="mb-2 flex flex-wrap gap-1">
                      {[...EMOJIS, ...(customEmojis ?? [])].map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => selectEditEmoji(emoji)}
                          className={`h-7 w-7 rounded text-sm transition-colors ${
                            editEmoji === emoji
                              ? "bg-primary/20 ring-1 ring-primary"
                              : "hover:bg-accent"
                          }`}
                        >
                          {emoji}
                        </button>
                      ))}
                      <EmojiPickerPopover
                        open={editEmojiPickerOpen}
                        selectedEmoji={editEmoji}
                        onOpenChange={setEditEmojiPickerOpen}
                        onSelect={(emoji) => {
                          selectEditEmoji(emoji);
                          setEditEmojiPickerOpen(false);
                        }}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        ref={editInputRef}
                        type="text"
                        value={editName}
                        onChange={(event) => setEditName(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") confirmEdit();
                          if (event.key === "Escape") cancelEditing();
                        }}
                        className="h-8 flex-1 rounded-md border border-border bg-muted px-2.5 text-xs text-foreground outline-none focus:border-ring"
                      />
                      <Button
                        variant="primary"
                        size="icon-lg"
                        onClick={confirmEdit}
                        title="Save collection"
                      >
                        <Check size={13} />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon-lg"
                        onClick={cancelEditing}
                        title="Cancel"
                      >
                        <X size={13} />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 px-4 py-2">
                    <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      {section.emoji && <span className="text-sm normal-case">{section.emoji}</span>}
                      {section.label}
                      <span className="font-normal opacity-60">({section.items.length})</span>
                    </span>

                    <div className="ml-auto flex items-center gap-2">
                      {section.id && collection && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onSelectCollection(section.id)}
                            className="h-auto px-0 py-0 text-[10px] hover:bg-transparent"
                          >
                            View all
                          </Button>
                          <CollectionSharePopover
                            collection={collection}
                            onShare={shareCollection}
                            onUnshare={unshareCollection}
                          />
                          <Button
                            variant="icon"
                            size="icon-sm"
                            onClick={() => startEditing(collection)}
                            title="Edit collection"
                          >
                            <Pencil size={11} />
                          </Button>
                          <Button
                            variant="destructive"
                            size="icon-sm"
                            onClick={() => handleDeleteCollection(section.id)}
                            title="Delete collection"
                          >
                            <Trash2 size={11} />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {section.items.length === 0 ? (
                  <p className="px-4 pb-3 text-[11px] italic text-muted-foreground">No items yet.</p>
                ) : (
                  <div className="flex flex-col gap-2 px-4 pb-4">
                    {section.items.map((item) => (
                      <CollectionItemCard
                        key={item.id}
                        item={item}
                        collections={collectionList}
                        onDelete={handleDeleteItem}
                        onMove={handleMoveItem}
                        onOpen={onSelectItem}
                      />
                    ))}
                  </div>
                )}
              </div>
            );})}
          </div>
        )}
      </div>
    </div>
  );
}

function CollectionsLoadingState() {
  return (
    <div className="mt-2 flex flex-col divide-y divide-border">
      {[0, 1].map((section) => (
        <div key={section} className="px-4 py-3">
          <div className="mb-3 flex items-center gap-2">
            <div className="h-4 w-4 animate-pulse rounded bg-muted" />
            <div className="h-3 w-20 animate-pulse rounded bg-muted" />
          </div>
          <div className="flex flex-col gap-4 px-6">
            {[0, 1].map((item) => (
              <div key={item} className="flex items-center gap-3">
                <div className="h-8 w-8 shrink-0 animate-pulse rounded-md bg-muted" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-3 w-2/5 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-3/5 animate-pulse rounded bg-muted/80" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function EmojiPickerPopover({
  open,
  selectedEmoji,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  selectedEmoji: string;
  onOpenChange: (open: boolean) => void;
  onSelect: (emoji: string) => void;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        title="Choose emoji"
        aria-label="Choose emoji"
        aria-expanded={open}
      >
        <Plus size={14} />
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close emoji picker"
            className="fixed inset-0 z-40 cursor-default bg-transparent"
            onClick={() => onOpenChange(false)}
          />
          <div className="absolute left-0 top-[calc(100%+6px)] z-50 w-64 overflow-hidden rounded-md border border-border bg-background shadow-xl">
            <EmojiPicker.Root
              columns={8}
              onEmojiSelect={({ emoji }) => onSelect(emoji)}
              className="flex flex-col"
            >
              <div className="flex items-center gap-2 border-b border-border px-2 py-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-muted text-sm">
                  {selectedEmoji}
                </span>
                <EmojiPicker.Search
                  autoFocus
                  placeholder="Search emoji"
                  className="h-7 min-w-0 flex-1 rounded border border-border bg-card px-2 text-xs text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary"
                />
              </div>
              <EmojiPicker.Viewport className="ek-scroll h-56 overflow-y-auto">
                <EmojiPicker.Loading className="block px-3 py-3 text-xs text-muted-foreground">
                  Loading...
                </EmojiPicker.Loading>
                <EmojiPicker.Empty className="block px-3 py-3 text-xs text-muted-foreground">
                  No emoji found.
                </EmojiPicker.Empty>
                <EmojiPicker.List
                  className="p-1.5"
                  components={{
                    CategoryHeader: EmojiCategoryHeader,
                    Row: EmojiRow,
                    Emoji: EmojiButton,
                  }}
                />
              </EmojiPicker.Viewport>
            </EmojiPicker.Root>
          </div>
        </>
      )}
    </div>
  );
}

function EmojiCategoryHeader({ category, ...props }: EmojiPickerListCategoryHeaderProps) {
  return (
    <div
      {...props}
      className="bg-background/95 px-1.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
    >
      {category.label}
    </div>
  );
}

function EmojiRow({ children, ...props }: EmojiPickerListRowProps) {
  return (
    <div {...props} className="grid grid-cols-8 gap-0.5">
      {children}
    </div>
  );
}

function EmojiButton({ emoji, ...props }: EmojiPickerListEmojiProps) {
  return (
    <button
      {...props}
      type="button"
      className={`flex h-7 w-7 items-center justify-center rounded text-base transition-colors ${
        emoji.isActive ? "bg-accent" : "hover:bg-accent"
      }`}
      title={emoji.label}
    >
      {emoji.emoji}
    </button>
  );
}

function CollectionSharePopover({
  collection,
  onShare,
  onUnshare,
}: {
  collection: Collection;
  onShare: (collectionId: string, email: string) => void;
  onUnshare: (collectionId: string, email: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const sharedWith = collection.sharedWith ?? [];

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onShare(collection.id, email);
    setEmail("");
  };

  return (
    <div className="relative">
      <Button
        variant="icon"
        size="icon-sm"
        title="Share collection"
        onClick={() => setOpen((value) => !value)}
        className={`text-muted-foreground hover:text-foreground ${
          sharedWith.length > 0 ? "text-primary" : ""
        }`}
      >
        <UserPlus size={11} />
      </Button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close collection sharing"
            className="fixed inset-0 z-40 cursor-default bg-transparent"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-full z-50 mt-1 w-72 rounded-lg border border-border bg-background shadow-lg">
            <div className="border-b border-border px-3 py-2.5">
              <p className="text-xs font-semibold text-foreground">Share collection</p>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                {collection.emoji} {collection.name}
              </p>
            </div>

            <div className="flex flex-col gap-3 p-3">
              {sharedWith.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {sharedWith.map((item) => (
                    <span
                      key={item}
                      className="flex items-center gap-1.5 rounded-full border border-border bg-card px-2 py-1 text-xs text-foreground/80"
                    >
                      <span className="max-w-[160px] truncate">{item}</span>
                      <Button
                        variant="icon"
                        size="icon-sm"
                        onClick={() => onUnshare(collection.id, item)}
                        className="h-4 w-4 text-muted-foreground/50 hover:text-muted-foreground"
                        title="Remove"
                      >
                        <X size={10} />
                      </Button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs italic text-muted-foreground/60">
                  Nobody has access yet.
                </p>
              )}

              <form onSubmit={submit} className="flex gap-1.5">
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="colleague@company.com"
                  className="h-8 flex-1 rounded border border-border bg-card px-2.5 text-xs text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary"
                />
                <Button
                  variant="primary"
                  size="sm"
                  type="submit"
                  disabled={!email.trim()}
                >
                  Add
                </Button>
              </form>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
