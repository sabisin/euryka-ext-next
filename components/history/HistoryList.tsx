import { useEffect, useRef, useState } from "react";
import { format, isToday, isValid, isYesterday, isThisWeek } from "date-fns";
import { useSessions } from "../../hooks/use-sessions";
import { useStorageItem } from "../../hooks/use-storage-item";
import { sparkCacheStorage } from "../../lib/storage";
import { firestoreTsToDate } from "../../lib/utils";
import { debugLog } from "../../lib/debug";
import type { Session } from "../../lib/types";
import { SessionCard } from "./SessionCard";

interface Props {
  wsId: string | null;
  onSelectSession: (session: Session) => void;
}

const FETCH_COOLDOWN_MS = 1000;

const logHistoryPagination = debugLog("[Euryka history]");


function groupByDate(sessions: Session[]): Record<string, Session[]> {
  return sessions.reduce<Record<string, Session[]>>((acc, session) => {
    const date = firestoreTsToDate(session.createdAt);
    let label: string;
    if (!isValid(date)) label = "Older";
    else if (isToday(date)) label = "Today";
    else if (isYesterday(date)) label = "Yesterday";
    else if (isThisWeek(date)) label = format(date, "EEEE");
    else label = "Older";
    if (!acc[label]) acc[label] = [];
    acc[label].push(session);
    return acc;
  }, {});
}

export function HistoryList({ wsId, onSelectSession }: Props) {
  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } =
    useSessions(wsId);
  const [sparkCache] = useStorageItem(sparkCacheStorage);
  const [isExhausted, setIsExhausted] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const loaderRef = useRef<HTMLDivElement>(null);
  const lastFetchAtRef = useRef(0);

  useEffect(() => {
    setIsExhausted(false);
    lastFetchAtRef.current = 0;
    logHistoryPagination("Pagination guard reset", { wsId });
  }, [wsId]);

  useEffect(() => {
    const lastPage = data?.pages.at(-1);
    if (!lastPage) return;
    if (lastPage.sessions.length === 0) {
      logHistoryPagination("Pagination exhausted", {
        pageCount: data?.pages.length,
        sessionsInLastPage: lastPage.sessions.length,
        lastVisibleId: lastPage.lastVisibleId ?? null,
      });
      setIsExhausted(true);
    }
  }, [data]);

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    const el = loaderRef.current;
    const root = scrollRef.current;
    if (!el) {
      logHistoryPagination("Pagination observer skipped: loader missing");
      return;
    }
    if (isExhausted) {
      logHistoryPagination("Pagination observer skipped: exhausted");
      return;
    }
    logHistoryPagination("Pagination observer attached", {
      hasNextPage,
      isFetchingNextPage,
      rootAttached: Boolean(root),
    });
    const obs = new IntersectionObserver(
      ([entry]) => {
        const now = Date.now();
        const recentlyFetched = now - lastFetchAtRef.current < FETCH_COOLDOWN_MS;
        logHistoryPagination("Pagination sentinel observed", {
          isIntersecting: entry.isIntersecting,
          hasNextPage,
          isFetchingNextPage,
          isExhausted,
          recentlyFetched,
          cooldownRemainingMs: recentlyFetched
            ? FETCH_COOLDOWN_MS - (now - lastFetchAtRef.current)
            : 0,
        });
        if (
          entry.isIntersecting &&
          hasNextPage &&
          !isFetchingNextPage &&
          !recentlyFetched
        ) {
          lastFetchAtRef.current = now;
          logHistoryPagination("Fetching next history page");
          void fetchNextPage();
        }
      },
      { root, threshold: 0.5 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasNextPage, isFetchingNextPage, isExhausted, fetchNextPage]);

  const allSessions = data?.pages.flatMap((p) => p.sessions) ?? [];
  const grouped = groupByDate(allSessions);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 p-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  if (allSessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 px-6 text-center">
        <p className="text-sm text-muted-foreground leading-relaxed">
          Looks like you are still exploring Euryka…
        </p>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="flex h-full flex-col gap-5 overflow-y-auto px-4 py-4">
      {Object.entries(grouped).map(([label, sessions]) => (
        <div key={label} className="flex flex-col gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-1">{label}</p>
          <div className="flex flex-col gap-1.5">
            {sessions.map((s) => (
              <SessionCard
                key={s.id}
                session={s}
                sparkCache={sparkCache}
                onClick={onSelectSession}
              />
            ))}
          </div>
        </div>
      ))}

      {(hasNextPage || isFetchingNextPage) && (
        <div ref={loaderRef} className="py-1">
          {isFetchingNextPage && <HistoryCardSkeleton />}
        </div>
      )}
    </div>
  );
}

function HistoryCardSkeleton() {
  return (
    <div className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3">
      <div className="h-10 w-10 shrink-0 animate-pulse rounded-lg bg-muted" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="h-3 w-24 animate-pulse rounded bg-muted" />
        <div className="h-3 w-full animate-pulse rounded bg-muted/80" />
        <div className="h-3 w-2/3 animate-pulse rounded bg-muted/70" />
      </div>
    </div>
  );
}
