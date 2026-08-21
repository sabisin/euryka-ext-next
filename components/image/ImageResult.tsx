import { useEffect } from "react";
import { Image as ImageIcon, Sparkles } from "lucide-react";
import { buildRemixUrl } from "../../lib/remix-url";
import { AnimatedMarkdown } from "../shared/AnimatedMarkdown";
import { MediaPreview } from "../shared/MediaPreview";
import { StickyActionBar } from "../shared/StickyActionBar";

const BASE_URL = import.meta.env.WXT_BASE_URL as string;
// Temporarily hidden. Set to true to restore the Remix action.
const SHOW_REMIX_ACTION = false;
const LOADING_LINE_WIDTHS = ["76%", "91%", "84%", "96%", "72%", "88%"];

interface Props {
  imageUrl: string;
  result: string | null;
  sessionId: string | null;
  wsId: string | null;
  isLoading: boolean;
}

export function ImageResult({ imageUrl, result, sessionId, wsId, isLoading }: Props) {
  const remixUrl = SHOW_REMIX_ACTION ? buildRemixUrl(BASE_URL, wsId, sessionId) : undefined;

  // Revoke blob URLs on unmount
  useEffect(() => {
    return () => {
      if (imageUrl?.startsWith("blob:")) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 bg-background px-4 py-4 text-foreground">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
            <ImageIcon size={16} />
          </div>

          <span className="truncate text-sm text-foreground/70">Image Analysis</span>
        </div>
      </div>

      <div className="ek-scroll flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
        <MediaPreview url={imageUrl} className="w-full max-h-48" />

        {isLoading ? (
          <div className="flex flex-col gap-2">
            {LOADING_LINE_WIDTHS.map((width) => (
              <div
                key={width}
                className="h-3 animate-pulse rounded bg-muted"
                style={{ width }}
              />
            ))}
          </div>
        ) : result ? (
          <AnimatedMarkdown content={result} />
        ) : (
          <p className="text-sm text-destructive">
            We couldn't process that image. Please retry shortly.
          </p>
        )}
      </div>

      {result && !isLoading && (
        <StickyActionBar
          content={result}
          openUrl={remixUrl}
          openLabel="Remix in Euryka"
          openTitle="Remix"
          openIcon={Sparkles}
        />
      )}
    </div>
  );
}
