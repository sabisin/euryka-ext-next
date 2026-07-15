import { describe, expect, test } from "bun:test";
import { describeMarkdownContent, repairFlattenedMarkdown } from "./markdown-diagnostics.ts";

describe("Spark Markdown diagnostics", () => {
  test("does not report valid level-two headings as joined", () => {
    const diagnostics = describeMarkdownContent("# Title\n\n## Section\nBody");

    expect(diagnostics.hasJoinedHeadingMarkers).toBe(false);
  });

  test("reports heading markers joined to preceding content", () => {
    const diagnostics = describeMarkdownContent("# Title Body text ## Joined section");

    expect(diagnostics.hasJoinedHeadingMarkers).toBe(true);
  });

  test("repairs structural boundaries in a flattened Markdown response", () => {
    const flattened =
      "# A useful title followed by a complete opening sentence that needs separation. Another paragraph continues here with enough content to trigger repair. --- ## Main Points -   **First:** Useful detail. -   **Second:** Another detail.";

    const result = repairFlattenedMarkdown(flattened);

    expect(result.repaired).toBe(true);
    expect(result.content).toContain("sentence that needs separation.\n\nAnother paragraph");
    expect(result.content).toContain("\n\n---\n\n## Main Points");
    expect(result.content).toContain("\n- **First:**");
    expect(result.content).toContain("\n- **Second:**");
  });

  test("leaves already structured Markdown unchanged", () => {
    const markdown = "# Title\n\n## Main Points\n\n- First\n- Second";

    expect(repairFlattenedMarkdown(markdown)).toEqual({ content: markdown, repaired: false });
  });
});
