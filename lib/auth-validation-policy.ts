export const AUTH_VALIDATION_TTL_MS = 30_000;

export function isAuthValidationFresh(
  validatedAt: number,
  now = Date.now(),
  ttlMs = AUTH_VALIDATION_TTL_MS
): boolean {
  return validatedAt > 0 && now - validatedAt < ttlMs;
}
