import type { AuthState, Collection, CollectionItem, Collaborator, SparkCache, UserPrefs } from "./types";
import {
  createSupabaseCollectionItemsStorage,
  createSupabaseCollectionsStorage,
} from "./supabase-storage";

export const authStorage = storage.defineItem<AuthState>("local:auth", {
  defaultValue: { token: "", expDate: "" },
});

export const userPrefs = storage.defineItem<UserPrefs>("local:userPrefs", {
  defaultValue: {
    showFloatingButton: true,
    actionButtonY: 0.6,
    lastUsedSpark: null,
    lastFive: [],
  },
});

export const sparkCacheStorage = storage.defineItem<SparkCache>("local:sparkCache", {
  defaultValue: {},
});

export const chatApiKeyStorage = storage.defineItem<string>("local:chatApiKey", {
  defaultValue: "",
});

export const pageTextStorage = storage.defineItem<string>("session:pageText", {
  defaultValue: "",
});

export const pageUrlStorage = storage.defineItem<string>("session:pageUrl", {
  defaultValue: "",
});

export const selectedTextStorage = storage.defineItem<string>("session:selectedText", {
  defaultValue: "",
});

export const selectedTextSelectorStorage = storage.defineItem<string>(
  "session:selectedTextSelector",
  { defaultValue: "" }
);

export const collaboratorsStorage = storage.defineItem<Collaborator[]>(
  "local:collaborators",
  { defaultValue: [] },
);

export const collectionEmojiHistoryStorage = storage.defineItem<string[]>(
  "local:collectionEmojiHistory",
  { defaultValue: [] },
);

const localCollectionsStorage = storage.defineItem<Collection[]>("local:collections", {
  defaultValue: [],
});

const localCollectionItemsStorage = storage.defineItem<CollectionItem[]>("local:collectionItems", {
  defaultValue: [],
});

export const collectionsStorage = createSupabaseCollectionsStorage(
  localCollectionsStorage,
  authStorage,
);

export const collectionItemsStorage = createSupabaseCollectionItemsStorage(
  localCollectionItemsStorage,
  authStorage,
);

// Written by the side panel whenever auth resolves.
// The content script reads this instead of authStorage directly,
// so there's always one reliable source of "who am I".
export const currentIdentityStorage = storage.defineItem<string | null>(
  "local:currentIdentity",
  { defaultValue: null },
);
