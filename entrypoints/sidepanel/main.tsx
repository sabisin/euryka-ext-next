import React from "react";
import ReactDOM from "react-dom/client";
import "../../tailwind.css";
import App from "./App";
import { Button } from "../../components/shared/Button";

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
        <div className="flex h-screen flex-col items-center justify-center gap-3 bg-zinc-950 p-6 text-center">
          <p className="text-sm font-medium text-zinc-200">Something went wrong</p>
          <p className="text-xs text-zinc-500">{(this.state.error as Error).message}</p>
          <Button
            variant="outline"
            size="sm"
            className="border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
            onClick={() => this.setState({ error: null })}
          >
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
const root =
  ((rootElement as unknown as Record<string, ReactDOM.Root | undefined>)[rootKey] ??=
    ReactDOM.createRoot(rootElement));

root.render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
