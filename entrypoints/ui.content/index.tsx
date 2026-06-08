import ReactDOM from "react-dom/client";
import { useEffect, useState } from "react";
import "../../tailwind.css";
import { AnnotationLayer } from "./AnnotationLayer";
import { DraggableButton } from "./DraggableButton";
import { sendMessage } from "../../lib/messaging";
import type { UserPrefs } from "../../lib/types";
import logo from "../../assets/ek-alt-blue.svg";

function ContentUiApp() {
  const [prefs, setPrefs] = useState<UserPrefs | null>(null);

  useEffect(() => {
    let cancelled = false;

    const refreshPrefs = async () => {
      try {
        const nextPrefs = await sendMessage("getUserPrefs", undefined);
        if (!cancelled) {
          setPrefs((current) =>
            JSON.stringify(current) === JSON.stringify(nextPrefs) ? current : nextPrefs,
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
    <>
      <AnnotationLayer />
      {prefs?.showFloatingButton && <DraggableButton logo={logo} />}
    </>
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
      // inline + anchor body appends the shadow host to <body>
      // the DraggableButton inside uses position:fixed which works correctly
      position: "inline",
      anchor: "body",
      append: "last",
      onMount(container, _shadow, shadowHost) {
        shadowHost.style.position = "fixed";
        shadowHost.style.inset = "0";
        shadowHost.style.width = "100vw";
        shadowHost.style.height = "100vh";
        shadowHost.style.zIndex = "9999999";
        shadowHost.style.pointerEvents = "none";
        shadowHost.style.overflow = "visible";
        container.style.pointerEvents = "none";

        rootStore = container as unknown as Record<
          string,
          ReactDOM.Root | undefined
        >;
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
