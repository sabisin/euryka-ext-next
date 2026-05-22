import { createContext, useContext, useEffect, useState } from "react";
import { useStorageItem } from "./use-storage-item";
import { userPrefs } from "../lib/storage";

type ResolvedTheme = "dark" | "light";

const ThemeContext = createContext<ResolvedTheme>("dark");

export function useTheme(): ResolvedTheme {
  return useContext(ThemeContext);
}

interface Props {
  children: React.ReactNode;
}

/**
 * Reads theme preference from storage, resolves "system" via matchMedia,
 * applies `data-theme` to `document.documentElement`, and exposes the
 * resolved value via ThemeContext so nested components can read it.
 */
export function ThemeProvider({ children }: Props) {
  const [prefs] = useStorageItem(userPrefs);
  const preference = prefs?.theme ?? "system";
  const [resolved, setResolved] = useState<ResolvedTheme>("dark");

  useEffect(() => {
    if (preference === "dark") {
      setResolved("dark");
      return;
    }
    if (preference === "light") {
      setResolved("light");
      return;
    }

    // "system" — follow the OS preference and watch for changes
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setResolved(mq.matches ? "dark" : "light");

    const handler = (e: MediaQueryListEvent) =>
      setResolved(e.matches ? "dark" : "light");

    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [preference]);

  // Apply the resolved theme as a data attribute on the document root
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", resolved);
  }, [resolved]);

  return (
    <ThemeContext value={resolved}>
      {children}
    </ThemeContext>
  );
}
