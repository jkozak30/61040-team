export type RecapItem = { text: string; references: string[] };
export type RecapSection = { title: string; items: RecapItem[] };
export const recapOrder = ["What the discussion covered", "Questions raised", "Still open"] as const;

export function cleanSummaryText(text: string): string {
  return text.replace(/[ \t]+([.,;:!?])/g, "$1").replace(/[ \t]{2,}/g, " ").trim();
}

// Preserve real source associations rather than assigning every reference to every section.
export function parseDiscussionSummary(text: string, threadIds: readonly string[]): RecapSection[] {
  const sections = recapOrder.map(title => ({ title, items: [] as RecapItem[] }));
  const known = new Set(threadIds);
  let section: RecapSection | undefined = sections[0];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const heading = line.replace(/^#{1,6}\s*/, "").replace(/\*\*/g, "").replace(/:$/, "").trim();
    if (heading.toLowerCase() === "overview") { section = undefined; continue; }
    const found = sections.find(item => item.title.toLowerCase() === heading.toLowerCase());
    if (found) { section = found; continue; }
    if (!section) continue;
    const references: string[] = [];
    const cleaned = line.replace(/\[([^\[\]\n]+)\]/g, (match, contents: string) => {
      const ids = contents.split(/[\s,;]+/).filter(Boolean);
      if (!ids.length || !ids.every(id => known.has(id))) return match;
      references.push(...ids);
      return "";
    }).replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").replace(/\*\*/g, "").trim();
    // Old recaps may have global reference-only lines appended at the end.
    // Keep those as footer citations instead of pretending they support the last claim.
    if (cleaned) section.items.push({ text: cleanSummaryText(cleaned), references: [...new Set(references)] });
  }
  return sections;
}
