import { AlertCircle, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { getDraggedImage, validateDraggedImage } from "../../lib/image-utils";
import type { DragImageResult } from "../../lib/types";

interface Props {
  onDrop: (result: DragImageResult) => void;
  onClose: () => void;
  onError: (message: string, durationMs: number) => void;
}

const DEFAULT_ERROR_DURATION_MS = 2200;
const IMAGE_ONLY_WARNING_DURATION_MS = 1800;

export function DropzoneOverlay({ onDrop, onClose, onError }: Props) {
  const [isHovered, setIsHovered] = useState(false);

  const showError = (msg: string) => {
    const duration = msg.startsWith("Only images are allowed")
      ? IMAGE_ONLY_WARNING_DURATION_MS
      : DEFAULT_ERROR_DURATION_MS;
    onError(msg, duration);
    onClose();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsHovered(false);
    try {
      const result = getDraggedImage(e.nativeEvent);
      if (!result) {
        showError("Only images are allowed.");
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
      onDragEnter={(e) => {
        e.preventDefault();
        setIsHovered(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        const nextTarget = e.relatedTarget;
        if (nextTarget instanceof Node && e.currentTarget.contains(nextTarget)) return;
        setIsHovered(false);
        onClose();
      }}
      onDragEnd={onClose}
      onDrop={handleDrop}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        className={`flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed p-10 transition-colors ${
          isHovered ? "border-primary bg-card" : "border-border bg-card/80"
        }`}
      >
        <Upload size={28} className="text-muted-foreground" />
        <p className="text-sm font-medium text-foreground/80">Drop image here</p>
        <p className="text-xs text-muted-foreground">Max 16 MB · PNG, JPG, GIF, WebP…</p>
      </div>
    </div>
  );
}

// Asymmetric on purpose: the toast settles in with a decelerating curve, then
// accelerates away on a shorter exit so a dismissed error never lingers.
// The exit duration is exported so the owner can unmount only once it finishes.
export const DROP_ERROR_ENTER_DURATION_MS = 240;
export const DROP_ERROR_EXIT_DURATION_MS = 160;

const ENTER_MOTION =
  "translate-y-0 scale-100 opacity-100 duration-240 ease-[cubic-bezier(0.16,1,0.3,1)]";
const BEFORE_ENTER_MOTION =
  "translate-y-3 scale-95 opacity-0 duration-240 ease-[cubic-bezier(0.16,1,0.3,1)]";
const EXIT_MOTION =
  "translate-y-2 scale-[0.98] opacity-0 duration-160 ease-[cubic-bezier(0.4,0,0.9,1)]";

export function DropErrorToast({ message, exiting }: { message: string; exiting: boolean }) {
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    // Two frames: the first guarantees the pre-enter state is painted, so the
    // browser has something to transition away from.
    let innerFrameId = 0;
    const frameId = window.requestAnimationFrame(() => {
      innerFrameId = window.requestAnimationFrame(() => setEntered(true));
    });
    return () => {
      window.cancelAnimationFrame(frameId);
      window.cancelAnimationFrame(innerFrameId);
    };
  }, []);

  const motion = exiting ? EXIT_MOTION : entered ? ENTER_MOTION : BEFORE_ENTER_MOTION;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`pointer-events-none fixed bottom-4 right-4 z-50 flex w-fit max-w-[calc(100%-2rem)] origin-bottom-right items-start gap-2.5 rounded-lg border border-destructive/30 bg-card px-3.5 py-3 text-card-foreground shadow-lg transition-[opacity,transform] will-change-[opacity,transform] motion-reduce:translate-y-0 motion-reduce:scale-100 motion-reduce:transition-[opacity] motion-reduce:duration-150 motion-reduce:ease-linear ${motion}`}
    >
      <AlertCircle size={17} className="mt-0.5 shrink-0 text-destructive" />
      <p className="max-w-64 text-sm leading-5">{message}</p>
    </div>
  );
}
