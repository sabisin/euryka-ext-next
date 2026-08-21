import { ArrowLeft, Sparkles } from "lucide-react";
import { useStorageItem } from "../../hooks/use-storage-item";
import { getSessionDisplay } from "../../lib/session-display";
import { buildRemixUrl } from "../../lib/remix-url";
import { sparkCacheStorage } from "../../lib/storage";
import type { Session } from "../../lib/types";
import { AnimatedMarkdown } from "../shared/AnimatedMarkdown";
import { Button } from "../shared/Button";
import { IconWrapper } from "../shared/IconWrapper";
import { MarkdownScrollArea } from "../shared/MarkdownScrollArea";
import { MediaPreview } from "../shared/MediaPreview";
import { StickyActionBar } from "../shared/StickyActionBar";

const BASE_URL = import.meta.env.WXT_BASE_URL as string;
// Temporarily hidden. Set to true to restore the Remix action.
const SHOW_REMIX_ACTION = false;

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
      <Button variant="icon" size="icon-md" onClick={onBack} className="shrink-0">
        <ArrowLeft size={15} />
      </Button>
      {icon && <IconWrapper name={icon} color={color} size={15} />}
      <span className="truncate text-sm font-semibold text-foreground">{title}</span>
    </div>
  );
}

export function SessionView({ session, wsId }: Props) {
  const [sparkCache] = useStorageItem(sparkCacheStorage);
  const { imageUrl, isImageSession } = getSessionDisplay(session, sparkCache);
  const openUrl = isImageSession
    ? SHOW_REMIX_ACTION
      ? buildRemixUrl(BASE_URL, wsId, session.id)
      : undefined
    : wsId
      ? `${BASE_URL}/api/ws/${wsId}/extension/sessions/${session.id}/thread`
      : undefined;

  return (
    <div className="flex flex-col h-full">
      <MarkdownScrollArea className="flex flex-col gap-4 px-4 py-4">
        {imageUrl && <MediaPreview url={imageUrl} className="w-full max-h-48" />}
        <AnimatedMarkdown content={session.content} />
      </MarkdownScrollArea>

      <StickyActionBar
        content={session.content}
        openUrl={openUrl}
        openLabel={isImageSession ? "Remix in Euryka" : undefined}
        openTitle={isImageSession ? "Remix" : undefined}
        openIcon={isImageSession ? Sparkles : undefined}
      />
    </div>
  );
}
