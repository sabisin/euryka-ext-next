import { onMessage, sendMessage } from "../lib/messaging";
import { cleanText, extractPageContent, getElementSelector } from "../lib/content-extraction";
import { debounce } from "../lib/utils";
import type {
  LinkedInProspectData,
  LinkedInProspectEntityType,
  LinkedInProspectorStatus,
  LinkedInRelatedPage,
} from "../lib/types";

const LINKEDIN_PERSON_PATH_RE = /^\/in\/([^/?#]+)/i;
const LINKEDIN_COMPANY_PATH_RE = /^\/company\/([^/?#]+)/i;
const LINKEDIN_DISCOVERY_PATH_RE = /^\/(?:feed\/?)?$/i;
const LINKEDIN_HOSTS = new Set(["linkedin.com", "www.linkedin.com"]);

function isLinkedInHost(hostname: string) {
  return LINKEDIN_HOSTS.has(hostname.toLowerCase());
}

function getLinkedInEntityType(pathname: string): LinkedInProspectEntityType {
  if (LINKEDIN_PERSON_PATH_RE.test(pathname)) return "person";
  if (LINKEDIN_COMPANY_PATH_RE.test(pathname)) return "company";
  if (LINKEDIN_DISCOVERY_PATH_RE.test(pathname)) return "discovery";
  return "unsupported";
}

function buildLinkedInProspectorStatus(
  status: Pick<LinkedInProspectorStatus, "isLinkedIn" | "entityType" | "pageUrl" | "subjectName">
): LinkedInProspectorStatus {
  return {
    ...status,
    visible: status.isLinkedIn,
  };
}

function getCanonicalOrCurrentUrl() {
  return (
    document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href ||
    document.querySelector<HTMLMetaElement>('meta[property="og:url"]')?.content ||
    window.location.href
  );
}

function getLinkedInSubjectName(entityType: LinkedInProspectEntityType) {
  const heading =
    document.querySelector<HTMLElement>("main h1")?.innerText ||
    document.querySelector<HTMLElement>(
      ".org-top-card-summary__title, .org-top-card-primary-content__title"
    )?.innerText ||
    document.querySelector<HTMLElement>(".pv-text-details__left-panel h1, .top-card-layout__title")
      ?.innerText ||
    document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content ||
    document.title;

  const cleaned = cleanText(heading || "")
    .split("|")[0]
    ?.trim();
  if (cleaned) return cleaned;
  if (entityType === "company") return "LinkedIn company";
  if (entityType === "person") return "LinkedIn person";
  if (entityType === "discovery") return "LinkedIn feed";
  return "LinkedIn page";
}

function normalizeLinkedInEntityUrl(value: string): LinkedInRelatedPage | null {
  try {
    const parsed = new URL(value, window.location.origin);
    if (!isLinkedInHost(parsed.hostname)) return null;

    const personMatch = parsed.pathname.match(LINKEDIN_PERSON_PATH_RE);
    if (personMatch?.[1]) {
      const slug = personMatch[1];
      return {
        entityType: "person",
        name: slugToName(slug),
        url: `https://www.linkedin.com/in/${slug}`,
      };
    }

    const companyMatch = parsed.pathname.match(LINKEDIN_COMPANY_PATH_RE);
    if (companyMatch?.[1]) {
      const slug = companyMatch[1];
      return {
        entityType: "company",
        name: slugToName(slug),
        url: `https://www.linkedin.com/company/${slug}`,
      };
    }
  } catch {
    return null;
  }
  return null;
}

function slugToName(slug: string) {
  const decoded = (() => {
    try {
      return decodeURIComponent(slug);
    } catch {
      return slug;
    }
  })();
  return decoded
    .replace(/[-_]+/g, " ")
    .replace(/(?:\s+\d+)+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function extractAnchorName(anchor: HTMLAnchorElement) {
  return cleanText(
    anchor.innerText ||
      anchor.textContent ||
      anchor.getAttribute("aria-label") ||
      anchor.getAttribute("title") ||
      anchor.querySelector("img")?.getAttribute("alt") ||
      ""
  );
}

function extractLinkedInProspectStatus(): LinkedInProspectorStatus {
  const pageUrl = getCanonicalOrCurrentUrl();
  const entityType = getLinkedInEntityType(window.location.pathname);
  const isLinkedIn = isLinkedInHost(window.location.hostname);

  return buildLinkedInProspectorStatus({
    isLinkedIn,
    entityType: isLinkedIn ? entityType : "unsupported",
    pageUrl,
    subjectName: getLinkedInSubjectName(entityType),
  });
}

function extractLinkedInProspectData(): LinkedInProspectData {
  const status = extractLinkedInProspectStatus();
  if (!status.isLinkedIn) {
    return {
      ...status,
      relatedPages: [],
      notes: ["Prospects is available on LinkedIn pages."],
    };
  }

  const currentUrl = normalizeLinkedInEntityUrl(status.pageUrl)?.url ?? status.pageUrl;
  const related = new Map<string, LinkedInRelatedPage>();
  for (const anchor of Array.from(
    document.querySelectorAll<HTMLAnchorElement>("main a[href], body a[href]")
  )) {
    const normalized = normalizeLinkedInEntityUrl(anchor.href);
    if (!normalized || normalized.url === currentUrl) continue;
    const name = extractAnchorName(anchor);
    related.set(normalized.url, {
      ...normalized,
      name: name && name.toLowerCase() !== "linkedin" ? name : normalized.name,
    });
  }

  const relatedPages = Array.from(related.values()).sort((a, b) => a.name.localeCompare(b.name));
  return {
    ...status,
    relatedPages,
    notes: relatedPages.length
      ? [
          `Found ${relatedPages.length} related LinkedIn ${relatedPages.length === 1 ? "page" : "pages"}.`,
        ]
      : ["No related LinkedIn person/company links were found in the scanned content."],
  };
}

export default defineContentScript({
  matches: ["<all_urls>"],

  main() {
    let lastSelectedText = "";
    let lastSelectedSelector = "";

    // ─── Text extraction ──────────────────────────────────────────────────────
    onMessage("extractText", async () => {
      const { text, blocks } = extractPageContent();
      await sendMessage("saveText", { text });
      return { text, blocks };
    });

    onMessage("getSelectedText", async () => {
      const currentText = cleanText(window.getSelection()?.toString() ?? "");
      if (currentText) lastSelectedText = currentText;
      return { text: currentText || lastSelectedText };
    });

    onMessage("getLinkedInProspectStatus", async () => extractLinkedInProspectStatus());

    onMessage("getLinkedInProspectData", async () => extractLinkedInProspectData());

    // ─── Selection tracking ───────────────────────────────────────────────────
    const publishSelection = debounce(async () => {
      await sendMessage("textSelected", {
        text: lastSelectedText,
        selector: lastSelectedSelector,
      });
    }, 300);

    const handleSelection = () => {
      const selection = window.getSelection();
      const text = selection?.toString().trim() ?? "";
      if (!text) return;

      const range = selection?.getRangeAt(0);
      const el = range?.commonAncestorContainer;
      const target = el instanceof Element ? el : el?.parentElement;
      lastSelectedText = cleanText(text);
      lastSelectedSelector = target ? getElementSelector(target) : "";

      publishSelection();
    };

    document.addEventListener("selectionchange", handleSelection);

    // ─── Drag detection ───────────────────────────────────────────────────────
    document.addEventListener("dragstart", async () => {
      await sendMessage("pageDragStart", undefined);
    });

    document.addEventListener("dragend", async () => {
      await sendMessage("pageDragEnd", undefined);
    });
  },
});
