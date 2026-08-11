import { onMessage, sendMessage } from "../lib/messaging";
import {
  authStorage,
  currentIdentityStorage,
  pageTextStorage,
  pageUrlStorage,
  selectedTextStorage,
  selectedTextSelectorStorage,
  userPrefs,
} from "../lib/storage";
import { fetchAndStoreToken, isTokenExpired, runWithTokenRetry } from "../lib/auth";
import { isSameAnnotationTarget } from "../lib/annotation-sync";
import { debugLog } from "../lib/debug";
import {
  type AnnotationCreateResponse,
  createAnnotation,
  deleteAnnotation,
  listAnnotations,
  updateAnnotation,
} from "../lib/annotations-api";

// Track which tabs have the side panel open (diagnostic / pending-action flush only —
// NOT used for toggle decisions; toggle works via the broadcast self-close trick below).
const openSidePanelTabs = new Set<number>();
const TOGGLE_ANNOTATIONS_COMMAND = "toggle-annotations";
const BASE_URL = import.meta.env.WXT_BASE_URL as string;
const INTERNAL_THREAD_REDIRECT_RULE_ID = 1;

// Queue actions that arrive before side panel sends sidePanelReady
const pendingActions = new Map<
  number,
  | { type: "analyseImage"; imageUrl: string; pageUrl?: string }
  | { type: "triggerSpark"; sparkId: string }
  | {
      type: "saveToCollection";
      itemType: string;
      title: string;
      content: string;
      thumbnail?: string;
      sourceUrl: string;
    }
>();

// Per-tab path that injects tabId into the panel page so it can identify itself.
// The panel reads this via new URLSearchParams(location.search).get("tabId").
const panelPath = (tabId: number) => `sidepanel.html?tabId=${tabId}`;

const logCollectionSave = debugLog("[Euryka collections]");

function isTrackablePageUrl(url: string | undefined): url is string {
  return Boolean(url && /^https?:\/\//i.test(url));
}

async function broadcastAnnotationUpdated(response: AnnotationCreateResponse) {
  await Promise.allSettled([
    sendMessage("annotationUpdated", response),
    sendToContentScriptTabs("annotationUpdated", response, response.annotation.targetUrl),
  ]);
}

async function broadcastAnnotationDeleted(id: string, targetUrl: string) {
  const data = { id, targetUrl };
  await Promise.allSettled([
    sendMessage("annotationDeleted", data),
    sendToContentScriptTabs("annotationDeleted", data, targetUrl),
  ]);
}

async function sendToContentScriptTabs(
  type: "annotationUpdated" | "annotationDeleted",
  data: AnnotationCreateResponse | { id: string; targetUrl: string },
  targetUrl: string
) {
  const tabs = await chrome.tabs.query({});
  await Promise.allSettled(
    tabs
      .filter((tab) => tab.id !== undefined && isSameAnnotationTarget(tab.url, targetUrl))
      .map((tab) => {
        return type === "annotationUpdated"
          ? sendMessage(type, data as AnnotationCreateResponse, tab.id as number)
          : sendMessage(type, data as { id: string; targetUrl: string }, tab.id as number);
      })
  );
}

function correctInternalThreadUrl(url: string): string | null {
  try {
    const base = new URL(BASE_URL);
    const target = new URL(url);
    if (target.hostname !== "0.0.0.0") return null;
    if (!/^\/ws\/[^/]+\/threads\/[^/]+\/?$/.test(target.pathname)) return null;
    return new URL(`${target.pathname}${target.search}${target.hash}`, base).toString();
  } catch {
    return null;
  }
}

async function configureInternalThreadRedirect() {
  const base = new URL(BASE_URL);
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [INTERNAL_THREAD_REDIRECT_RULE_ID],
    addRules: [
      {
        id: INTERNAL_THREAD_REDIRECT_RULE_ID,
        priority: 1,
        action: {
          type: "redirect",
          redirect: {
            regexSubstitution: `${base.origin}\\2`,
          },
        },
        condition: {
          regexFilter: "^https?://0\\.0\\.0\\.0(:[0-9]+)?(/ws/[^/]+/threads/[^/?#]+.*)$",
          resourceTypes: ["main_frame"],
        },
      },
    ],
  });
}

async function toggleAnnotationsHidden() {
  const current = await userPrefs.getValue();
  await userPrefs.setValue({
    ...current,
    annotationsHidden: !current.annotationsHidden,
  });
}

// Bind the panel to a specific tab and open it. Must be called synchronously
// inside a user-gesture handler (action.onClicked, contextMenus.onClicked, or
// an onMessage where the gesture token was propagated through sendMessage).
function bindAndOpen(tabId: number, windowId?: number) {
  chrome.sidePanel.setOptions({
    tabId,
    path: panelPath(tabId),
    enabled: true,
  });
  chrome.sidePanel.open(windowId !== undefined ? { tabId, windowId } : { tabId }).catch(() => {});
}

