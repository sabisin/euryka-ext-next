import { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import "../../tailwind.css";
import logoLight from "../../assets/logo-remade-black-red.svg";
import logoDark from "../../assets/logo-remade-red-white.svg";
import { ResolvedThemeProvider, useTheme } from "../../hooks/use-resolved-theme";
import { useStorageItem } from "../../hooks/use-storage-item";
import { sendMessage } from "../../lib/messaging";
import { authStorage } from "../../lib/storage";
import type { AuthState, UserPrefs } from "../../lib/types";
import { AnnotationLayer } from "./AnnotationLayer";
import { DraggableButton } from "./DraggableButton";

const CONTENT_UI_HOST_CSS = `
  :host {
    pointer-events: none !important;
    overflow: visible !important;
    display: block !important;
  }
`;

function ContentUiApp() {
  const [prefs, setPrefs] = useState<UserPrefs | null>(null);
  const [auth] = useStorageItem<AuthState>(authStorage);

  useEffect(() => {
    let cancelled = false;

    const refreshPrefs = async () => {
      try {
        const nextPrefs = await sendMessage("getUserPrefs", undefined);
        if (!cancelled) {
          setPrefs((current) =>
            JSON.stringify(current) === JSON.stringify(nextPrefs) ? current : nextPrefs
          );
        }
      } catch {
        // Extension context may be unavailable on restricted pages.
      }
    };

    void refreshPrefs();
    const interval = window.setInterval(() => void refreshPrefs(), 1_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  return (
    <ResolvedThemeProvider preference={prefs?.theme}>
      <ThemedContentUi
        authenticated={Boolean(auth?.token)}
        prefs={prefs}
        onPrefsChange={setPrefs}
      />
    </ResolvedThemeProvider>
  );
}

interface ThemedContentUiProps {
  authenticated: boolean;
  prefs: UserPrefs | null;
  onPrefsChange: (prefs: UserPrefs) => void;
}

function ThemedContentUi({ authenticated, prefs, onPrefsChange }: ThemedContentUiProps) {
  const theme = useTheme();

  return (
    <div data-theme={theme} className="contents">
      {authenticated && <AnnotationLayer annotationsHidden={prefs?.annotationsHidden} />}
      {prefs?.showFloatingButton && (
        <DraggableButton
          logo={theme === "dark" ? logoDark : logoLight}
          prefs={prefs}
          onPrefsChange={onPrefsChange}
        />
      )}
    </div>
  );
}

export default defineContentScript({
  matches: ["<all_urls>"],
  cssInjectionMode: "ui",

  async main(ctx) {
    const rootKey = "__eurykaContentUiRoot";
    let root: ReactDOM.Root | null = null;
    let rootStore: Record<string, ReactDOM.Root | undefined> | null = null;

    const ui = await createShadowRootUi(ctx, {
      name: "euryka-content-ui",
      // Keep the host transparent and non-interactive. WXT's overlay mode
      // supplies a zero-sized anchor so the extension never covers the page.
      css: CONTENT_UI_HOST_CSS,
      position: "overlay",
      alignment: "top-left",
      zIndex: 9_999_999,
      anchor: "body",
      append: "last",
      onMount(container) {
        container.style.pointerEvents = "none";

        rootStore = container as unknown as Record<string, ReactDOM.Root | undefined>;
        root = rootStore[rootKey] ?? ReactDOM.createRoot(container);
        rootStore[rootKey] = root;
        root.render(<ContentUiApp />);
        return root;
      },
      onRemove() {
        root?.unmount();
        if (rootStore) delete rootStore[rootKey];
        root = null;
        rootStore = null;
      },
    });

    ui.mount();
  },
});
