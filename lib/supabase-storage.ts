import { supabase } from "./supabase";
import { debugLog } from "./debug";
import type { AuthState, Collection, CollectionItem } from "./types";

type StorageItem<T> = {
  getValue: () => Promise<T>;
  setValue: (value: T) => Promise<void>;
  watch: (cb: (newValue: T) => void) => () => void;
};

type UserRow = {
  id: string;
  email: string;
};

type CollectionRow = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  source_url: string | null;
  item_count: number | null;
  created_at?: string;
  updated_at?: string;
};

type CollectionItemRow = {
  id: string;
  user_id: string;
  collection_id: string;
  type: CollectionItem["type"];
  title: string;
  content: string;
  thumbnail: string | null;
  source_url: string;
  note: string | null;
  created_at?: string;
  created_at_ms?: number;
};

type CollectionShareRow = {
  collection_id: string;
  shared_with_email: string;
  collections?: CollectionRow | null;
};

const logCollections = debugLog("[Euryka collections]");

export function createSupabaseCollectionsStorage(
  fallback: StorageItem<Collection[]>,
  authStorage: StorageItem<AuthState>
): StorageItem<Collection[]> {
  const watchers = createWatchers<Collection[]>();

  return {
    async getValue() {
      const user = await getCurrentUser(authStorage);
      if (!user) return supabase ? [] : fallback.getValue();

      const { data: ownData, error: ownError } = await supabase!
        .from("collections")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (ownError) {
        console.error("Failed to load collections from Supabase", ownError);
        return [];
      }

      const { data: ownSharesData, error: ownSharesError } = await supabase!
        .from("collection_shares")
        .select("collection_id,shared_with_email")
        .in(
          "collection_id",
          ((ownData ?? []) as CollectionRow[]).map((row) => row.id)
        );

      if (ownSharesError) {
        console.error("Failed to load collection shares from Supabase", ownSharesError);
      }

      const { data: sharedData, error: sharedError } = await supabase!
        .from("collection_shares")
        .select("collections(*)")
        .eq("shared_with_email", user.email);

      if (sharedError) {
        console.error("Failed to load shared collections from Supabase", sharedError);
      }

      const sharesByCollectionId = new Map<string, string[]>();
      for (const share of (ownSharesData ?? []) as CollectionShareRow[]) {
        sharesByCollectionId.set(share.collection_id, [
          ...(sharesByCollectionId.get(share.collection_id) ?? []),
          share.shared_with_email,
        ]);
      }

      const byId = new Map<string, Collection>();
      for (const row of (ownData ?? []) as CollectionRow[]) {
        byId.set(row.id, collectionFromRow(row, sharesByCollectionId.get(row.id) ?? []));
      }
      for (const share of (sharedData ?? []) as unknown as CollectionShareRow[]) {
        if (share.collections)
          byId.set(share.collections.id, collectionFromRow(share.collections, []));
      }
      const collections = Array.from(byId.values());
      watchers.emit(collections);
      return collections;
    },
    async setValue(value) {
      const user = await getCurrentUser(authStorage);
      if (!user) {
        if (supabase) return;
        await fallback.setValue(value);
        return;
      }

      const sharedCollectionIds = new Set(await getSharedCollectionIds(user));
      const ownCollections = value.filter((collection) => !sharedCollectionIds.has(collection.id));
      const rows = ownCollections.map((collection) => collectionToRow(collection, user.id));
      const ids = rows.map((row) => row.id);

      logCollections("Saving collections", {
        email: user.email,
        incomingCount: value.length,
        ownCount: ownCollections.length,
        rowsToUpsert: rows.map((row) => ({
          id: row.id,
          name: row.name,
        })),
      });

      if (ids.length > 0) {
        const { error } = await supabase!.from("collections").upsert(rows);
        if (error) {
          console.error("[Euryka collections] Supabase collections upsert failed", error);
          throw error;
        }
        logCollections("Supabase collections upsert succeeded", {
          ids,
        });
      }

      await saveCollectionShares(
        ownCollections.map((collection) => ({
          id: collection.id,
          sharedWith: collection.sharedWith ?? [],
        }))
      );
      watchers.emit(value);
    },
    watch: watchers.watch,
  };
}

