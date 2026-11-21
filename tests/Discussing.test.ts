import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { DiscussingConcept, InvalidMessage, ThreadUnavailable, type Message } from "../src/concepts/Discussing.ts";
import { openTestDb, type TestDb } from "./test-db.ts";
let testDb: TestDb;
let discussing: DiscussingConcept;
let now: Date;
beforeAll(async () => { testDb = await openTestDb(); });
beforeEach(async () => {
  await testDb.db.dropDatabase();
  now = new Date("2026-11-21T12:00:00Z");
  discussing = new DiscussingConcept(testDb.db, () => now);
});
afterAll(async () => { await testDb?.close(); });

test("threads persist and replies retain author, saved name, parent, context and ordering", async () => {
  const opened = await discussing.startThread({ topic: "entry-a", author: "bob", name: "Bob", anchor: 72.5, text: "  Why prune?  ", context: "LIVE" });
  now = new Date(now.getTime() + 1000);
  const answer = await discussing.reply({ parent: opened.message, author: "alice", name: "Alice", text: "For efficiency", context: "HISTORICAL" });
  const reader = new DiscussingConcept(testDb.db);
  expect((await reader._message({ message: answer.message }))[0]).toEqual({ thread: opened.thread, topic: "entry-a", anchor: 72.5 });
  const topic = await reader._topicThreads({ topic: "entry-a" });
  expect(topic).toHaveLength(1);
  expect(topic[0]?.messages).toMatchObject([
    { message: opened.message, parent: null, author: "bob", name: "Bob", text: "Why prune?", context: "LIVE" },
    { message: answer.message, parent: opened.message, author: "alice", name: "Alice", context: "HISTORICAL" },
  ]);
  expect((await reader._thread({ thread: opened.thread }))[0]?.anchor).toBe(72.5);
  expect(await reader._topicThreads({ topic: "entry-b" })).toEqual([]);
});

test("invalid text, invalid timestamp, and absent parents are rejected without mutation", async () => {
  const base = { topic: "video", author: "bob", name: "Bob", anchor: 0, context: "LIVE" as const };
  for (const text of ["  ", "x".repeat(2001)]) {
    await expect(discussing.startThread({ ...base, text })).rejects.toBeInstanceOf(InvalidMessage);
  }
  await expect(discussing.startThread({ ...base, text: "ok", anchor: Number.NaN })).rejects.toBeInstanceOf(InvalidMessage);
  await expect(discussing.reply({ parent: "missing" as Message, author: "bob", name: "Bob", text: "hi", context: "LIVE" })).rejects.toBeInstanceOf(ThreadUnavailable);
  expect(await discussing._topicThreads({ topic: "video" })).toEqual([]);
});

test("two identical timestamps on different entries do not share discussions", async () => {
  await discussing.startThread({ topic: "entry-one", author: "a", name: "A", anchor: 10, text: "one", context: "HISTORICAL" });
  await discussing.startThread({ topic: "entry-two", author: "b", name: "B", anchor: 10, text: "two", context: "HISTORICAL" });
  expect((await discussing._topicThreads({ topic: "entry-one" }))[0]?.messages[0]?.text).toBe("one");
});
