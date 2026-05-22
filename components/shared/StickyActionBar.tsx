import { useState } from "react";
import { Check, Copy, MessageSquareQuote } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { Button } from "./Button";

interface Props {
  content: string;
  openUrl?: string;
  openLabel?: string;
  openTitle?: string;
  openIcon?: LucideIcon;
}

export function StickyActionBar({
  content,
  openUrl,
  openLabel = "Open in threads",
  openTitle = "Threads",
  openIcon: OpenIcon = MessageSquareQuote,
}: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="sticky bottom-0 flex items-center gap-2 border-t border-border bg-background px-4 py-2.5">
      <Button
        variant="ghost"
        size="sm"
        onClick={handleCopy}
      >
        <AnimatePresence mode="wait">
          {copied ? (
            <motion.span
              key="check"
              initial={{ rotate: 90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: -90, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <Check size={13} />
            </motion.span>
          ) : (
            <motion.span
              key="copy"
              initial={{ rotate: 90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: -90, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <Copy size={13} />
            </motion.span>
          )}
        </AnimatePresence>
        {copied ? "Copied" : "Copy"}
      </Button>

      {openUrl && (
        <Button
          variant="ghost"
          size="sm"
          title={openTitle}
          onClick={() => chrome.tabs.create({ url: openUrl })}
        >
          <OpenIcon size={13} />
          {openLabel}
        </Button>
      )}
    </div>
  );
}