export function createSupabaseCollectionItemsStorage(
  fallback: StorageItem<CollectionItem[]>,
  authStorage: StorageItem<AuthState>
): StorageItem<CollectionItem[]> {
  const watchers = createWatchers<CollectionItem[]>();

  return {
    async getValue() {
      const user = await getCurrentUser(authStorage);
      if (!user) {
        logCollections("Collection items getValue: no Supabase user", {
          hasSupabase: Boolean(supabase),
        });
        return supabase ? [] : fallback.getValue();
      }

      const visibleCollectionIds = await getVisibleCollectionIds(user);
      logCollections("Loading collection items", {
        email: user.email,
        visibleCollectionIds,
      });
      if (visibleCollectionIds.length === 0) {
        logCollections("No visible collections; returning no items");
        watchers.emit([]);
        return [];
      }

      const { data, error } = await supabase!
        .from("collection_items")
        .select("*")
        .in("collection_id", visibleCollectionIds)
        .order("created_at_ms", { ascending: false });

      if (error) {
        console.error("Failed to load collection items from Supabase", error);
        return [];
      }

      const items = ((data ?? []) as CollectionItemRow[]).map(collectionItemFromRow);
      logCollections("Loaded collection items from Supabase", {
        count: items.length,
        ids: items.map((item) => item.id),
      });
      watchers.emit(items);
      return items;
    },
    async setValue(value) {
      const user = await getCurrentUser(authStorage);
      if (!user) {
        logCollections("Collection items setValue: no Supabase user", {
          incomingCount: value.length,
          hasSupabase: Boolean(supabase),
        });
        if (supabase) return;
        await fallback.setValue(value);
        return;
      }

      const ownCollectionIds = new Set(await getOwnCollectionIds(user));
      const filteredOut = value.filter(
        (item) => !isUuid(item.collectionId) || !ownCollectionIds.has(item.collectionId)
      );
      const rows = value
        .filter((item) => isUuid(item.collectionId) && ownCollectionIds.has(item.collectionId))
        .map((item) => collectionItemToRow(item, user.id));

      logCollections("Saving collection items", {
        email: user.email,
        incomingCount: value.length,
        ownCollectionIds: Array.from(ownCollectionIds),
        rowsToUpsert: rows.length,
        filteredOut: filteredOut.map((item) => ({
          id: item.id,
          collectionId: item.collectionId,
          title: item.title,
          reason: !isUuid(item.collectionId)
            ? "collectionId is not uuid"
            : "collectionId is not owned",
        })),
        rowIds: rows.map((row) => row.id),
      });

      if (rows.length > 0) {
        const { error } = await supabase!.from("collection_items").upsert(rows);
        if (error) {
          console.error("[Euryka collections] Supabase collection_items upsert failed", error);
          throw error;
        }
        logCollections("Supabase collection_items upsert succeeded", {
          rowIds: rows.map((row) => row.id),
        });
      } else {
        logCollections("No collection item rows to upsert");
      }
      watchers.emit(value);
    },
    watch: watchers.watch,
  };
}

async function getCurrentUser(authStorage: StorageItem<AuthState>): Promise<UserRow | null> {
  if (!supabase) return null;

  const auth = await authStorage.getValue();
  const email = auth.email?.trim().toLowerCase();
  if (!email) return null;

  const { data, error } = await supabase
    .from("users_test")
    .upsert({ email }, { onConflict: "email" })
    .select("id,email")
    .single();

  if (error) return null;
  return data as UserRow;
}

async function getVisibleCollectionIds(user: UserRow): Promise<string[]> {
  const ownIds = await getOwnCollectionIds(user);
  const sharedIds = await getSharedCollectionIds(user);

  return Array.from(new Set([...ownIds, ...sharedIds]));
}

async function getOwnCollectionIds(user: UserRow): Promise<string[]> {
  const { data, error } = await supabase!.from("collections").select("id").eq("user_id", user.id);

  if (error) {
    console.error("Failed to load own collection ids from Supabase", error);
    return [];
  }

  return ((data ?? []) as { id: string }[]).map((row) => row.id);
}

