// Centralised debug logging.
//
// Verbose, potentially PII-bearing diagnostic logs (emails, page content,
// request/response payloads) must never run in production builds. They are
// gated behind both Vite development mode and the WXT_DEBUG env flag. Errors are intentionally NOT routed
// through here — keep using console.error directly so real failures are always
// visible.
export const DEBUG = import.meta.env.DEV && import.meta.env.WXT_DEBUG === "true";

/**
 * Build a prefixed debug logger. The returned function is a no-op unless
 * the build is a development build and WXT_DEBUG === "true".
 *
 *   const log = debugLog("[Euryka history]");
 *   log("pagination", { page });
 */
export function debugLog(prefix: string) {
  return (message: string, details?: unknown) => {
    if (!DEBUG) return;
    console.info(`${prefix} ${message}`, details ?? "");
  };
}
