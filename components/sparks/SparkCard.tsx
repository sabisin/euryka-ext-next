import { Zap } from "lucide-react";
import { hexToRgba } from "../../lib/utils";
import { IconWrapper } from "../shared/IconWrapper";
import { Button } from "../shared/Button";
import type { Spark } from "../../lib/types";

interface Props {
  spark: Spark;
  onUse: (spark: Spark) => void;
}

// Tinted icon background uses the spark's color at 18% opacity.
export function SparkCard({ spark, onUse }: Props) {
  const color = spark.color || "#FF7074";
  const iconBg = hexToRgba(color, 0.18);

  return (
    <div
      className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 text-left"
    >
      <div className="flex min-w-0 items-center gap-3">
        <div
          style={{ backgroundColor: iconBg }}
          className="flex size-11 flex-shrink-0 items-center justify-center rounded-md"
        >
          <IconWrapper color={color} name={spark.icon} size={22} />
        </div>
        <div className="flex min-w-0 flex-col">
          <p className="line-clamp-1 text-sm font-medium text-foreground" title={spark.title}>
            {spark.title}
          </p>
          {spark.description && (
            <p className="line-clamp-2 text-xs text-muted-foreground">{spark.description}</p>
          )}
        </div>
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={() => onUse(spark)}
        className="shrink-0 bg-muted text-foreground/80"
      >
        <Zap size={12} />
        Use
      </Button>
    </div>
  );
}
