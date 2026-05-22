import { ArrowLeft, Plus } from "lucide-react";
import { format, isToday, isValid, isYesterday, isThisWeek } from "date-fns";
import { useStorageItem } from "../../hooks/use-storage-item";
import { collectionsStorage, collectionItemsStorage } from "../../lib/storage";
import type { CollectionItem } from "../../lib/types";
import { CollectionItemCard } from "./CollectionItemCard";
import { Button } from "../shared/Button";

interface Props {
  collectionId: string;
  onBack: () => void;
}

function groupByDate(items: CollectionItem[]): Record<string, CollectionItem[]> {
  return items.reduce<Record<string, CollectionItem[]>>((acc, item) => {
    const date = new Date(item.createdAt);
    let label: string;
    if (!isValid(date)) label = "Older";
    else if (isToday(date)) label = "Today";
    else if (isYesterday(date)) label = "Yesterday";
    else if (isThisWeek(date)) label = format(date, "EEEE");
    else label = "Older";
    if (!acc[label]) acc[label] = [];
    acc[label].push(item);
    return acc;
  }, {});
}

export function CollectionView({ collectionId, onBack }: Props) {
  const [collections] = useStorageItem(collectionsStorage);
  const [allItems, setAllItems] = useStorageItem(collectionItemsStorage);

  const collection = collections?.find((c) => c.id === collectionId);
  const items = (allItems ?? [])
    .filter((i) => i.collectionId === collectionId)
    .sort((a, b) => b.createdAt - a.createdAt);

  const grouped = groupByDate(items);

  const handleDelete = (itemId: string) => {
    setAllItems((prev) => (prev ?? []).filter((i) => i.id !== itemId));
  };

  const handleAddCurrentPage = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.url || !tab.id) return;
      const newItem: CollectionItem = {
        id: crypto.randomUUID(),
        collectionId,
        type: "url",
        title: tab.title ?? new URL(tab.url).hostname,
        content: tab.url,
        sourceUrl: tab.url,
        createdAt: Date.now(),
      };
      setAllItems((prev) => [newItem, ...(prev ?? [])]);
    } catch {
      // tab may not be accessible (chrome:// pages etc.)
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-border px-3 py-2.5">
        <Button
          variant="icon"
          size="icon-md"
          onClick={onBack}
        >
          <ArrowLeft size={15} />
        </Button>
        <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          {collection?.emoji && <span>{collection.emoji}</span>}
          {collection?.name ?? "Collection"}
        </span>
        <span className="ml-1 text-[11px] text-muted-foreground">
          {items.length > 0 ? `${items.length} item${items.length === 1 ? "" : "s"}` : ""}
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 px-6 text-center">
            <p className="text-sm text-muted-foreground">This collection is empty.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Right-click on any page to save content here.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-5 px-4 py-4">
            {Object.entries(grouped).map(([label, groupItems]) => (
              <div key={label} className="flex flex-col gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-1">
                  {label}
                </p>
                <div className="flex flex-col gap-1.5">
                  {groupItems.map((item) => (
                    <CollectionItemCard key={item.id} item={item} onDelete={handleDelete} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 border-t border-border px-4 py-3">
        <Button
          variant="outline"
          size="md"
          onClick={handleAddCurrentPage}
          className="w-full rounded-lg text-muted-foreground"
        >
          <Plus size={13} />
          Add current page
        </Button>
      </div>
    </div>
  );
}
