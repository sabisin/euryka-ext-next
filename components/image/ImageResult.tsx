import { useEffect } from "react";
import { ArrowLeft, Sparkles } from "lucide-react";
import { AnimatedMarkdown } from "../shared/AnimatedMarkdown";
import { StickyActionBar } from "../shared/StickyActionBar";
import { MediaPreview } from "../shared/MediaPreview";
import { Button } from "../shared/Button";

const BASE_URL = import.meta.env.WXT_BASE_URL as string;

interface Props {
  imageUrl: string;
  result: string | null;
  sessionId: string | null;
  wsId: string | null;
  isLoading: boolean;
  onBack: () => void;
}

export function ImageResult({ imageUrl, result, sessionId, wsId, isLoading, onBack }: Props) {
  const remixUrl =
    wsId && sessionId ? `${BASE_URL}/ws/${wsId}?ext_session=${sessionId}` : undefined;

  // Revoke blob URLs on unmount
  useEffect(() => {
    return () => {
      if (imageUrl?.startsWith("blob:")) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3 shrink-0">
        <Button
          variant="icon"
          size="icon-md"
          onClick={onBack}
        >
          <ArrowLeft size={15} />
        </Button>
        <span className="text-sm font-medium text-foreground">Image Analysis</span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
        <MediaPreview url={imageUrl} className="w-full max-h-48" />

        {isLoading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-3 rounded bg-muted animate-pulse"
                style={{ width: `${70 + Math.random() * 30}%` }}
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
