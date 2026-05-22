const NOTIFY_URL = import.meta.env.WXT_NOTIFY_URL as string | undefined;

export async function notifySlack(slackMemberId: string, text: string): Promise<void> {
  console.info("[Euryka notify] Slack notification requested", {
    hasNotifyUrl: Boolean(NOTIFY_URL),
    notifyUrl: NOTIFY_URL,
    slackMemberId,
    textLength: text.length,
    textPreview: text.slice(0, 160),
  });

  if (!NOTIFY_URL) {
    console.error("[Euryka notify] WXT_NOTIFY_URL is not configured");
    return;
  }

  if (!slackMemberId) {
    console.error("[Euryka notify] Missing Slack member ID");
    return;
  }

  try {
    const response = await fetch(NOTIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slackMemberId, text }),
    });

    const responseText = await response.text().catch(() => "");
    if (!response.ok) {
      console.error("[Euryka notify] Notify server returned an error", {
        status: response.status,
        statusText: response.statusText,
        body: responseText,
      });
      return;
    }

    console.info("[Euryka notify] Notify server accepted Slack notification", {
      status: response.status,
      body: responseText,
    });
  } catch (error) {
    console.error("[Euryka notify] Failed to reach notify server", error);
  }
}
