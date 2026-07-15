import { useEffect, useState } from "react";
import { sendMessage } from "../lib/messaging";
import { DEFAULT_LINKEDIN_PROSPECTOR_STATUS } from "../lib/prospector";
import type { LinkedInProspectorStatus } from "../lib/types";

export function useTabContext(tabId: number | null) {
  const [currentTabUrl, setCurrentTabUrl] = useState<string | null>(null);
  const [prospectorStatus, setProspectorStatus] = useState<LinkedInProspectorStatus>(
    DEFAULT_LINKEDIN_PROSPECTOR_STATUS
  );

  useEffect(() => {
    if (tabId === null) return;
    let cancelled = false;

    const refreshPageStatus = async () => {
      const [{ url }, status] = await Promise.all([
        sendMessage("getTabUrl", { tabId }).catch(() => ({ url: "" })),
        sendMessage("getLinkedInProspectStatus", undefined, tabId).catch(() => null),
      ]);

      if (cancelled) return;
      setCurrentTabUrl(url || null);
      setProspectorStatus(status ?? DEFAULT_LINKEDIN_PROSPECTOR_STATUS);
    };

    void refreshPageStatus();
    const intervalId = window.setInterval(refreshPageStatus, 1500);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [tabId]);

  return { currentTabUrl, prospectorStatus };
}