export default defineBackground(() => {
  // Rewrite the backend's internal thread redirect before it reaches the tab,
  // preventing 0.0.0.0 from flashing in the address bar.
  void configureInternalThreadRedirect().catch((error) => {
    console.error("Failed to configure the Euryka thread redirect", error);
  });

  // ─── Install ───────────────────────────────────────────────────────────────
  chrome.runtime.onInstalled.addListener(() => {
    // Disabled by default. Each tab opts in via setOptions on first open.
    // openPanelOnActionClick: false so we own action.onClicked and can do per-tab setup.
    chrome.sidePanel.setOptions({ enabled: false });
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });

    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: "analyseImage",
        title: "Analyse Image with Euryka",
        contexts: ["image"],
        documentUrlPatterns: ["http://*/*", "https://*/*"],
      });

      chrome.contextMenus.create({
        id: "annotatePage",
        title: "Annotate with Euryka",
        contexts: ["page", "selection", "link", "image"],
        documentUrlPatterns: ["http://*/*", "https://*/*"],
      });
    });
  });

  // ─── Startup token check ────────────────────────────────────────────────────
  chrome.runtime.onStartup.addListener(async () => {
    const auth = await authStorage.getValue();
    if (!auth.token || isTokenExpired(auth.expDate)) {
      await fetchAndStoreToken();
    }
  });

  // ─── Toolbar click — open only (per-tab) ────────────────────────────────────
  // Toolbar does not toggle. The floating button + the panel's X cover close.
  chrome.action.onClicked.addListener((tab) => {
    if (!tab?.id) return;
    bindAndOpen(tab.id, tab.windowId);
  });

  chrome.commands.onCommand.addListener((command) => {
    if (command !== TOGGLE_ANNOTATIONS_COMMAND) return;
    void toggleAnnotationsHidden();
  });

  // ─── Context menu: Analyse Image ────────────────────────────────────────────
  // open() MUST be synchronous within this handler. No await before bindAndOpen.
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "annotatePage") {
      if (tab?.id) {
        sendMessage("createAnnotationMarker", undefined, tab.id).catch(() => {});
      }
      return;
    }

    if (info.menuItemId !== "analyseImage" || !tab?.id) return;
    const imageUrl = info.srcUrl ?? info.linkUrl ?? "";
    if (!imageUrl) return;

    const tabId = tab.id;
    bindAndOpen(tabId, tab.windowId);

    // Queue or send the action depending on whether the panel is already mounted.
    // NOTE: sendMessage without tabId uses chrome.runtime.sendMessage (broadcast to all
    // extension contexts including side panels). Sending WITH tabId uses chrome.tabs.sendMessage
    // which only reaches content scripts — so we always broadcast and filter by forTabId in panel.
    if (openSidePanelTabs.has(tabId)) {
      sendMessage("analyseImage", { imageUrl, pageUrl: info.pageUrl, forTabId: tabId }).catch(
        () => {}
      );
    } else {
      pendingActions.set(tabId, { type: "analyseImage", imageUrl, pageUrl: info.pageUrl });
    }
  });

  // ─── Tab activated ──────────────────────────────────────────────────────────
  chrome.tabs.onActivated.addListener(async ({ tabId }) => {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (!isTrackablePageUrl(tab.url)) return;
      await pageUrlStorage.setValue(tab.url);
      await sendMessage("extractText", undefined, tabId);
    } catch {
      // Tab may not have content script
    }
  });

  // The backend can redirect thread links to its internal bind address.
  // Keep the resolved thread path but replace that internal origin before load.
  chrome.webNavigation.onBeforeNavigate.addListener(({ tabId, url, frameId }) => {
    if (frameId !== 0) return;
    const correctedUrl = correctInternalThreadUrl(url);
    if (!correctedUrl) return;
    chrome.tabs.update(tabId, { url: correctedUrl }).catch(() => {});
  });

  // ─── Navigation committed ───────────────────────────────────────────────────
  chrome.webNavigation.onCommitted.addListener(async ({ tabId, url, frameId }) => {
    if (frameId !== 0) return;
    if (!isTrackablePageUrl(url)) return;
    await pageUrlStorage.setValue(url);
    try {
      await sendMessage("extractText", undefined, tabId);
    } catch {
      // Content script not ready yet
    }
  });

  // ─── Tab close cleanup ──────────────────────────────────────────────────────
  chrome.tabs.onRemoved.addListener((tabId) => {
    openSidePanelTabs.delete(tabId);
    pendingActions.delete(tabId);
  });

  // ─── Port connections (side panel diagnostic tracker) ───────────────────────
  // Used for: knowing the panel is alive (so we can send vs queue), and cleaning
  // pendingActions on disconnect. NOT used for toggle decisions.
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== "sidePanelTracker") return;
    let tabId: number | null = null;

    port.onMessage.addListener((msg: { type: string; tabId?: number }) => {
      if (msg.type === "PING" && msg.tabId) {
        tabId = msg.tabId;
        openSidePanelTabs.add(tabId);
        port.postMessage({ type: "PONG" });
      }
    });

    port.onDisconnect.addListener(() => {
      if (tabId) openSidePanelTabs.delete(tabId);
    });
  });

  // ─── Messages ───────────────────────────────────────────────────────────────
  onMessage("saveText", async ({ data }) => {
    await pageTextStorage.setValue(data.text);
  });

  onMessage("textSelected", async ({ data }) => {
    await selectedTextStorage.setValue(data.text);
    await selectedTextSelectorStorage.setValue(data.selector);
  });

  onMessage("listAnnotations", ({ data }) =>
    runWithTokenRetry((token) => listAnnotations(token, data))
  );

  onMessage("createAnnotation", ({ data }) =>
    runWithTokenRetry(async (token) => {
      const response = await createAnnotation(token, data);
      await broadcastAnnotationUpdated(response);
      return response;
    })
  );

  onMessage("updateAnnotation", ({ data }) =>
    runWithTokenRetry(async (token) => {
      const response = await updateAnnotation(token, data.id, data.payload);
      await broadcastAnnotationUpdated(response);
      return response;
    })
  );

  onMessage("deleteAnnotation", async ({ data }) => {
    await runWithTokenRetry((token) => deleteAnnotation(token, data.id));
    await broadcastAnnotationDeleted(data.id, data.targetUrl);
  });

  onMessage("getUserPrefs", () => userPrefs.getValue());

  onMessage("updateUserPrefs", async ({ data }) => {
    const current = await userPrefs.getValue();
    const next = { ...current, ...data };
    await userPrefs.setValue(next);
    return next;
  });

  onMessage("getCurrentIdentity", () => currentIdentityStorage.getValue());
  onMessage("getCurrentUser", async () => {
    const auth = await authStorage.getValue();
    return {
      label: auth.email ?? auth.name ?? null,
      avatarUrl: auth.avatarUrl ?? null,
    };
  });

  // The floating button broadcasts openSidePanel. This same message is also
  // received by the side panel itself (if open), which will self-close. This
  // gives us a TOGGLE: if closed, background opens; if open, panel self-closes.
  // Background always tries to open — when the panel is already open the
  // open() call is a no-op, and the panel's own window.close() (delayed 50ms
  // inside the panel) wins the race.
  onMessage("openSidePanel", ({ sender }) => {
    const tabId = sender.tab?.id;
    if (!tabId) return;
    bindAndOpen(tabId, sender.tab?.windowId);
  });

  onMessage("sidePanelReady", async ({ data }) => {
    const { tabId } = data;
    openSidePanelTabs.add(tabId);

    const pending = pendingActions.get(tabId);
    if (!pending) return;
    pendingActions.delete(tabId);

    if (pending.type === "analyseImage") {
      await sendMessage("analyseImage", {
        imageUrl: pending.imageUrl,
        pageUrl: pending.pageUrl,
        forTabId: tabId,
      });
    } else if (pending.type === "triggerSpark") {
      await sendMessage("triggerSpark", { sparkId: pending.sparkId, forTabId: tabId });
    } else if (pending.type === "saveToCollection") {
      logCollectionSave("Flushing queued save action to sidepanel", { tabId, pending });
      await sendMessage("saveToCollection", {
        type: pending.itemType as import("../lib/types").CollectionItemType,
        title: pending.title,
        content: pending.content,
        thumbnail: pending.thumbnail,
        sourceUrl: pending.sourceUrl,
        forTabId: tabId,
      });
    }
  });

  onMessage("triggerSpark", ({ data, sender }) => {
    const tabId = sender.tab?.id;
    if (!tabId) return;

    bindAndOpen(tabId, sender.tab?.windowId);

    if (openSidePanelTabs.has(tabId)) {
      sendMessage("triggerSpark", { sparkId: data.sparkId, forTabId: tabId }).catch(() => {});
    } else {
      pendingActions.set(tabId, { type: "triggerSpark", sparkId: data.sparkId });
    }
  });

  onMessage("pageDragStart", async ({ sender }) => {
    const tabId = sender.tab?.id;
    if (tabId && openSidePanelTabs.has(tabId)) {
      await sendMessage("pageDragStart", undefined, tabId);
    }
  });

  onMessage("pageDragEnd", async ({ sender }) => {
    const tabId = sender.tab?.id;
    if (tabId && openSidePanelTabs.has(tabId)) {
      await sendMessage("pageDragEnd", undefined, tabId);
    }
  });

  onMessage("reset", async () => {
    await authStorage.setValue({ token: "", expDate: "" });
  });

  onMessage("keepAlive", () => {
    // Heartbeat — keep service worker alive
  });

  onMessage("getTabUrl", async ({ data }) => {
    const tab = await chrome.tabs.get(data.tabId);
    return { url: tab.url ?? "" };
  });
});
