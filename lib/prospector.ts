import type { LinkedInProspectData, LinkedInProspectorStatus, Spark } from "./types";

export const LINKEDIN_PROSPECTOR_SPARK: Spark = {
  id: "local-prospector",
  title: "Prospects",
  description: "Find visible email and phone contacts from this LinkedIn page.",
  icon: "Search",
  color: "#0A66C2",
};

export const DEFAULT_LINKEDIN_PROSPECTOR_STATUS: LinkedInProspectorStatus = {
  isLinkedIn: false,
  entityType: "unsupported",
  pageUrl: "",
  subjectName: "LinkedIn page",
  visible: false,
};

export function buildFallbackProspect(pageUrl: string, notes: string[]): LinkedInProspectData {
  return {
    ...DEFAULT_LINKEDIN_PROSPECTOR_STATUS,
    pageUrl,
    subjectName: "Prospects",
    relatedPages: [],
    notes,
  };
}
