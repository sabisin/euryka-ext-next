# Firebase Migration Plan — Annotations

## Overview

The annotations feature currently uses Supabase (PostgreSQL + Realtime). When the prod app moves to Firebase, the storage adapters need to be replaced. The component layer (UI, state, hooks) is deliberately kept agnostic and requires **no changes** — only the storage adapters in `lib/supabase-storage.ts` and the definitions in `lib/storage.ts` need to be updated.

---

## Current Architecture

```
AnnotationsList / AnnotationView
        ↓  useStorageItem()
annotationMarkersStorage       ← createSupabaseAnnotationStorage()
annotationSharesStorage        ← createSupabaseAnnotationSharesStorage()
annotationCommentsStorage      ← createSupabaseAnnotationCommentsStorage()
        ↓
lib/supabase-storage.ts        ← Supabase queries + Realtime channels
lib/storage.ts                 ← local fallback + adapter wiring
```

All adapters implement the same `StorageItem<T>` interface:
```typescript
type StorageItem<T> = {
  getValue: () => Promise<T>;
  setValue: (value: T) => Promise<void>;
  watch: (cb: (newValue: T) => void) => () => void;
}
```

---

## Migration Steps

### 1. Create `lib/firebase.ts`

Initialize the Firebase app (mirroring `lib/supabase.ts`):

```typescript
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = { /* from env */ };
export const db = getFirestore(initializeApp(firebaseConfig));
```

### 2. Create `lib/firebase-storage.ts`

Implement the same three factory functions, returning `StorageItem<T>`:

#### `createFirebaseAnnotationStorage()`

- **getValue()**: Query `annotations` collection, filter by `userId in [self, ...sharedOwners]`, return grouped by URL
- **setValue()**: Batch write/delete only own markers (`userId === currentUser.uid`)
- **watch()**: Use `onSnapshot()` on the filtered query — replaces Supabase Realtime

#### `createFirebaseAnnotationSharesStorage()`

- **getValue()**: Query `annotationShares` where `ownerId == currentUser.uid`
- **setValue()**: Batch delete + set share documents

#### `createFirebaseAnnotationCommentsStorage()`

- **getValue()**: Query `annotationComments` where `annotationId in visibleAnnotationIds`
- **setValue()**: Batch write/delete only own comments
- **watch()**: Use `onSnapshot()` on the comments query — replaces Supabase Realtime channel

### 3. Update `lib/storage.ts`

Swap the import and factory calls:

```typescript
// Before
import { createSupabaseAnnotationStorage, ... } from "./supabase-storage";

// After
import { createFirebaseAnnotationStorage, ... } from "./firebase-storage";
```

The `localAnnotation*Storage` fallback items remain unchanged.

### 4. Update search/pagination (if moving server-side)

Currently, `filterBySearch()` and `takeUpTo()` in `AnnotationsList.tsx` filter in-memory. To move to server-side:

1. Add an optional query param to `getValue()`:
   ```typescript
   getValue(query?: { search?: string; limit?: number; startAfter?: DocumentSnapshot })
   ```
2. In `AnnotationsList`, pass `searchTerm` and `visibleCount` to `getValue()` instead of filtering locally
3. The "Load more" button switches from `setVisibleCount(n + PAGE_SIZE)` to `fetchNextPage()` using the last `DocumentSnapshot` as a Firestore cursor (`startAfter`)
4. Remove `filterBySearch()` and `takeUpTo()` helpers — they become no-ops

The `searchTerm` and `visibleCount` state variables and the Load more button UI remain **identical**.

---

## Firestore Data Model

```
/annotations/{annotationId}
  userId: string
  targetUrl: string
  selector: string (JSON)
  note: string
  color: string
  selectedText: string
  createdAt: Timestamp
  updatedAt: Timestamp

/annotationShares/{ownerId_sharedEmail}
  ownerId: string
  sharedWithEmail: string
  createdAt: Timestamp

/annotationComments/{commentId}
  annotationId: string
  userId: string
  authorEmail: string
  body: string
  createdAt: Timestamp
  updatedAt: Timestamp
```

Indexes needed:
- `annotations`: composite on `(userId, targetUrl)`
- `annotationComments`: composite on `(annotationId, createdAt)`

---

## What Does NOT Change

- `lib/types.ts` — `AnnotationMarker`, `AnnotationComment`, `AnnotationCommentsByAnnotationId` types
- `components/annotations/AnnotationsList.tsx` — all UI, search, pagination logic
- `components/annotations/AnnotationView.tsx` — note editor and comment thread UI
- `hooks/use-storage-item.ts` — reactive hook
- Local fallback storage definitions in `lib/storage.ts`
