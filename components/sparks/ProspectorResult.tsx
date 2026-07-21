import { ArrowLeft, Building2, ExternalLink, User } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createLinkedInContact } from "../../lib/api";
import { fetchAndStoreToken, getValidToken } from "../../lib/auth";
import type { LinkedInProspectData, LinkedInRelatedPage, Spark } from "../../lib/types";
import { Button } from "../shared/Button";
import { IconWrapper } from "../shared/IconWrapper";

interface Props {
  prospect: LinkedInProspectData;
  spark: Spark;
  sourceUrl: string | null;
  isLoading: boolean;
  wsId: string | null;
  brandId?: string | null;
  projectId?: string | null;
  onBack: () => void;
}

type SubmitProfile = LinkedInRelatedPage & {
  selected: boolean;
  isPrimary: boolean;
};

type SubmitFeedback = {
  kind: "warning" | "error";
  message: string;
  failedUrls: string[];
};

type SubmitStats = {
  created: number;
  existing: number;
  failed: number;
  failedUrls: string[];
  errorText: string;
  createdNames: string[];
  existingNames: string[];
};

export function ProspectorResult({
  prospect,
  spark,
  sourceUrl,
  isLoading,
  wsId,
  brandId,
  projectId,
  onBack,
}: Props) {
  const [profiles, setProfiles] = useState<SubmitProfile[]>(() => normalizeProfiles(prospect));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<SubmitFeedback | null>(null);

  useEffect(() => {
    setProfiles(normalizeProfiles(prospect));
    setFeedback(null);
  }, [prospect]);

  const selectedProfiles = useMemo(
    () => profiles.filter((profile) => profile.selected),
    [profiles]
  );

  const toggleProfile = (url: string) => {
    setFeedback(null);
    setProfiles((current) =>
      current.map((profile) =>
        profile.url === url && !profile.isPrimary
          ? { ...profile, selected: !profile.selected }
          : profile
      )
    );
  };

  const handleSubmit = async () => {
    if (!wsId || selectedProfiles.length === 0 || isSubmitting) return;

    setIsSubmitting(true);
    setFeedback(null);

    const stats: SubmitStats = {
      created: 0,
      existing: 0,
      failed: 0,
      failedUrls: [] as string[],
      errorText: "",
      createdNames: [],
      existingNames: [],
    };

    try {
      let token = await getValidToken();
      if (!token) {
        setFeedback({
          kind: "error",
          message: "Authentication expired. Please sign in again.",
          failedUrls: [],
        });
        return;
      }

      for (const profile of dedupeProfiles(selectedProfiles)) {
        const sourcePage = {
          url: sourceUrl || prospect.pageUrl || profile.url,
          content: "",
        };
        let result = await createLinkedInContact(token, wsId, {
          linkedinUrl: profile.url,
          page: sourcePage,
          brandId: brandId ?? undefined,
          projectId: projectId ?? undefined,
          name: profile.name,
        });

        if (!result.ok && result.status === 403) {
          const refreshed = await fetchAndStoreToken();
          if (refreshed) {
            token = refreshed;
            result = await createLinkedInContact(token, wsId, {
              linkedinUrl: profile.url,
              page: sourcePage,
              brandId: brandId ?? undefined,
              projectId: projectId ?? undefined,
              name: profile.name,
            });
          }
        }

        if (result.ok) {
          if (result.contact.existing) {
            stats.existing += 1;
            stats.existingNames.push(profile.name);
          } else {
            stats.created += 1;
            stats.createdNames.push(profile.name);
          }
        } else {
          stats.failed += 1;
          stats.failedUrls.push(profile.url);
          stats.errorText ||= getContactsApiError(result.status, result.errorText);
        }
      }

      const successful = stats.created + stats.existing;
      if (successful > 0) {
        try {
          await showProspectsNotification(stats);
        } catch (error) {
          console.error("Failed to show Prospects notification", error);
        }
      }
      setFeedback(buildFailureFeedback(stats));
    } finally {
      setIsSubmitting(false);
    }
  };

  const sourceHost = getHostname(sourceUrl);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3 shrink-0">
        <Button variant="icon" size="icon-md" onClick={onBack} disabled={isLoading || isSubmitting}>
          <ArrowLeft size={15} />
        </Button>
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
          style={{ backgroundColor: spark.color }}
        >
          <IconWrapper name={spark.icon} color="white" size={16} />
        </div>
        <span className="truncate text-sm font-medium text-foreground">{spark.title}</span>
        {sourceUrl && sourceHost && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="min-w-0 truncate text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground/70"
          >
            Source: {sourceHost}
          </a>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {isLoading ? (
          <div className="flex flex-col gap-2">
            <div className="h-5 w-40 rounded bg-muted animate-pulse" />
            <div className="h-16 rounded bg-muted animate-pulse" />
            <div className="h-16 rounded bg-muted animate-pulse" />
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-foreground">
                {prospect.subjectName || "Prospects"}
              </h1>
              <span className="rounded border border-border px-2 py-0.5 text-xs text-muted-foreground">
                {toEntityLabel(prospect.entityType)}
              </span>
            </div>

            {prospect.notes.length > 0 && (
              <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                {prospect.notes.map((note) => (
                  <p key={note}>{note}</p>
                ))}
              </div>
            )}

            <section className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Add other profiles in the page
                </h2>
                <span className="text-xs text-muted-foreground">
                  {selectedProfiles.length} selected
                </span>
              </div>

              {profiles.length > 0 ? (
                <div className="flex flex-col gap-1">
                  {profiles.map((profile) => {
                    const EntityIcon = profile.entityType === "company" ? Building2 : User;
                    return (
                      <div
                        key={profile.url}
                        className="flex items-center gap-3 rounded-lg px-2 py-2 text-foreground hover:bg-muted/60"
                      >
                        <button
                          type="button"
                          onClick={() => toggleProfile(profile.url)}
                          disabled={profile.isPrimary}
                          className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default"
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
                            <EntityIcon size={16} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">
                              {profile.name}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {profile.url}
                            </span>
                          </span>
                        </button>

                        <a
                          href={profile.url}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0 text-muted-foreground hover:text-foreground"
                          aria-label={`Open ${profile.name}`}
                        >
                          <ExternalLink size={14} />
                        </a>

                        <input
                          type="checkbox"
                          checked={profile.selected}
                          disabled={profile.isPrimary}
                          onChange={() => toggleProfile(profile.url)}
                          aria-label={`Select ${profile.name}`}
                          className="h-4 w-4 shrink-0"
                        />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No related LinkedIn pages found.</p>
              )}
            </section>
          </div>
        )}
      </div>

      {!isLoading && (
        <div className="sticky bottom-0 border-t border-border bg-background px-4 py-3">
          {feedback && (
            <div
              className={`mb-2 text-sm ${feedback.kind === "error" ? "text-red-600" : "text-amber-600"}`}
            >
              <p>{feedback.message}</p>
              {feedback.failedUrls.length > 0 && (
                <ul className="mt-1 list-disc space-y-1 pl-4 text-xs">
                  {feedback.failedUrls.map((url) => (
                    <li key={url} className="break-all">
                      {url}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <Button
            variant="primary"
            size="md"
            onClick={handleSubmit}
            disabled={!wsId || selectedProfiles.length === 0 || isSubmitting}
            className="w-full"
          >
            {isSubmitting ? "Adding..." : "Add to prospects"}
          </Button>
        </div>
      )}
    </div>
  );
}

function normalizeProfiles(prospect: LinkedInProspectData): SubmitProfile[] {
  const profiles = new Map<string, SubmitProfile>();
  if ((prospect.entityType === "person" || prospect.entityType === "company") && prospect.pageUrl) {
    const url = normalizeLinkedInUrl(prospect.pageUrl) ?? prospect.pageUrl;
    profiles.set(url, {
      entityType: prospect.entityType,
      name: cleanProfileName(prospect.subjectName || "LinkedIn page"),
      url,
      selected: true,
      isPrimary: true,
    });
  }

  for (const profile of prospect.relatedPages) {
    const url = normalizeLinkedInUrl(profile.url) ?? profile.url;
    if (profiles.has(url)) continue;
    profiles.set(url, {
      ...profile,
      name: cleanProfileName(profile.name),
      url,
      selected: false,
      isPrimary: false,
    });
  }

  return Array.from(profiles.values());
}

function dedupeProfiles(profiles: SubmitProfile[]): SubmitProfile[] {
  return Array.from(new Map(profiles.map((profile) => [profile.url, profile])).values());
}

function buildFailureFeedback(stats: SubmitStats): SubmitFeedback | null {
  if (!stats.failed) return null;
  const successful = stats.created + stats.existing;
  return {
    kind: successful ? "warning" : "error",
    message: `${successful ? `${successful} saved, ${stats.failed} failed` : `All ${stats.failed} failed`}${stats.errorText ? ` — ${stats.errorText}` : ""}`,
    failedUrls: stats.failedUrls,
  };
}

async function showProspectsNotification(stats: SubmitStats) {
  const savedNames = [...stats.createdNames, ...stats.existingNames];
  const count = savedNames.length;
  const visibleNames = savedNames.slice(0, 3).join(", ");
  const remaining = count - Math.min(count, 3);
  const message =
    count === 1
      ? `${visibleNames} was saved to Prospects.`
      : `${visibleNames}${remaining > 0 ? ` and ${remaining} more` : ""} were saved to Prospects.`;
  const details = [
    stats.created ? `${stats.created} added` : "",
    stats.existing ? `${stats.existing} already existed` : "",
    stats.failed ? `${stats.failed} failed` : "",
  ].filter(Boolean);

  await chrome.notifications.create({
    type: "basic",
    iconUrl: chrome.runtime.getURL("ek-icon128.png"),
    title: count === 1 ? "Prospect saved" : `${count} prospects saved`,
    message,
    contextMessage: details.join(" · "),
  });
}

function getContactsApiError(status: number, errorText?: string): string {
  if (errorText) {
    try {
      const parsed = JSON.parse(errorText) as {
        message?: string;
        details?: string;
        error?: string;
      };
      const detail = parsed.details || parsed.message || parsed.error;
      if (detail) return detail;
    } catch {
      return errorText.slice(0, 240);
    }
  }
  if (status === 403) return "Your session expired or cannot access this workspace.";
  return `Contacts API request failed (${status}).`;
}

function cleanProfileName(value: string) {
  return (
    value
      .replace(/^view\s+/i, "")
      .replace(/(?:'|`)s profile$/i, "")
      .replace(/follow$/i, "")
      .replace(/\s*\(\d+\)\s*$/i, "")
      .replace(/\b(?:page|logo)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim() || value.trim()
  );
}

function normalizeLinkedInUrl(value: string) {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    if (!["linkedin.com", "www.linkedin.com"].includes(host)) return null;
    const parts = parsed.pathname.split("/").filter(Boolean);
    const entityType = parts[0];
    const slug = parts[1];
    if (!slug || (entityType !== "in" && entityType !== "company")) return null;
    return `https://www.linkedin.com/${entityType}/${slug}`;
  } catch {
    return null;
  }
}

function toEntityLabel(entityType: string) {
  if (entityType === "person") return "Person";
  if (entityType === "company") return "Company";
  if (entityType === "discovery") return "Discovery page";
  return "Unsupported";
}

function getHostname(url: string | null | undefined) {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
