import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { SummarizingConcept, SummaryUnavailable, type SummaryItem } from "../src/concepts/Summarizing.ts";
import { openTestDb, type TestDb } from "./test-db.ts";
let db: TestDb;
beforeAll(async () => { db = await openTestDb(); });
beforeEach(async () => { await db.db.dropDatabase(); });
afterAll(async () => { await db?.close(); });
const items = [{ thread: "thread-1", anchor: 12, messages: [{ message: "msg-1", parent: null, author: "alice", name: "Alice", text: "Why?", context: "LIVE", postedAt: new Date() }] }] as unknown as SummaryItem[];
test("generates summary from existing discussion and saves references", async () => {
  let observedPrompt = "";
  const summaries = new SummarizingConcept(db.db, async (prompt) => { observedPrompt = prompt; return "Why? [thread-1]"; });
  const result = await summaries.request({ topic: "entry-1", items });
  expect(result.summary.referencedThreads.map(String)).toEqual(["thread-1"]);
  expect(observedPrompt).toContain("Why?");
  const other = new SummarizingConcept(db.db);
  expect((await other._summary({ topic: "entry-1" }))[0]?.summary.text).toBe("Why? [thread-1]");
});
test("empty discussions and generator errors do not erase prior summary", async () => {
  const good = new SummarizingConcept(db.db, async () => "Saved summary [thread-1]");
  await good.request({ topic: "entry-1", items });
  await expect(good.request({ topic: "entry-2", items: [] })).rejects.toBeInstanceOf(SummaryUnavailable);
  const bad = new SummarizingConcept(db.db, async () => { throw new Error("API failure"); });
  await expect(bad.request({ topic: "entry-1", items })).rejects.toBeInstanceOf(SummaryUnavailable);
  expect((await bad._summary({ topic: "entry-1" }))[0]?.summary.text).toBe("Saved summary [thread-1]");
});

test("only cited input threads are saved as references", async () => {
  const second = { ...items[0]!, thread: "thread-2" } as SummaryItem;
  const summaries = new SummarizingConcept(db.db, async () => "Review the first question [thread-1].");
  const saved = await summaries.request({ topic: "entry", items: [...items, second] });
  expect(saved.summary.referencedThreads.map(String)).toEqual(["thread-1"]);
  const invalid = new SummarizingConcept(db.db, async () => "Unrelated claim [unknown-thread].");
  await expect(invalid.request({ topic: "entry", items })).rejects.toBeInstanceOf(SummaryUnavailable);
  expect((await invalid._summary({ topic: "entry" }))[0]?.summary).toEqual(saved.summary);
});

test("deleted text is excluded and invalidating removes an older overview", async () => {
  let prompt = "";
  const summaries = new SummarizingConcept(db.db, async (value) => { prompt = value; return "Answer [thread-1]"; });
  await summaries.request({ topic: "entry", items });
  await summaries.invalidate({ topic: "entry" });
  expect(await summaries._summary({ topic: "entry" })).toEqual([]);
  const deleted = { ...items[0]!, messages: [{ ...items[0]!.messages[0]!, text: "", deletedAt: new Date() }] } as SummaryItem;
  await expect(summaries.request({ topic: "entry", items: [deleted] })).rejects.toBeInstanceOf(SummaryUnavailable);
  await summaries.request({ topic: "entry", items: [{ ...deleted, messages: [...deleted.messages, { ...deleted.messages[0]!, text: "Answer", deletedAt: undefined }] }] });
  expect(prompt).toContain("Answer");
  expect(prompt).not.toContain("Why?");
});

test("an in-flight overview cannot restore text after invalidation", async () => {
  let start!: () => void;
  let finish!: (text: string) => void;
  const started = new Promise<void>((resolve) => { start = resolve; });
  const generated = new Promise<string>((resolve) => { finish = resolve; });
  const summaries = new SummarizingConcept(db.db, async () => { start(); return generated; });
  const pending = summaries.request({ topic: "entry", items });
  await started;
  await summaries.invalidate({ topic: "entry" });
  finish("Old text [thread-1]");
  await expect(pending).rejects.toBeInstanceOf(SummaryUnavailable);
  expect(await summaries._summary({ topic: "entry" })).toEqual([]);
});
