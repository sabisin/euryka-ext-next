import { useCallback, useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { SparkCard } from "./SparkCard";
import { Button } from "../shared/Button";
import type { Spark } from "../../lib/types";

interface Props {
  sparks: Spark[];
  onUseSpark: (spark: Spark) => void;
  perColumn?: number; // sparks per column (default 3)
}

// Responsive carousel: each "slide" is a vertical column of `perColumn` sparks.
// The number of columns visible at once depends on the panel width:
//   < 480px → 1, 480–719px → 2, ≥ 720px → 3
// Mirrors the original's `useGroupedSparks` breakpoint logic.
export function SparkCarousel({ sparks, onUseSpark, perColumn = 3 }: Props) {
  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: "start",
    containScroll: "trimSnaps",
    slidesToScroll: "auto",
  });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollSnaps, setScrollSnaps] = useState<number[]>([]);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  const onReInit = useCallback(() => {
    if (!emblaApi) return;
    setScrollSnaps(emblaApi.scrollSnapList());
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onReInit();
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onReInit);
    return () => {
      emblaApi.off("select", onSelect);
      emblaApi.off("reInit", onReInit);
    };
  }, [emblaApi, onSelect, onReInit]);

  // Re-init embla on viewport resize so slide widths and snap positions update.
  useEffect(() => {
    if (!emblaApi) return;
    const onResize = () => emblaApi.reInit();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [emblaApi]);

  // Build columns
  const columns: Spark[][] = [];
  for (let i = 0; i < sparks.length; i += perColumn) {
    columns.push(sparks.slice(i, i + perColumn));
  }

  if (columns.length === 0) return null;

  // Single column → no carousel chrome, just render it directly.
  if (columns.length === 1) {
    return (
      <div className="flex flex-col gap-2">
        {columns[0].map((spark) => (
          <SparkCard key={spark.id} spark={spark} onUse={onUseSpark} />
        ))}
      </div>
    );
  }

  const canPrev = selectedIndex > 0;
  const canNext = selectedIndex < scrollSnaps.length - 1;

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden" ref={emblaRef}>
        <div className="-ml-2 flex">
          {columns.map((column, i) => (
            <div
              key={i}
              className="min-w-0 flex-[0_0_100%] pl-2 min-[480px]:flex-[0_0_50%] min-[720px]:flex-[0_0_33.333%]"
            >
              <div className="flex flex-col gap-2">
                {column.map((spark) => (
                  <SparkCard key={spark.id} spark={spark} onUse={onUseSpark} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Controls — only when paging is actually possible */}
      {scrollSnaps.length > 1 && (
      <div className="flex items-center justify-center gap-3">
        <Button
          variant="outline"
          size="icon-md"
          onClick={() => emblaApi?.scrollPrev()}
          disabled={!canPrev}
          aria-label="Previous"
          className="rounded-full bg-muted text-foreground/70 hover:bg-secondary disabled:hover:bg-muted"
        >
          <ChevronLeft size={14} />
        </Button>

        <div className="flex items-center gap-1.5">
          {scrollSnaps.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => emblaApi?.scrollTo(i)}
              aria-label={`Go to page ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${
                i === selectedIndex ? "w-4 bg-foreground" : "w-1.5 bg-muted hover:bg-muted-foreground/30"
              }`}
            />
          ))}
        </div>

        <Button
          variant="outline"
          size="icon-md"
          onClick={() => emblaApi?.scrollNext()}
          disabled={!canNext}
          aria-label="Next"
          className="rounded-full bg-muted text-foreground/70 hover:bg-secondary disabled:hover:bg-muted"
        >
          <ChevronRight size={14} />
        </Button>
      </div>
      )}
    </div>
  );
}
