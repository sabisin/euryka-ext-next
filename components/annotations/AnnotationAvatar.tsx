import { useState } from "react";
import { identityInitial } from "../../lib/utils";

interface Props {
  avatarUrl?: string | null;
  label?: string | null;
  sizeClassName?: string;
  className?: string;
}

export function AnnotationAvatar({
  avatarUrl,
  label,
  sizeClassName = "h-8 w-8",
  className = "",
}: Props) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const imageUrl = avatarUrl && failedUrl !== avatarUrl ? avatarUrl : null;

  return (
    <span
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary text-xs font-semibold text-primary-foreground ${sizeClassName} ${className}`}
      title={label ?? undefined}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          draggable={false}
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
          onError={() => setFailedUrl(imageUrl)}
        />
      ) : (
        identityInitial(label ?? "Annotation")
      )}
    </span>
  );
}
