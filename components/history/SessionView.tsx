import { ArrowLeft, Sparkles } from "lucide-react";
import { AnimatedMarkdown } from "../shared/AnimatedMarkdown";
import { StickyActionBar } from "../shared/StickyActionBar";
import { MediaPreview } from "../shared/MediaPreview";
import { IconWrapper } from "../shared/IconWrapper";
import { Button } from "../shared/Button";
import { useStorageItem } from "../../hooks/use-storage-item";
import { getSessionDisplay } from "../../lib/session-display";
import { sparkCacheStorage } from "../../lib/storage";
import type { Session } from "../../lib/types";

const BASE_URL = import.meta.env.WXT_BASE_URL as string;

interface Props {
  session: Session;
  wsId: string | null;
  onBack: () => void;
}

interface HeaderTitleProps {
  session: Session;
  onBack: () => void;
}

export function SessionHeaderTitle({ session, onBack }: HeaderTitleProps) {
  const [sparkCache] = useStorageItem(sparkCacheStorage);
  const { title, icon, color } = getSessionDisplay(session, sparkCache);

  return (
    <div className="flex min-w-0 items-center gap-3">
      <Button
        variant="icon"
        size="icon-md"
        onClick={onBack}
        className="shrink-0"
      >
        <ArrowLeft size={15} />
      </Button>
      {icon && <IconWrapper name={icon} color={color} size={15} />}
      <span className="truncate text-sm font-semibold text-foreground">
        {title}
      </span>
    </div>
  );
}

export function SessionView({ session, wsId, onBack }: Props) {
  const [sparkCache] = useStorageItem(sparkCacheStorage);
  const { imageUrl, isImageAnalysis } = getSessionDisplay(session, sparkCache);
  const openUrl =
    wsId && isImageAnalysis
      ? `${BASE_URL}/ws/${wsId}?ext_session=${session.id}`
      : wsId
        ? `${BASE_URL}/api/ws/${wsId}/extension/sessions/${session.id}/thread`
        : undefined;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
        {imageUrl && (
          <MediaPreview url={imageUrl} className="w-full max-h-48" />
        )}
        <AnimatedMarkdown content={session.content} />
      </div>

      <StickyActionBar
        content={session.content}
        openUrl={openUrl}
        openLabel={isImageAnalysis ? "Remix in Euryka" : undefined}
        openTitle={isImageAnalysis ? "Remix" : undefined}
        openIcon={isImageAnalysis ? Sparkles : undefined}
      />
    </div>
  );
}
