import React from "react";
import ReactDOM from "react-dom/client";
import "../../tailwind.css";
import App from "./App";
import { Button } from "../../components/shared/Button";
import { readCachedThemePreference, resolveThemePreference } from "../../hooks/use-resolved-theme";

// Apply the last resolved preference before React reads extension storage.
document.documentElement.setAttribute(
  "data-theme",
  resolveThemePreference(readCachedThemePreference())
);

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-background p-6 text-center text-foreground">
          <p className="text-sm font-medium">Something went wrong</p>
          <p className="text-xs text-muted-foreground">{(this.state.error as Error).message}</p>
          <Button variant="outline" size="sm" onClick={() => this.setState({ error: null })}>
            Retry
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

// StrictMode intentionally double-invokes effects in dev, which causes the
// @webext-core/messaging library (global singleton) to throw "only one listener
// can be setup" on the second registration. Omit StrictMode for the sidepanel.
const rootElement = document.getElementById("root")!;
const rootKey = "__eurykaSidePanelRoot";
const root = ((rootElement as unknown as Record<string, ReactDOM.Root | undefined>)[rootKey] ??=
  ReactDOM.createRoot(rootElement));

root.render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
