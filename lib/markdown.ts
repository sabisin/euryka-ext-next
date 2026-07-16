import remend from "remend";

export function repairMarkdownForDisplay(content: string): string {
  return remend(content, { linkMode: "text-only" });
}
