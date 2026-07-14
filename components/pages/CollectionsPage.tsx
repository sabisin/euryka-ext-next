import { CollectionItemView } from "../collections/CollectionItemView";
import { CollectionsList } from "../collections/CollectionsList";
import { CollectionView } from "../collections/CollectionView";
import type { CollectionItem } from "../../lib/types";

interface CollectionsPageProps {
  selectedCollectionId: string | null;
  selectedCollectionItemId: string | null;
  onSelectCollection: (collectionId: string | null) => void;
  onSelectCollectionItem: (collectionItemId: string | null) => void;
  onOpenItem: (item: CollectionItem) => void;
  onOpenItemFromCollection: (item: CollectionItem) => void;
}

export function CollectionsPage({
  selectedCollectionId,
  selectedCollectionItemId,
  onSelectCollection,
  onSelectCollectionItem,
  onOpenItem,
  onOpenItemFromCollection,
}: CollectionsPageProps) {
  if (selectedCollectionItemId) {
    return (
      <CollectionItemView
        itemId={selectedCollectionItemId}
        onBack={() => onSelectCollectionItem(null)}
      />
    );
  }

  if (selectedCollectionId) {
    return (
      <CollectionView
        collectionId={selectedCollectionId}
        onBack={() => onSelectCollection(null)}
        onSelectItem={onOpenItemFromCollection}
      />
    );
  }

  return (
    <CollectionsList onSelectCollection={onSelectCollection} onSelectItem={onOpenItem} />
  );
}
