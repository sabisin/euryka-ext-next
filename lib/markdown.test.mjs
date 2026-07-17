import { describe, expect, test } from "bun:test";
import { repairMarkdownForDisplay, repairMarkdownStructure } from "./markdown.ts";

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

  test("preserves leading and trailing whitespace in valid markdown", () => {
    const markdown = "\n\n## Complete\n\nThis is **ready**.\n";
    expect(repairMarkdownStructure(markdown)).toEqual({ content: markdown, repaired: false });
  });

  test("repairs semi-flattened generated sections and list items", () => {
    const markdown = `# Key Takeaways from Muay Thai: The Art of Eight Limbs

## 1.

Core MessageMuay Thai is more than just a combat sport.

## 2. Main Points- Trace the historical evolution.- Understand the combat philosophy.- Appreciate its cultural significance.

## 3. Context and ClarityMuay Thai is an ancient martial art.`;

    expect(repairMarkdownStructure(markdown)).toEqual({
      content: `# Key Takeaways from Muay Thai: The Art of Eight Limbs

## 1. Core Message

Muay Thai is more than just a combat sport.

## 2. Main Points

- Trace the historical evolution.
- Understand the combat philosophy.
- Appreciate its cultural significance.

## 3. Context and Clarity

Muay Thai is an ancient martial art.`,
      repaired: true,
    });
  });

  test("preserves valid generated section headings", () => {
    const markdown = `## 1. Core Message

Muay Thai is more than just a combat sport.

## 2. Main Points

- Trace the historical evolution.
- Understand the combat philosophy.`;

    expect(repairMarkdownStructure(markdown)).toEqual({ content: markdown, repaired: false });
  });
});
