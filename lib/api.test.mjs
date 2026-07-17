import { describe, expect, test } from "bun:test";
import { buildLinkedInContactRequestBody, createLinkedInContact } from "./api.ts";

describe("LinkedIn contact requests", () => {
  test("matches the documented workspace LinkedIn payload", () => {
    expect(
      buildLinkedInContactRequestBody({
        linkedinUrl: "https://www.linkedin.com/company/datadog",
        page: {
          url: "https://www.linkedin.com/company/datadog",
        },
        brandId: "brand-1",
        projectId: "project-1",
        name: "Datadog",
      })
    ).toEqual({
      linkedinUrl: "https://www.linkedin.com/company/datadog",
      page: {
        url: "https://www.linkedin.com/company/datadog",
        content: "",
      },
      brandId: "brand-1",
      projectId: "project-1",
      name: "Datadog",
    });
  });

  test("uses the workspace endpoint and Bearer authentication", async () => {
    const originalFetch = globalThis.fetch;
    let requestUrl = "";
    let requestInit;
    globalThis.fetch = async (input, init) => {
      requestUrl = String(input);
      requestInit = init;
      return new Response(
        JSON.stringify({
          url: "https://app.euryka.ai/ws/workspace-1/prospects/contact-1",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    };

    try {
      const result = await createLinkedInContact("session-token", "workspace-1", {
        linkedinUrl: "https://www.linkedin.com/company/datadog",
        page: {
          url: "https://www.linkedin.com/company/datadog",
          content: "",
        },
        name: "Datadog",
      });

      expect(requestUrl.endsWith("/api/ws/workspace-1/extension/sparks/linkedIn")).toBe(true);
      expect(new Headers(requestInit.headers).get("authorization")).toBe("Bearer session-token");
      expect(new Headers(requestInit.headers).has("x-api-key")).toBe(false);
      expect(result).toEqual({
        ok: true,
        status: 200,
        contact: {
          url: "https://app.euryka.ai/ws/workspace-1/prospects/contact-1",
        },
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
