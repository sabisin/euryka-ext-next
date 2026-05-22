import { authStorage } from "./storage";

interface JwtPayload {
  exp?: number;
  name?: string;
  email?: string;
  // Firebase / generic identity claims
  user_id?: string;
  [key: string]: unknown;
}

export function decodeJwt(token: string): JwtPayload {
  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
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
      await clearAuth();
      return null;
    }
    const { token } = (await res.json()) as { token: string };
    const payload = decodeJwt(token);
    const expDate = payload.exp
      ? new Date(payload.exp * 1000).toISOString()
      : new Date(Date.now() + 3600_000).toISOString();
    await authStorage.setValue({
      token,
      expDate,
      name: payload.name,
      email: payload.email,
    });
    return token;
  } catch {
    await clearAuth();
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
        await clearAuth();
        throw new Error("Token refresh failed");
      }
      return fn(fresh);
    }
    throw err;
  }
}
