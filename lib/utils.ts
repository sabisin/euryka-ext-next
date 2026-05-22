// ── Identity colours ──────────────────────────────────────────────────────────
// 20 distinct colours — large palette keeps collision probability low even
// with similar-looking email addresses (e.g. two that start with the same letter).
const IDENTITY_PALETTE = [
  "#6366f1", // indigo
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // violet
  "#06b6d4", // cyan
  "#f97316", // orange
  "#ec4899", // pink
  "#14b8a6", // teal
  "#84cc16", // lime
  "#3b82f6", // blue
  "#a855f7", // purple
  "#22c55e", // green
  "#f43f5e", // rose
  "#0ea5e9", // sky
  "#d946ef", // fuchsia
  "#eab308", // yellow
  "#64748b", // slate
  "#0891b2", // cyan-600
  "#7c3aed", // violet-700
];

/**
 * Deterministic colour for an identity string — permanent & consistent.
 * Uses djb2 hash which distributes well even for strings with shared prefixes.
 */
export function identityColor(identity: string): string {
  let hash = 5381;
  for (let i = 0; i < identity.length; i++) {
    hash = ((hash << 5) + hash) ^ identity.charCodeAt(i);
    hash = hash >>> 0; // keep 32-bit unsigned
  }
  return IDENTITY_PALETTE[hash % IDENTITY_PALETTE.length];
}

/** First letter of the identity (email local-part or display name), uppercased. */
export function identityInitial(identity: string): string {
  return (identity.trim()[0] ?? "?").toUpperCase();
}

export function hexToRgba(hex: string, alpha = 1): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function lightenHex(hex: string, amount = 0.7): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const lighten = (c: number) => Math.round(c + (255 - c) * amount);
  return `#${[r, g, b].map((c) => lighten(c).toString(16).padStart(2, "0")).join("")}`;
}

export function debounce<T extends (...args: unknown[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout>;
  return ((...args: unknown[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as T;
}

export function cn(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(" ");
}

// API returns createdAt as a Firestore-style timestamp { _seconds, _nanoseconds }.
export function firestoreTsToDate(
  ts: { _seconds: number; _nanoseconds: number } | undefined | null,
): Date {
  if (!ts || typeof ts._seconds !== "number") return new Date(NaN);
  return new Date(ts._seconds * 1000 + Math.floor((ts._nanoseconds ?? 0) / 1e6));
}
