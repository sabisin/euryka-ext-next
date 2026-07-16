import { describe, expect, test } from "bun:test";
import { repairMarkdownForDisplay } from "./markdown.ts";

describe("markdown display repair", () => {
  test("completes unfinished streaming markdown", () => {
    expect(repairMarkdownForDisplay("This is **still streaming")).toBe(
      "This is **still streaming**"
    );
  });

  test("does not alter complete markdown", () => {
    const markdown = "## Complete\n\nThis is **ready**.";
    expect(repairMarkdownForDisplay(markdown)).toBe(markdown);
  });
});
