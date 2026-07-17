import type { Session } from "../../lib/types";
import { HistoryList } from "../history/HistoryList";
import { SessionView } from "../history/SessionView";

interface HistoryPageProps {
  selectedSession: Session | null;
  workspaceId: string | null;
  onSelectSession: (session: Session | null) => void;
}

export function HistoryPage({ selectedSession, workspaceId, onSelectSession }: HistoryPageProps) {
  return (
    <>
      <div className="h-full" hidden={selectedSession !== null}>
        <HistoryList wsId={workspaceId} onSelectSession={onSelectSession} />
      </div>
      {selectedSession && (
        <SessionView
          session={selectedSession}
          wsId={workspaceId}
          onBack={() => onSelectSession(null)}
        />
      )}
    </>
  );
}
