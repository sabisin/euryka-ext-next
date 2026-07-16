import { useQuery } from "@tanstack/react-query";
import { fetchBrands, fetchProjects, fetchUser } from "../lib/api";
import { clearAuth, fetchAndStoreToken, getValidToken } from "../lib/auth";
import { debugLog } from "../lib/debug";
import { authStorage } from "../lib/storage";

const logUserProfile = debugLog("[Euryka profile]");

async function syncUserProfile(response: Awaited<ReturnType<typeof fetchUser>>) {
  const profiles = [
    response.user?.profile,
    response.user?.user_metadata,
    response.user?.metadata,
    response.user,
    response.profile,
    response.user_metadata,
    response.metadata,
    response,
  ].filter((profile): profile is Exclude<typeof profile, undefined> => profile !== undefined);
  const getAvatarUrl = (profile: NonNullable<(typeof profiles)[number]>) => {
    const avatar = profile.avatar;
    return (
      profile.avatarUrl ??
      profile.avatar_url ??
      profile.picture ??
      profile.image ??
      profile.photoURL ??
      profile.photoUrl ??
      profile.photo_url ??
      profile.profilePhotoUrl ??
      profile.profile_photo_url ??
      (typeof avatar === "string" ? avatar : (avatar?.url ?? avatar?.src))
    );
  };
  const avatarUrl = profiles.map(getAvatarUrl).find(Boolean);
  const name = profiles.map((profile) => profile.name).find(Boolean);
  const email = profiles.map((profile) => profile.email).find(Boolean);
  if (!avatarUrl && !name && !email) return;

  const current = await authStorage.getValue();
  await authStorage.setValue({
    ...current,
    name: name ?? current.name,
    email: email ?? current.email,
    avatarUrl: avatarUrl ?? current.avatarUrl,
  });
}

// Always fetches the user's workspaces. Only fetches brands+projects when a
// wsId has been selected — fetching them requires the wsId in the URL.
// Previously this was `enabled: !!wsId`, which created a chicken-and-egg
// problem: workspaces are needed to pick a wsId, but the query was disabled
// until a wsId existed. So selectedWorkspaceId stayed null forever and
// handleUseSpark silently returned at its `if (!selectedWorkspaceId) return`
// guard.
export function useWorkspaceData(wsId: string | null, enabled = true) {
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
          if (
            retryErr instanceof Response &&
            (retryErr.status === 401 || retryErr.status === 403)
          ) {
            await clearAuth();
          }
          throw retryErr;
        }
      }
      logUserProfile("Received /api/user response", userResponse);
      const { workspaces } = userResponse;
      await syncUserProfile(userResponse);
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
    enabled,
  });
}
