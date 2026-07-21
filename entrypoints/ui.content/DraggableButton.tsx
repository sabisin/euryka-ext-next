import { useEffect, useRef, useState } from "react";
import { GripHorizontal } from "lucide-react";
import { sendMessage } from "../../lib/messaging";
import { lightenHex } from "../../lib/utils";
import type { Spark, UserPrefs } from "../../lib/types";
import { IconWrapper } from "../../components/shared/IconWrapper";
import { Tooltip } from "./Tooltip";

const DEFAULT_POSITION = 0.6;
const MIN_Y_PERCENT = 0.1;
const MAX_Y_PERCENT = 0.9;
const BUTTON_WIDTH = 40;
const COLLAPSED_HEIGHT = 40;
const EXPANDED_HEIGHT = 58;
const GRIP_ICON_SIZE = 14;

interface Props {
  logo: string;
  prefs: UserPrefs;
  onPrefsChange: (prefs: UserPrefs) => void;
}

const clamp = (v: number) => Math.max(MIN_Y_PERCENT, Math.min(MAX_Y_PERCENT, v));

export function DraggableButton({ logo, prefs, onPrefsChange }: Props) {
  const [hovered, setHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [logoLoaded, setLogoLoaded] = useState(false);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const offsetY = useRef(0);

  const spark: Spark | null = prefs?.lastUsedSpark ?? null;
  const sparkBg = spark?.color ? lightenHex(spark.color, 0.7) : "#FF7074";
  const buttonY = clamp(prefs?.actionButtonY ?? DEFAULT_POSITION);

  useEffect(() => {
    if (!wrapperRef.current) return;
    wrapperRef.current.style.top = `${buttonY * 100}%`;
    wrapperRef.current.style.transform = "translateY(-50%)";
  }, [buttonY]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current || !wrapperRef.current) return;
      const h = wrapperRef.current.offsetHeight;
      const minY = window.innerHeight * MIN_Y_PERCENT + h / 2;
      const maxY = window.innerHeight * MAX_Y_PERCENT - h / 2;
      const newY = Math.min(Math.max(e.clientY - offsetY.current, minY), maxY);
      wrapperRef.current.style.top = `${newY}px`;
      wrapperRef.current.style.transform = "translateY(-50%)";
    };

    const onUp = async () => {
      if (!dragging.current) return;
      dragging.current = false;
      setIsDragging(false);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";

      if (!wrapperRef.current) return;
      const rect = wrapperRef.current.getBoundingClientRect();
      const pct = clamp((rect.top + rect.height / 2) / window.innerHeight);
      try {
        const nextPrefs = await sendMessage("updateUserPrefs", { actionButtonY: pct });
        onPrefsChange(nextPrefs);
      } catch {
        // Extension context invalidated.
      }
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [onPrefsChange]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!wrapperRef.current) return;
    dragging.current = true;
    setIsDragging(true);
    const rect = wrapperRef.current.getBoundingClientRect();
    offsetY.current = e.clientY - (rect.top + rect.height / 2);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";
  };

  const handleAvatarClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    sendMessage("openSidePanel", undefined).catch(() => {});
  };

  const handleSparkClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!spark) return;
    sendMessage("triggerSpark", { sparkId: spark.id }).catch(() => {});
  };

  if (prefs?.actionButtonY === undefined) return null;

  const expanded = hovered || isDragging;
  const dynamicHeight = (expanded ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT) + (spark ? 32 : 0);

  return (
    <div
      ref={wrapperRef}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onMouseDown={handleMouseDown}
      role="button"
      tabIndex={0}
      aria-label="Euryka"
      className={`pointer-events-auto fixed right-0 z-[200] flex flex-col items-center justify-center overflow-hidden rounded-l-xl border border-border bg-background text-foreground shadow-md transition-[height] duration-200 ease-linear ${
        isDragging ? "cursor-grabbing" : "cursor-grab"
      }`}
      style={{
        top: `${buttonY * 100}%`,
        transform: "translateY(-50%)",
        height: `${dynamicHeight}px`,
        width: `${BUTTON_WIDTH}px`,
      }}
    >
      <div className="flex max-h-full w-full flex-col items-center justify-center">
        <div className="flex flex-col items-center gap-[8px]">
          {spark && (
            <Tooltip label={spark.title} sublabel={spark.description}>
              <button
                type="button"
                onClick={handleSparkClick}
                onMouseDown={(e) => e.stopPropagation()}
                style={{ backgroundColor: sparkBg }}
                className="flex h-[24px] w-[24px] flex-shrink-0 cursor-pointer items-center justify-center rounded-[4px] transition-opacity duration-200 hover:opacity-60"
              >
                <IconWrapper name={spark.icon} color={spark.color ?? "#FF7074"} size={15} />
              </button>
            </Tooltip>
          )}

          <Tooltip label="Toggle side panel">
            <button
              type="button"
              onClick={handleAvatarClick}
              onMouseDown={(e) => e.stopPropagation()}
              aria-label="Open side panel"
              className="flex w-full cursor-pointer items-center justify-center"
              draggable={false}
            >
              {logo ? (
                <img
                  src={logo}
                  alt="Euryka"
                  draggable={false}
                  onDragStart={(e) => e.preventDefault()}
                  onLoad={() => setLogoLoaded(true)}
                  onError={() => setLogoLoaded(false)}
                  className={`h-[24px] w-[24px] ${logoLoaded ? "" : "opacity-50"}`}
                />
              ) : (
                <span className="text-[14px] font-bold text-foreground">E</span>
              )}
            </button>
          </Tooltip>
        </div>

        <span
          aria-hidden
          className={`flex items-center justify-center overflow-hidden transition-all duration-200 ease-linear ${
            expanded
              ? `mt-[4px] h-[14px] translate-y-0 scale-100 opacity-100 ${
                  isDragging ? "cursor-grabbing" : "cursor-grab"
                }`
              : "pointer-events-none h-0 translate-y-1 scale-90 opacity-0"
          }`}
        >
          <GripHorizontal size={GRIP_ICON_SIZE} className="text-muted-foreground" />
        </span>
      </div>
    </div>
  );
}
