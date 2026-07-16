import { describe, expect, test } from "bun:test";
import { buildLinkedInContactRequestBody, createLinkedInContact } from "./api.ts";

describe("LinkedIn contact requests", () => {
  test("matches the documented Contacts API payload", () => {
    expect(
      buildLinkedInContactRequestBody({
        linkedinUrl: "https://www.linkedin.com/company/datadog",
        brandId: "brand-1",
        name: "Datadog",
      })
    ).toEqual({
      linkedinUrl: "https://www.linkedin.com/company/datadog",
      enrich: true,
      brandId: "brand-1",
      name: "Datadog",
    });
  });

  test("uses the public Contacts endpoint and x-api-key authentication", async () => {
    const originalFetch = globalThis.fetch;
    let requestUrl = "";
    let requestInit;
    globalThis.fetch = async (input, init) => {
      requestUrl = String(input);
      requestInit = init;
      return new Response(JSON.stringify({ contactId: "contact-1" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    };

    try {
      const result = await createLinkedInContact("ek_test_contacts", {
        linkedinUrl: "https://www.linkedin.com/company/datadog",
        name: "Datadog",
      });

      expect(requestUrl.endsWith("/api/v1/contacts")).toBe(true);
      expect(new Headers(requestInit.headers).get("x-api-key")).toBe("ek_test_contacts");
      expect(new Headers(requestInit.headers).has("authorization")).toBe(false);
      expect(result).toEqual({
        ok: true,
        status: 201,
        contact: {
          contactId: "contact-1",
          url: "https://www.linkedin.com/company/datadog",
        },
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
