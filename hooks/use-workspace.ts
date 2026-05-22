import { useQuery } from "@tanstack/react-query";
import { fetchBrands, fetchProjects, fetchUser } from "../lib/api";
import { clearAuth, fetchAndStoreToken, getValidToken } from "../lib/auth";

// Always fetches the user's workspaces. Only fetches brands+projects when a
// wsId has been selected — fetching them requires the wsId in the URL.
// Previously this was `enabled: !!wsId`, which created a chicken-and-egg
// problem: workspaces are needed to pick a wsId, but the query was disabled
// until a wsId existed. So selectedWorkspaceId stayed null forever and
// handleUseSpark silently returned at its `if (!selectedWorkspaceId) return`
// guard.
export function useWorkspaceData(wsId: string | null) {
  return useQuery({
    queryKey: ["workspace", wsId],
    queryFn: async () => {
      const token = await getValidToken();
      if (!token) throw new Error("Not authenticated");
      let activeToken = token;
      let userResponse: Awaited<ReturnType<typeof fetchUser>>;
      try {
        userResponse = await fetchUser(activeToken);
      } catch (err) {
        if (!(err instanceof Response) || (err.status !== 401 && err.status !== 403)) {
          throw err;
        }
        const fresh = await fetchAndStoreToken();
        if (!fresh) {
          await clearAuth();
          throw new Error("Not authenticated");
        }
        activeToken = fresh;
        try {
          userResponse = await fetchUser(activeToken);
        } catch (retryErr) {
          if (retryErr instanceof Response && (retryErr.status === 401 || retryErr.status === 403)) {
            await clearAuth();
          }
          throw retryErr;
        }
      }
      const { workspaces } = userResponse;
      if (!wsId) {
        return { workspaces, brands: [], projects: [] };
      }
      const [{ brands }, { projects }] = await Promise.all([
        fetchBrands(activeToken, wsId),
        fetchProjects(activeToken, wsId),
      ]);
      return { workspaces, brands, projects };
    },
    staleTime: 5 * 60_000,
  });
}
