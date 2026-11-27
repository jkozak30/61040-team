import { expect, test } from "bun:test";
import { parseDiscussionSummary, recapOrder, cleanSummaryText } from "../web/summary-format.ts";

test("recap order excludes legacy overview and preserves per-claim citations", () => {
  const parsed = parseDiscussionSummary(`## Overview
A redundant overview [one]
## Questions raised
- Why? [one,two]
## What the discussion covered
- Explained the interval [0,1]. [one]
## Still open
- Is it always true? [two]
[one] [two]`, ["one", "two"]);
  expect(parsed.map(section => section.title)).toEqual([...recapOrder]);
  expect(parsed[0]!.items).toEqual([{ text: "Explained the interval [0,1].", references: ["one"] }]);
  expect(parsed[1]!.items).toEqual([{ text: "Why?", references: ["one", "two"] }]);
  expect(parsed[2]!.items).toEqual([{ text: "Is it always true?", references: ["two"] }]);
  expect(JSON.stringify(parsed)).not.toContain("redundant overview");
});

test("unassigned references are not falsely attached to a claim", () => {
  const parsed = parseDiscussionSummary("## Still open\n- A question with no inline source.\n[one]", ["one"]);
  expect(parsed[2]!.items).toEqual([{ text: "A question with no inline source.", references: [] }]);
});


test("removing inline citations does not leave a space before punctuation", () => {
  const sections = parseDiscussionSummary("## What the discussion covered\n- Explanation [one] . Another point [one] , clarified !", ["one"]);
  expect(sections[0]!.items[0]!.text).toBe("Explanation. Another point, clarified!");
  expect(sections[0]!.items[0]!.references).toEqual(["one"]);
  expect(cleanSummaryText("A sentence .  Another sentence ; okay ?")).toBe("A sentence. Another sentence; okay?");
});
