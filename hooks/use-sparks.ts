import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchSparks, runSpark } from "../lib/api";
import { getValidToken } from "../lib/auth";
import { sparkCacheStorage } from "../lib/storage";

export function useSparks() {
  return useQuery({
    queryKey: ["sparks"],
    queryFn: async () => {
      const token = await getValidToken();
      if (!token) throw new Error("Not authenticated");
      const { sparks } = await fetchSparks(token);
      const sparkCache = Object.fromEntries(
        sparks.flatMap((group) => group.sparks).map((spark) => [spark.id, spark]),
      );
      await sparkCacheStorage.setValue(sparkCache);
      return sparks;
    },
    staleTime: 10 * 60_000,
  });
}

export function useRunSpark(wsId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      sparkId,
      pageUrl,
      pageContent,
      selectedText,
      brandId,
      projectId,
      workspaceId,
    }: {
      sparkId: string;
      pageUrl?: string;
      pageContent?: string;
      selectedText?: string;
      brandId?: string;
      projectId?: string;
      workspaceId?: string;
    }) => {
      const token = await getValidToken();
      if (!token) throw new Error("Not authenticated");
      const resolvedWsId = workspaceId ?? wsId;
      if (!resolvedWsId) throw new Error("No workspace selected");
      return runSpark(token, resolvedWsId, sparkId, { pageUrl, pageContent, selectedText, brandId, projectId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
    },
  });
}
