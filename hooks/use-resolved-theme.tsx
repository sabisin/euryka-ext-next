import { createContext, useContext, useEffect, useState } from "react";

export type ResolvedTheme = "dark" | "light";
export type ThemePreference = ResolvedTheme | "system" | undefined;
export const THEME_PREFERENCE_CACHE_KEY = "euryka:theme-preference";

const ThemeContext = createContext<ResolvedTheme>("dark");

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function resolveThemePreference(preference: ThemePreference): ResolvedTheme {
  return preference === "dark" || preference === "light" ? preference : getSystemTheme();
}

export function readCachedThemePreference(): ThemePreference {
  try {
    const value = localStorage.getItem(THEME_PREFERENCE_CACHE_KEY);
    return value === "dark" || value === "light" || value === "system" ? value : undefined;
  } catch {
    return undefined;
  }
}

export function useResolvedTheme(preference: ThemePreference): ResolvedTheme {
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() =>
    resolveThemePreference(undefined)
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (event: MediaQueryListEvent) =>
      setSystemTheme(event.matches ? "dark" : "light");

    setSystemTheme(media.matches ? "dark" : "light");
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  return preference === "dark" || preference === "light" ? preference : systemTheme;
}

export function useTheme(): ResolvedTheme {
  return useContext(ThemeContext);
}

interface ResolvedThemeProviderProps {
  children: React.ReactNode;
  preference?: ThemePreference;
  applyToDocumentRoot?: boolean;
}

/**
 * Resolves an explicit or system theme once for any React tree. Shadow-root
 * consumers leave document mutation disabled and apply `data-theme` to their
 * own root element instead.
 */
export function ResolvedThemeProvider({
  children,
  preference = "system",
  applyToDocumentRoot = false,
}: ResolvedThemeProviderProps) {
  const resolved = useResolvedTheme(preference);

  useEffect(() => {
    if (applyToDocumentRoot) {
      document.documentElement.setAttribute("data-theme", resolved);
    }
  }, [applyToDocumentRoot, resolved]);

  return <ThemeContext value={resolved}>{children}</ThemeContext>;
}
