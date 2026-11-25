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

test("a nested reply follows its parent even when the clock has not advanced", async () => {
  const opened = await discussing.startThread({ topic: "entry", author: "bob", name: "Bob", anchor: 10, text: "Question", context: "LIVE" });
  const answer = await discussing.reply({ parent: opened.message, author: "alice", name: "Alice", text: "Answer", context: "LIVE" });
  const followUp = await discussing.reply({ parent: answer.message, author: "bob", name: "Bob", text: "Follow-up", context: "HISTORICAL" });
  const messages = (await discussing._thread({ thread: opened.thread }))[0]!.messages;
  expect(messages.map(({ message }) => message)).toEqual([opened.message, answer.message, followUp.message]);
  expect(messages[0]!.postedAt.getTime()).toBeLessThan(messages[1]!.postedAt.getTime());
  expect(messages[1]!.postedAt.getTime()).toBeLessThan(messages[2]!.postedAt.getTime());
});

test("concurrent replies from separate instances are retained", async () => {
  const opened = await discussing.startThread({ topic: "entry", author: "bob", name: "Bob", anchor: 10, text: "Question", context: "LIVE" });
  const other = new DiscussingConcept(testDb.db, () => now);
  const [first, second] = await Promise.all([
    discussing.reply({ parent: opened.message, author: "alice", name: "Alice", text: "First", context: "LIVE" }),
    other.reply({ parent: opened.message, author: "carol", name: "Carol", text: "Second", context: "LIVE" }),
  ]);
  const messages = (await discussing._thread({ thread: opened.thread }))[0]!.messages;
  expect(messages.map(({ message }) => message)).toEqual(expect.arrayContaining([opened.message, first.message, second.message]));
  expect(messages).toHaveLength(3);
});

test("authors can edit or delete their comments without removing replies", async () => {
  const opened = await discussing.startThread({ topic: "entry", author: "bob", name: "Bob", anchor: 10, text: "Original", context: "LIVE" });
  const reply = await discussing.reply({ parent: opened.message, author: "alice", name: "Alice", text: "Answer", context: "LIVE" });
  await expect(discussing.editMessage({ message: opened.message, author: "alice", text: "Changed" })).rejects.toBeInstanceOf(ThreadUnavailable);
  await expect(discussing.deleteMessage({ message: reply.message, author: "bob" })).rejects.toBeInstanceOf(ThreadUnavailable);
  await expect(discussing.editMessage({ message: opened.message, author: "bob", text: "  Revised  " })).resolves.toMatchObject({ topic: "entry" });
  let messages = (await discussing._thread({ thread: opened.thread }))[0]!.messages;
  expect(messages[0]).toMatchObject({ text: "Revised", editedAt: now, author: "bob", postedAt: now });
  await discussing.deleteMessage({ message: opened.message, author: "bob" });
  messages = (await discussing._thread({ thread: opened.thread }))[0]!.messages;
  expect(messages[0]).toMatchObject({ text: "", deletedAt: now, author: "", name: "" });
  expect(messages[1]).toMatchObject({ message: reply.message, parent: opened.message, text: "Answer" });
  expect(await discussing._editableMessage({ message: opened.message })).toEqual([]);
  await expect(discussing.editMessage({ message: opened.message, author: "bob", text: "Restore" })).rejects.toBeInstanceOf(ThreadUnavailable);
  await expect(discussing.deleteMessage({ message: opened.message, author: "bob" })).rejects.toBeInstanceOf(ThreadUnavailable);
});

test("saving unchanged text preserves edit metadata", async () => {
  const { thread, message } = await discussing.startThread({
    topic: "video", author: "bob", name: "Bob", anchor: 12, text: "Original", context: "LIVE",
  });
  await discussing.editMessage({ message, author: "bob", text: " Original " });
  expect((await discussing._thread({ thread }))[0]?.messages[0]?.editedAt).toBeUndefined();
  await discussing.editMessage({ message, author: "bob", text: "Revised" });
  const firstEdit = (await discussing._thread({ thread }))[0]?.messages[0]?.editedAt;
  now = new Date(now.getTime() + 1000);
  await discussing.editMessage({ message, author: "bob", text: "Revised" });
  expect((await discussing._thread({ thread }))[0]?.messages[0]?.editedAt).toEqual(firstEdit);
});


test("deleting a leaf removes it from storage and removes empty deleted ancestors", async () => {
  const opened = await discussing.startThread({ topic: "entry", author: "bob", name: "Bob", anchor: 10, text: "Question", context: "LIVE" });
  const reply = await discussing.reply({ parent: opened.message, author: "alice", name: "Alice", text: "Answer", context: "LIVE" });
  await discussing.deleteMessage({ message: opened.message, author: "bob" });
  const stored = await testDb.db.collection("discussing.threads").findOne({ _id: opened.thread as never });
  expect(stored?.messages[0]).toMatchObject({ name: "", author: "", text: "" });
  await discussing.deleteMessage({ message: reply.message, author: "alice" });
  expect(await discussing._topicThreads({ topic: "entry" })).toEqual([]);
  expect(await testDb.db.collection("discussing.threads").countDocuments()).toBe(0);
});

test("deleting a standalone opening message removes the thread", async () => {
  const opened = await discussing.startThread({ topic: "entry", author: "bob", name: "Bob", anchor: 10, text: "Question", context: "LIVE" });
  await discussing.deleteMessage({ message: opened.message, author: "bob" });
  expect(await discussing._thread({ thread: opened.thread })).toEqual([]);
  expect(await discussing._message({ message: opened.message })).toEqual([]);
  expect(await testDb.db.collection("discussing.threads").countDocuments()).toBe(0);
});

test("concurrent reply and deletion never leave an orphan reply", async () => {
  const opened = await discussing.startThread({ topic: "entry", author: "bob", name: "Bob", anchor: 10, text: "Question", context: "LIVE" });
  const results = await Promise.allSettled([
    discussing.reply({ parent: opened.message, author: "alice", name: "Alice", text: "Answer", context: "LIVE" }),
    discussing.deleteMessage({ message: opened.message, author: "bob" }),
  ]);
  expect(results[1]?.status).toBe("fulfilled");
  const threads = await discussing._topicThreads({ topic: "entry" });
  if (results[0]?.status === "fulfilled") {
    expect(threads[0]?.messages[0]).toMatchObject({ author: "", name: "", text: "" });
    expect(threads[0]?.messages[1]?.parent).toBe(opened.message);
  } else expect(threads).toEqual([]);
});
