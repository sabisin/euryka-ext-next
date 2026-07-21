import { useState } from "react";

interface Props {
  url: string;
  alt?: string;
  className?: string;
}

export function MediaPreview({ url, alt = "Preview", className = "" }: Props) {
  const [error, setError] = useState(false);

  if (error) {
    return (
      <div
        className={`flex items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground ${className}`}
      >
        Failed to load image
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={alt}
      onError={() => setError(true)}
      className={`rounded-lg object-cover ${className}`}
    />
  );
}
