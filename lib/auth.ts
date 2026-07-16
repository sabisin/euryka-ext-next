import { authStorage } from "./storage";

interface JwtPayload {
  exp?: number;
  name?: string;
  email?: string;
  picture?: string;
  avatar_url?: string;
  // Firebase / generic identity claims
  user_id?: string;
  [key: string]: unknown;
}

export function decodeJwt(token: string): JwtPayload {
  try {
    const segment = token.split(".")[1];
    if (!segment) return {};
    const base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64)) as JwtPayload;
  } catch {
    return {};
  }
}

export function isTokenExpired(expDate: string): boolean {
  if (!expDate) return true;
  return Date.now() >= new Date(expDate).getTime();
}

export async function fetchAndStoreToken(): Promise<string | null> {
  try {
    const baseUrl = import.meta.env.WXT_BASE_URL as string;
    const res = await fetch(`${baseUrl}/api/auth/token`, {
      credentials: "include",
    });
    if (!res.ok) {
      // Only a definitive auth rejection invalidates the stored token. A
      // backend hiccup (5xx, gateway error) must not log the user out.
      if (res.status === 401 || res.status === 403) {
        await clearAuth();
      }
      return null;
    }
    const { token } = (await res.json()) as { token: string };
    const payload = decodeJwt(token);
    const expDate = payload.exp
      ? new Date(payload.exp * 1000).toISOString()
      : new Date(Date.now() + 3600_000).toISOString();
    const current = await authStorage.getValue();
    await authStorage.setValue({
      ...current,
      token,
      expDate,
      name: payload.name ?? current.name,
      email: payload.email ?? current.email,
      avatarUrl: payload.picture ?? payload.avatar_url ?? current.avatarUrl,
    });
    return token;
  } catch {
    // Network failure — keep any existing token; it may still be valid.
    return null;
  }
}

export async function getValidToken(): Promise<string | null> {
  const auth = await authStorage.getValue();
  if (auth.token && !isTokenExpired(auth.expDate)) return auth.token;
  return fetchAndStoreToken();
}

export async function clearAuth(): Promise<void> {
  await authStorage.setValue({ token: "", expDate: "" });
}

export async function runWithTokenRetry<T>(fn: (token: string) => Promise<T>): Promise<T> {
  const token = await getValidToken();
  if (!token) throw new Error("Not authenticated");
  try {
    return await fn(token);
  } catch (err) {
    if (err instanceof Response && (err.status === 401 || err.status === 403)) {
      const fresh = await fetchAndStoreToken();
      if (!fresh) {
        // fetchAndStoreToken already cleared auth if the refresh was rejected;
        // for a network failure we keep the stored token and just report.
        throw new Error("Token refresh failed");
      }
      return fn(fresh);
    }
    throw err;
  }
}
