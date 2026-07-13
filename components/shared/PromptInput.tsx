import {
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { LoaderCircle, Send, Square } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "./Button";

interface PromptInputMessage {
  text: string;
}

interface PromptInputProps {
  value?: string;
  onValueChange?: (value: string) => void;
  onSubmit: (message: PromptInputMessage) => void;
  disabled?: boolean;
  placeholder?: string;
  minRows?: number;
  maxRows?: number;
  className?: string;
  header?: ReactNode;
  tools?: ReactNode;
  submitTitle?: string;
  submitStatus?: "ready" | "submitted" | "streaming";
}

export function PromptInput({
  value,
  onValueChange,
  onSubmit,
  disabled = false,
  placeholder = "Ask Euryka...",
  minRows = 1,
  maxRows = 5,
  className,
  header,
  tools,
  submitTitle = "Send",
  submitStatus = "ready",
}: PromptInputProps) {
  const [internalValue, setInternalValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const text = value ?? internalValue;
  const trimmed = text.trim();

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "auto";
    const lineHeight = Number.parseFloat(window.getComputedStyle(textarea).lineHeight) || 20;
    const maxHeight = lineHeight * maxRows + 16;
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [text, maxRows]);

  const setText = (nextValue: string) => {
    if (value === undefined) {
      setInternalValue(nextValue);
    }
    onValueChange?.(nextValue);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!trimmed || disabled) return;

    onSubmit({ text: trimmed });
    setText("");
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  const isBusy = submitStatus === "submitted" || submitStatus === "streaming";

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        "overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-sm transition-colors focus-within:border-ring/70 focus-within:ring-1 focus-within:ring-ring/30",
        disabled && "opacity-75",
        className
      )}
    >
      {header && <div className="border-b border-border/70 px-3 py-2">{header}</div>}

      <div className="px-3 pt-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          rows={minRows}
          placeholder={placeholder}
          className="ek-scroll block max-h-40 min-h-9 w-full resize-none bg-transparent py-1.5 text-sm leading-5 text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
        />
      </div>

      <div className="flex min-h-11 items-center justify-between gap-2 px-2 pb-2 pt-1">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">{tools}</div>
        <Button
          type="submit"
          variant="ghost"
          size="icon-lg"
          title={submitTitle}
          disabled={!trimmed || disabled}
          className="self-center rounded-md text-muted-foreground leading-none hover:bg-accent hover:text-accent-foreground [&>svg]:block"
        >
          {submitStatus === "streaming" ? (
            <Square size={13} />
          ) : isBusy ? (
            <LoaderCircle size={15} className="animate-spin" />
          ) : (
            <Send size={15} />
          )}
        </Button>
      </div>
    </form>
  );
}

interface PromptInputToolButtonProps {
  children: ReactNode;
  active?: boolean;
  disabled?: boolean;
  title?: string;
  onClick?: () => void;
  className?: string;
}

export function PromptInputToolButton({
  children,
  active = false,
  disabled = false,
  title,
  onClick,
  className,
}: PromptInputToolButtonProps) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 min-w-0 shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:cursor-default disabled:opacity-40",
        active &&
          "bg-secondary text-secondary-foreground hover:bg-secondary/90 hover:text-secondary-foreground",
        className
      )}
    >
      {children}
    </button>
  );
}
