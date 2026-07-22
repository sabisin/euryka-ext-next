export function buildRemixUrl(
  baseUrl: string | undefined,
  workspaceId: string | null | undefined,
  sessionId: string | null | undefined
): string | undefined {
  if (!baseUrl || !workspaceId || !sessionId) return undefined;

  try {
    const url = new URL(`/ws/${encodeURIComponent(workspaceId)}`, baseUrl);
    url.searchParams.set("ext_session", sessionId);
    return url.toString();
  } catch {
    return undefined;
  }
}
