import { useState } from "react";
import { format, isValid } from "date-fns";
import { ImageIcon } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { firestoreTsToDate, hexToRgba } from "../../lib/utils";
import { getSessionDisplay } from "../../lib/session-display";
import { IconWrapper } from "../shared/IconWrapper";
import type { Session, SparkCache } from "../../lib/types";

interface Props {
  session: Session;
  sparkCache?: SparkCache;
  onClick: (session: Session) => void;
}

export function SessionCard({ session, sparkCache, onClick }: Props) {
  const date = firestoreTsToDate(session.createdAt);
  const time = isValid(date) ? format(date, "HH:mm") : "";

  const { title, icon, color, imageUrl, isImageSession } = getSessionDisplay(session, sparkCache);
  const iconBg = hexToRgba(color, 0.18);
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <button
      type="button"
      onClick={() => onClick(session)}
      className="group flex w-full cursor-pointer items-center gap-3 rounded-xl border border-border bg-card p-3 text-left transition-[background-color,border-color,box-shadow] hover:border-ring/35 hover:bg-card hover:shadow-sm active:border-border active:bg-muted/40 active:shadow-none"
    >
      {/* Icon badge */}
      {isImageSession && imageUrl && !imgFailed ? (
        <div
          className="flex-shrink-0 overflow-hidden rounded-lg bg-muted"
          style={{ width: 40, height: 40 }}
        >
          <img
            src={imageUrl}
            alt=""
            className="h-full w-full object-cover"
            onError={() => setImgFailed(true)}
          />
        </div>
      ) : (
        <div
          style={{ backgroundColor: iconBg, width: 40, height: 40 }}
          className="flex flex-shrink-0 items-center justify-center rounded-lg"
        >
          {icon ? (
            <IconWrapper name={icon} color={color} size={18} />
          ) : (
            <ImageIcon size={18} className="text-muted-foreground" />
          )}
        </div>
      )}

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-xs font-semibold text-foreground">{title}</span>
          {time && (
            <span className="ml-auto shrink-0 text-[10px] tabular-nums text-muted-foreground">
              {time}
            </span>
          )}
        </div>
        <div className="line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              p: ({ children }) => <span>{children}</span>,
              h1: ({ children }) => <span className="font-semibold">{children} </span>,
              h2: ({ children }) => <span className="font-semibold">{children} </span>,
              h3: ({ children }) => <span className="font-semibold">{children} </span>,
              ul: ({ children }) => <span>{children}</span>,
              ol: ({ children }) => <span>{children}</span>,
              li: ({ children }) => <span>{children} </span>,
            }}
          >
            {session.content}
          </ReactMarkdown>
        </div>
      </div>
    </button>
  );
}
