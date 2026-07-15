import { Search } from "lucide-react";
import { useState } from "react";
import { useSparks } from "../../hooks/use-sparks";
import { DEBUG } from "../../lib/debug";
import type { ChatMode, Spark } from "../../lib/types";
import { hexToRgba } from "../../lib/utils";
import { IconWrapper } from "../shared/IconWrapper";
import { ChatBox } from "./ChatBox";
import { SparkCarousel } from "./SparkCarousel";

interface Props {
  lastFive: string[];
  currentUrl?: string | null;
  prospector?: {
    visible: boolean;
    title: string;
    description: string;
    icon: string;
    color: string;
    onClick: () => void;
  };
  chatApiKeyAvailable: boolean;
  chatMode: ChatMode;
  includePageContent: boolean;
  includeSelectedText: boolean;
  pageContentCharCount: number | null;
  selectedTextCharCount: number | null;
  pageContentExceedsLimit: boolean;
  selectedTextExceedsLimit: boolean;
  chatContextStatus: string | null;
  chatContextStatusTitle: string | null;
  chatProviderStatus: string | null;
  onUseSpark: (spark: Spark) => void;
  onStartChat: (message: string) => void;
  onOpenChatSettings: () => void;
  onChatModeChange: (mode: ChatMode) => void;
  onIncludePageContentChange: (checked: boolean) => void;
  onIncludeSelectedTextChange: (checked: boolean) => void;
}

export function SparksGallery({
  lastFive,
  currentUrl,
  prospector,
  chatApiKeyAvailable,
  chatMode,
  includePageContent,
  includeSelectedText,
  pageContentCharCount,
  selectedTextCharCount,
  pageContentExceedsLimit,
  selectedTextExceedsLimit,
  chatContextStatus,
  chatContextStatusTitle,
  chatProviderStatus,
  onUseSpark,
  onStartChat,
  onOpenChatSettings,
  onChatModeChange,
  onIncludePageContentChange,
  onIncludeSelectedTextChange,
}: Props) {
  const [search, setSearch] = useState("");
  const { data: groups = [], isLoading } = useSparks();

  const term = search.toLowerCase();
  const allSparks: Spark[] = groups.flatMap((g) => g.sparks);
  const visibleGroups = groups
    .map((g) => ({
      ...g,
      sparks: g.sparks.filter((s) => s.title.toLowerCase().includes(term)),
    }))
    .filter((g) => g.sparks.length > 0);

  const recentSparks = lastFive
    .map((id) => allSparks.find((s) => s.id === id))
    .filter((s): s is Spark => Boolean(s));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 bg-background/95 px-4 pb-3 pt-4 backdrop-blur supports-[backdrop-filter]:bg-background/75">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="text"
            placeholder="Search sparks…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-border bg-card py-2 pl-9 pr-3 text-sm text-foreground placeholder-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring/50"
          />
        </div>

        {DEBUG && (
          <div className="flex flex-col gap-0.5 text-[10px] text-muted-foreground">
            <p className="truncate" title={currentUrl ?? ""}>
              Current URL: {currentUrl || "(none)"}
            </p>
            <p className="truncate">Prospects visible: {String(Boolean(prospector?.visible))}</p>
          </div>
        )}
      </div>

      <div className="ek-scroll flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 pb-6 pt-2">
        {isLoading && (
          <div className="flex flex-col gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-[68px] rounded-lg border border-border bg-card animate-pulse"
              />
            ))}
          </div>
        )}

        {!isLoading && (
          <>
            {prospector?.visible && (
              <section className="flex flex-col gap-2.5">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {prospector.title}
                </h3>
                <button
                  type="button"
                  onClick={prospector.onClick}
                  title={prospector.title}
                  style={{ backgroundColor: hexToRgba(prospector.color, 0.18) }}
                  className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-md transition-[opacity,transform] hover:opacity-70 active:scale-95"
                >
                  <IconWrapper color={prospector.color} name={prospector.icon} size={18} />
                </button>
              </section>
            )}

            {/* Recent sparks */}
            {recentSparks.length > 0 && !search && (
              <section className="flex flex-col gap-2.5">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Recent
                </h3>
                <div className="flex flex-wrap gap-2">
                  {recentSparks.map((spark) => {
                    const color = spark.color || "#FF7074";
                    return (
                      <button
                        key={spark.id}
                        type="button"
                        onClick={() => onUseSpark(spark)}
                        title={spark.title}
                        style={{ backgroundColor: hexToRgba(color, 0.18) }}
                        className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-md transition-[opacity,transform] hover:opacity-70 active:scale-95"
                      >
                        <IconWrapper color={color} name={spark.icon} size={18} />
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Groups */}
            {visibleGroups.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                {search ? "No sparks match your search" : "No sparks available"}
              </p>
            ) : (
              visibleGroups.map((group) => (
                <section key={group.title} className="flex flex-col gap-2.5">
                  <div className="flex flex-col gap-0.5">
                    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {group.title || "Untitled"}
                    </h3>
                    {group.description && (
                      <p className="text-xs text-muted-foreground">{group.description}</p>
                    )}
                  </div>
                  <SparkCarousel sparks={group.sparks} onUseSpark={onUseSpark} />
                </section>
              ))
            )}
          </>
        )}
      </div>

      <div className="shrink-0 border-t border-border bg-background px-4 py-3">
        <ChatBox
          apiKeyAvailable={chatApiKeyAvailable}
          mode={chatMode}
          includePageContent={includePageContent}
          includeSelectedText={includeSelectedText}
          pageContentCharCount={pageContentCharCount}
          selectedTextCharCount={selectedTextCharCount}
          pageContentExceedsLimit={pageContentExceedsLimit}
          selectedTextExceedsLimit={selectedTextExceedsLimit}
          contextStatus={chatContextStatus}
          contextStatusTitle={chatContextStatusTitle}
          providerStatus={chatProviderStatus}
          onSubmit={onStartChat}
          onOpenSettings={onOpenChatSettings}
          onModeChange={onChatModeChange}
          onIncludePageContentChange={onIncludePageContentChange}
          onIncludeSelectedTextChange={onIncludeSelectedTextChange}
        />
      </div>
    </div>
  );
}

function isLinkedInUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "linkedin.com" || host.endsWith(".linkedin.com");
  } catch {
    return false;
  }
}
