import type { ComponentProps } from "react";
import type { LinkedInProspectData } from "../../lib/types";
import { ImageResult } from "../image/ImageResult";
import { ProspectorResult } from "../sparks/ProspectorResult";
import { SparksGallery } from "../sparks/SparksGallery";
import { SparksResult } from "../sparks/SparksResult";
import { ChatPage, type ChatPageProps } from "./ChatPage";

interface SparksPageProps {
  selectedImageUrl: string | null;
  imageProps: Omit<ComponentProps<typeof ImageResult>, "imageUrl">;
  showChatResult: boolean;
  chatProps: ChatPageProps;
  showSparkResult: boolean;
  prospectorResult: LinkedInProspectData | null;
  prospectorProps: Omit<ComponentProps<typeof ProspectorResult>, "prospect">;
  sparkResult: string | null;
  sparkResultProps: Omit<ComponentProps<typeof SparksResult>, "result">;
  isLoadingSpark: boolean;
  galleryProps: ComponentProps<typeof SparksGallery>;
}

export function SparksPage({
  selectedImageUrl,
  imageProps,
  showChatResult,
  chatProps,
  showSparkResult,
  prospectorResult,
  prospectorProps,
  sparkResult,
  sparkResultProps,
  isLoadingSpark,
  galleryProps,
}: SparksPageProps) {
  if (selectedImageUrl) {
    return <ImageResult imageUrl={selectedImageUrl} {...imageProps} />;
  }

  if (showChatResult) return <ChatPage {...chatProps} />;

  if (showSparkResult && prospectorResult) {
    return <ProspectorResult prospect={prospectorResult} {...prospectorProps} />;
  }

  if (showSparkResult && sparkResult) {
    return <SparksResult result={sparkResult} {...sparkResultProps} />;
  }

  if (isLoadingSpark) {
    return (
      <div className="flex flex-col gap-2 p-4">
        {[1, 2, 3, 4].map((index) => (
          <div
            key={index}
            className="h-3 animate-pulse rounded bg-muted"
            style={{ width: `${60 + index * 10}%` }}
          />
        ))}
      </div>
    );
  }

  return <SparksGallery {...galleryProps} />;
}
