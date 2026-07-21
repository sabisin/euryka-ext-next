import { useRef, useState } from "react";

interface Props {
  label: string;
  sublabel?: string;
  children: React.ReactNode;
}

/**
 * Lightweight tooltip that renders entirely within the Shadow DOM
 * (no portal, no Radix — just a positioned sibling div).
 * Always opens to the LEFT, matching the floating button's position on the
 * right edge of the viewport.
 */
export function Tooltip({ label, sublabel, children }: Props) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = () => {
    timerRef.current = setTimeout(() => setVisible(true), 400);
  };
  const hide = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
  };

  return (
    <div className="relative flex items-center" onMouseEnter={show} onMouseLeave={hide}>
      {children}

      {visible && (
        <div
          role="tooltip"
          className="pointer-events-none absolute right-[calc(100%+10px)] top-1/2 -translate-y-1/2 z-10 flex flex-col gap-0.5 whitespace-nowrap rounded-md border border-border bg-popover px-2.5 py-1.5 text-popover-foreground shadow-xl"
        >
          <span className="text-xs font-medium">{label}</span>
          {sublabel && (
            <span className="text-[10px] leading-tight text-muted-foreground">{sublabel}</span>
          )}
          {/* Arrow pointing right */}
          <span
            aria-hidden
            className="absolute right-[-5px] top-1/2 -translate-y-1/2 h-2.5 w-2.5 rotate-45 rounded-br-sm border-b border-r border-border bg-popover"
          />
        </div>
      )}
    </div>
  );
}
