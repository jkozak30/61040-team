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
  const good = new SummarizingConcept(db.db, async () => "Saved summary");
  await good.request({ topic: "entry-1", items });
  await expect(good.request({ topic: "entry-2", items: [] })).rejects.toBeInstanceOf(SummaryUnavailable);
  const bad = new SummarizingConcept(db.db, async () => { throw new Error("API failure"); });
  await expect(bad.request({ topic: "entry-1", items })).rejects.toBeInstanceOf(SummaryUnavailable);
  expect((await bad._summary({ topic: "entry-1" }))[0]?.summary.text).toBe("Saved summary");
});
