import { useEffect } from "react";
import { userPrefs } from "../lib/storage";
import {
  readCachedThemePreference,
  ResolvedThemeProvider,
  THEME_PREFERENCE_CACHE_KEY,
} from "./use-resolved-theme";
import { useStorageItem } from "./use-storage-item";

interface ThemeProviderProps {
  children: React.ReactNode;
}

/** Reads the stored preference and applies the resolved theme to the side panel document. */
export function ThemeProvider({ children }: ThemeProviderProps) {
  const [prefs] = useStorageItem(userPrefs);
  const preference = prefs ? (prefs.theme ?? "system") : readCachedThemePreference();

  useEffect(() => {
    if (!prefs) return;
    try {
      localStorage.setItem(THEME_PREFERENCE_CACHE_KEY, prefs.theme ?? "system");
    } catch {
      // The cache is only a pre-render optimization; extension storage remains authoritative.
    }
  }, [prefs]);

  return (
    <ResolvedThemeProvider preference={preference} applyToDocumentRoot>
      {children}
    </ResolvedThemeProvider>
  );
}