async function getSharedCollectionIds(user: UserRow): Promise<string[]> {
  const { data, error } = await supabase!
    .from("collection_shares")
    .select("collection_id")
    .eq("shared_with_email", user.email);

  if (error) {
    console.error("Failed to load shared collection ids from Supabase", error);
    return [];
  }

  return ((data ?? []) as CollectionShareRow[]).map((row) => row.collection_id);
}

async function saveCollectionShares(
  collections: { id: string; sharedWith: string[] }[]
): Promise<void> {
  const collectionIds = collections.map((collection) => collection.id);
  if (collectionIds.length === 0) return;

  const rows = collections.flatMap((collection) =>
    Array.from(
      new Set(collection.sharedWith.map((email) => email.trim().toLowerCase()).filter(Boolean))
    ).map((email) => ({
      collection_id: collection.id,
      shared_with_email: email,
    }))
  );

  await supabase!.from("collection_shares").delete().in("collection_id", collectionIds);

  if (rows.length > 0) {
    const { error } = await supabase!.from("collection_shares").upsert(rows);
    if (error) throw error;
  }
}

function collectionFromRow(row: CollectionRow, sharedWith: string[] = []): Collection {
  return {
    id: row.id,
    name: row.name,
    emoji: row.description ?? undefined,
    sharedWith,
    createdAt: timestampFromRow(row),
  };
}

function collectionToRow(collection: Collection, userId: string): CollectionRow {
  return {
    id: collection.id,
    user_id: userId,
    name: collection.name,
    description: collection.emoji ?? null,
    source_url: null,
    item_count: null,
    created_at: dateFromTimestamp(collection.createdAt),
    updated_at: dateFromTimestamp(Date.now()),
  };
}

function collectionItemFromRow(row: CollectionItemRow): CollectionItem {
  return {
    id: row.id,
    collectionId: row.collection_id,
    type: row.type,
    title: row.title,
    content: row.content,
    thumbnail: row.thumbnail ?? undefined,
    sourceUrl: row.source_url,
    note: row.note ?? undefined,
    createdAt: timestampFromRow(row),
  };
}

function collectionItemToRow(item: CollectionItem, userId: string): CollectionItemRow {
  return {
    id: item.id,
    user_id: userId,
    collection_id: item.collectionId,
    type: item.type,
    title: item.title,
    content: item.content,
    thumbnail: item.thumbnail ?? null,
    source_url: item.sourceUrl,
    note: item.note ?? null,
    created_at_ms: item.createdAt,
  };
}

function timestampFromRow(row: { created_at?: string; created_at_ms?: number }): number {
  if (typeof row.created_at_ms === "number") return row.created_at_ms;
  if (row.created_at) return new Date(row.created_at).getTime();
  return Date.now();
}

function dateFromTimestamp(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function saveSlackMemberId(
  authStorage: StorageItem<AuthState>,
  slackMemberId: string
): Promise<void> {
  const user = await getCurrentUser(authStorage);
  if (!user) return;
  await supabase!
    .from("users_test")
    .update({ slack_member_id: slackMemberId.trim() || null })
    .eq("id", user.id);
}

export async function getSlackMemberIds(emails: string[]): Promise<Map<string, string>> {
  if (!supabase || emails.length === 0) return new Map();
  const { data } = await supabase
    .from("users_test")
    .select("email, slack_member_id")
    .in("email", emails);
  return new Map(
    ((data ?? []) as { email: string; slack_member_id: string | null }[])
      .filter((row) => row.slack_member_id)
      .map((row) => [row.email, row.slack_member_id!])
  );
}

function createWatchers<T>() {
  const callbacks = new Set<(newValue: T) => void>();

  return {
    emit(value: T) {
      callbacks.forEach((callback) => callback(value));
    },
    watch(callback: (newValue: T) => void) {
      callbacks.add(callback);
      return () => callbacks.delete(callback);
    },
  };
}
