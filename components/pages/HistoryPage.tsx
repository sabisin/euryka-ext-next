import { HistoryList } from "../history/HistoryList";
import { SessionView } from "../history/SessionView";
import type { Session } from "../../lib/types";

interface HistoryPageProps {
  selectedSession: Session | null;
  workspaceId: string | null;
  onSelectSession: (session: Session | null) => void;
}

export function HistoryPage({
  selectedSession,
  workspaceId,
  onSelectSession,
}: HistoryPageProps) {
  return selectedSession ? (
    <SessionView
      session={selectedSession}
      wsId={workspaceId}
      onBack={() => onSelectSession(null)}
    />
  ) : (
    <HistoryList wsId={workspaceId} onSelectSession={onSelectSession} />
  );
}
