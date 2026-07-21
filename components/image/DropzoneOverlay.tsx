import { useState } from "react";
import { Upload } from "lucide-react";
import { getDraggedImage, validateDraggedImage } from "../../lib/image-utils";
import type { DragImageResult } from "../../lib/types";

interface Props {
  onDrop: (result: DragImageResult) => void;
  onClose: () => void;
}

export function DropzoneOverlay({ onDrop, onClose }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [isHovered, setIsHovered] = useState(false);

  const showError = (msg: string) => {
    setError(msg);
    setTimeout(() => {
      setError(null);
      onClose();
    }, 2200);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    try {
      const result = getDraggedImage(e.nativeEvent);
      if (!result) {
        onClose();
        return;
      }
      validateDraggedImage(result);
      onDrop(result);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Could not process image.");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) onClose();
      }}
      onDrop={handleDrop}
      onClick={onClose}
    >
      <div
        className={`flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed p-10 transition-colors ${
          isHovered ? "border-primary bg-card" : "border-border bg-card/80"
        }`}
        onDragEnter={() => setIsHovered(true)}
        onDragLeave={() => setIsHovered(false)}
        onClick={(e) => e.stopPropagation()}
      >
        {error ? (
          <p className="text-sm font-medium text-destructive">{error}</p>
        ) : (
          <>
            <Upload size={28} className="text-muted-foreground" />
            <p className="text-sm font-medium text-foreground/80">Drop image here</p>
            <p className="text-xs text-muted-foreground">Max 16 MB · PNG, JPG, GIF, WebP…</p>
          </>
        )}
      </div>
    </div>
  );
}
