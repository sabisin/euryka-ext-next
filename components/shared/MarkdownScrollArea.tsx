import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

interface Props {
  children: ReactNode;
  className?: string;
  nativeScrollbar?: boolean;
}

export function MarkdownScrollArea({ children, className = "", nativeScrollbar = false }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [showBlur, setShowBlur] = useState(false);

  const updateBlur = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    setShowBlur(distanceFromBottom > 4);
  }, []);

  useEffect(() => {
    updateBlur();
    const observer = new ResizeObserver(updateBlur);
    if (viewportRef.current) observer.observe(viewportRef.current);
    if (contentRef.current) observer.observe(contentRef.current);
    return () => observer.disconnect();
  }, [updateBlur]);

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={viewportRef}
        className={`${nativeScrollbar ? "" : "ek-scroll "}h-full overflow-y-auto`}
        onScroll={updateBlur}
      >
        <div ref={contentRef} className={className}>
          {children}
        </div>
      </div>
      {showBlur && <div aria-hidden className="markdown-result-progressive-blur" />}
    </div>
  );
}
