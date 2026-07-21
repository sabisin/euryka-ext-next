import { Monitor, Moon, Sun } from "lucide-react";
import type { UserPrefs } from "../../lib/types";
import { ChatApiKeySettings } from "../settings/ChatApiKeySettings";
import { Button } from "../shared/Button";

interface SettingsPageProps {
  chatProviderEnabled: boolean;
  chatApiKey: string;
  prefs: UserPrefs | undefined;
  defaultPrefs: UserPrefs;
  onSaveChatApiKey: (apiKey: string) => Promise<void>;
  onChangePrefs: (updater: UserPrefs | ((prefs: UserPrefs) => UserPrefs)) => Promise<void>;
}

export function SettingsPage({
  chatProviderEnabled,
  chatApiKey,
  prefs,
  defaultPrefs,
  onSaveChatApiKey,
  onChangePrefs,
}: SettingsPageProps) {
  return (
    <div className="flex flex-col gap-px overflow-y-auto">
      {chatProviderEnabled && (
        <ChatApiKeySettings
          apiKey={chatApiKey}
          onSave={onSaveChatApiKey}
          onRemove={() => onSaveChatApiKey("")}
        />
      )}
      <div className="flex items-center justify-between border-b border-border px-4 py-4">
        <div>
          <p className="text-sm font-medium text-foreground">Theme</p>
          <p className="text-xs text-muted-foreground">Appearance preference</p>
        </div>
        <div className="flex items-center overflow-hidden rounded-lg border border-border">
          {(["system", "light", "dark"] as const).map((value) => {
            const active = (prefs?.theme ?? "system") === value;
            const icon =
              value === "system" ? (
                <Monitor size={13} />
              ) : value === "light" ? (
                <Sun size={13} />
              ) : (
                <Moon size={13} />
              );
            return (
              <Button
                key={value}
                variant={active ? "primary" : "icon"}
                size="icon-lg"
                title={value.charAt(0).toUpperCase() + value.slice(1)}
                onClick={() =>
                  onChangePrefs((current) => ({
                    ...defaultPrefs,
                    ...current,
                    theme: value,
                  }))
                }
                className="h-8 w-8 rounded-none"
              >
                {icon}
              </Button>
            );
          })}
        </div>
      </div>
      <div className="flex items-center justify-between border-b border-border px-4 py-4">
        <div>
          <p className="text-sm font-medium text-foreground">Floating button</p>
          <p className="text-xs text-muted-foreground">Show the quick-action button on pages</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-label="Show floating button"
          aria-checked={prefs?.showFloatingButton}
          onClick={() =>
            onChangePrefs((current) => ({
              ...defaultPrefs,
              ...current,
              showFloatingButton: !current?.showFloatingButton,
            }))
          }
          className={`inline-flex h-6 w-10 shrink-0 items-center rounded-full p-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${prefs?.showFloatingButton ? "bg-primary" : "bg-muted ring-1 ring-inset ring-border"}`}
        >
          <span
            className={`h-5 w-5 rounded-full shadow-sm ring-1 transition-transform ${prefs?.showFloatingButton ? "translate-x-4 bg-primary-foreground ring-primary-foreground/20" : "translate-x-0 bg-muted-foreground ring-border"}`}
          />
        </button>
      </div>
    </div>
  );
}
