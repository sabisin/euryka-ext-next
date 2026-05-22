import type { PageKey } from "../../lib/types";

const PAGE_LABELS: Record<PageKey, string> = {
  sparks: "Sparks",
  annotations: "Annotations",
  history: "History",
  collections: "Collections",
  settings: "Settings",
};

interface Props {
  currentPage: PageKey;
  leftSlot?: React.ReactNode;
  titleSlot?: React.ReactNode;
  centerTitle?: boolean;
}

export function Header({
  currentPage,
  leftSlot,
  titleSlot,
  centerTitle = false,
}: Props) {
  if (titleSlot) {
    return (
      <header className="flex h-16 shrink-0 items-center border-b border-border bg-background px-4 text-foreground">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {leftSlot}
          {titleSlot}
        </div>
      </header>
    );
  }

  return (
    <header className="grid h-16 shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b border-border bg-background px-4 text-foreground">
      <div className="flex min-w-0 items-center gap-3">
        {leftSlot}
        {!centerTitle && (
          <span className="truncate text-sm font-semibold">
            {PAGE_LABELS[currentPage]}
          </span>
        )}
      </div>

      {centerTitle && (
        <span className="text-sm font-semibold">
          {PAGE_LABELS[currentPage]}
        </span>
      )}

      <div />
    </header>
  );
}
