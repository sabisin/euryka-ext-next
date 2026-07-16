import { useEffect } from "react";
import { debugLog } from "../../lib/debug";
import { describeMarkdownContent } from "../../lib/markdown-diagnostics";
import type { Spark } from "../../lib/types";
import { AnimatedMarkdown } from "../shared/AnimatedMarkdown";
import { IconWrapper } from "../shared/IconWrapper";
import { MarkdownScrollArea } from "../shared/MarkdownScrollArea";
import { StickyActionBar } from "../shared/StickyActionBar";

const BASE_URL = import.meta.env.WXT_BASE_URL as string;
const logSparkRender = debugLog("[Euryka spark render]");

interface Props {
  result: string;
  sessionId: string | null;
  sourceUrl: string | null;
  spark: Spark | null;
  wsId: string | null;
  onBack: () => void;
}

export function SparksResult({ result, sessionId, sourceUrl, spark, wsId }: Props) {
  const threadUrl =
    wsId && sessionId
      ? `${BASE_URL}/api/ws/${wsId}/extension/sessions/${sessionId}/thread`
      : undefined;
  const sourceHost = getHostname(sourceUrl);

  useEffect(() => {
    logSparkRender("rendering markdown content", {
      sparkId: spark?.id ?? null,
      sparkTitle: spark?.title ?? null,
      sessionId,
      ...describeMarkdownContent(result),
    });
  }, [result, sessionId, spark?.id, spark?.title]);

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 bg-background px-4 py-4 text-foreground">
        {spark && (
          <div className="flex min-w-0 items-center gap-2">
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
              style={{ backgroundColor: spark.color || "#ff7074" }}
            >
              <IconWrapper name={spark.icon} color="white" size={16} />
            </div>

            <span className="truncate text-sm text-foreground/70">{spark.title}</span>

            {sourceUrl && sourceHost && (
              <a
                href={sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 truncate text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground/70"
              >
                Source: {sourceHost}
              </a>
            )}
          </div>
        )}
      </div>

      <MarkdownScrollArea className="px-4 py-4">
        <AnimatedMarkdown content={result} />
      </MarkdownScrollArea>

      <StickyActionBar content={result} openUrl={threadUrl} />
    </div>
  );
}

function getHostname(url: string | null | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
