import { useInfiniteQuery } from "@tanstack/react-query";
import { fetchSessions } from "../lib/api";
import { getValidToken } from "../lib/auth";
import type { SessionsPage } from "../lib/types";

function getPageCursor(page: SessionsPage): string | undefined {
  return page.lastVisibleId || page.sessions.at(-1)?.id;
}

export function useSessions(wsId: string | null) {
  return useInfiniteQuery({
    queryKey: ["sessions", wsId],
    enabled: !!wsId,
    initialPageParam: undefined as string | undefined,
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async ({ pageParam }) => {
      const token = await getValidToken();
      if (!token) throw new Error("Not authenticated");
      return fetchSessions(token, wsId!, pageParam);
    },
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.sessions.length === 0) return undefined;

      const cursor = getPageCursor(lastPage);
      if (!cursor) return undefined;

      const previousCursors = allPages.slice(0, -1).map(getPageCursor);
      return previousCursors.includes(cursor) ? undefined : cursor;
    },
  });
}
