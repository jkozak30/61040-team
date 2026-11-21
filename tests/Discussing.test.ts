import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import {
  DiscussingConcept, InvalidAnchor, InvalidMessage, ThreadUnavailable,
  type Message, type Thread,
} from "../src/concepts/Discussing.ts";
import { openTestDb, type TestDb } from "./test-db.ts";

let db: TestDb;
let discussing: DiscussingConcept;
let now: Date;

beforeAll(async () => { db = await openTestDb(); });
beforeEach(async () => {
  await db.db.dropDatabase();
  now = new Date("2026-11-20T12:00:00Z");
  discussing = new DiscussingConcept(db.db, () => now);
});
afterAll(async () => { await db?.close(); });

function advance(milliseconds: number) {
  now = new Date(now.getTime() + milliseconds);
}

test("a timestamped thread and nested replies remain available for later review", async () => {
  const { thread, message: opening } = await discussing.startThread({
    topic: "pruning-video", author: "bob", name: " Bob ", anchor: 1122,
    text: " Why can these connections go? ", context: "LIVE",
  });
  advance(1000);
  const { message: answer } = await discussing.reply({
    parent: opening, author: "alice", name: "Alice", text: " Small weights contribute little. ", context: "LIVE",
  });
  advance(1000);
  const { message: followUp } = await discussing.reply({
    parent: answer, author: "bob", name: "Bobby", text: "How small is small enough?", context: "HISTORICAL",
  });

  const later = new DiscussingConcept(db.db, () => now);
  expect(await later._thread({ thread })).toEqual([{
    topic: "pruning-video", anchor: 1122, messages: [
      { message: opening, author: "bob", name: "Bob", text: "Why can these connections go?", context: "LIVE", postedAt: new Date("2026-11-20T12:00:00Z") },
      { message: answer, parent: opening, author: "alice", name: "Alice", text: "Small weights contribute little.", context: "LIVE", postedAt: new Date("2026-11-20T12:00:01Z") },
      { message: followUp, parent: answer, author: "bob", name: "Bobby", text: "How small is small enough?", context: "HISTORICAL", postedAt: now },
    ],
  }]);
  expect(await later._message({ message: answer })).toEqual([{ thread, topic: "pruning-video", anchor: 1122 }]);
  expect(await later._topicThreads({ topic: "pruning-video" })).toMatchObject([{
    thread, anchor: 1122, messages: [{ message: opening }, { message: answer }, { message: followUp }],
  }]);
});

test("invalid anchors and messages refuse without creating a thread or reply", async () => {
  const base = { topic: "video", author: "bob", name: "Bob", text: "Question", context: "LIVE" };
  for (const anchor of [-1, NaN, Infinity]) {
    await expect(discussing.startThread({ ...base, anchor })).rejects.toBeInstanceOf(InvalidAnchor);
  }
  for (const text of [" ", "x".repeat(2001)]) {
    await expect(discussing.startThread({ ...base, anchor: 5, text })).rejects.toBeInstanceOf(InvalidMessage);
  }
  await expect(discussing.startThread({ ...base, anchor: 5, name: " " })).rejects.toBeInstanceOf(InvalidMessage);
  expect(await discussing._topicThreads({ topic: "video" })).toEqual([]);

  const { thread, message } = await discussing.startThread({ ...base, anchor: 5 });
  await expect(discussing.reply({ parent: "missing" as Message, author: "alice", name: "Alice", text: "Reply", context: "LIVE" }))
    .rejects.toBeInstanceOf(ThreadUnavailable);
  await expect(discussing.reply({ parent: message, author: "alice", name: "Alice", text: " ", context: "LIVE" }))
    .rejects.toBeInstanceOf(InvalidMessage);
  expect((await discussing._thread({ thread }))[0]?.messages).toHaveLength(1);
  expect(await discussing._thread({ thread: "missing" as Thread })).toEqual([]);
  expect(await discussing._message({ message: "missing" as Message })).toEqual([]);
});

test("thread queries are ordered by video position and separated by saved entry", async () => {
  const base = { author: "bob", name: "Bob", text: "Question", context: "HISTORICAL" };
  const later = await discussing.startThread({ ...base, topic: "entry-a", anchor: 30 });
  advance(1000);
  const earlier = await discussing.startThread({ ...base, topic: "entry-a", anchor: 10 });
  await discussing.startThread({ ...base, topic: "entry-b", anchor: 10 });

  expect((await discussing._topicThreads({ topic: "entry-a" })).map(({ thread }) => thread))
    .toEqual([earlier.thread, later.thread]);
  expect(await discussing._topicThreads({ topic: "entry-b" })).toHaveLength(1);
});

test("concurrent replies from separate instances are both retained", async () => {
  const { thread, message } = await discussing.startThread({
    topic: "video", author: "bob", name: "Bob", anchor: 12, text: "Question", context: "LIVE",
  });
  const other = new DiscussingConcept(db.db, () => now);
  const [first, second] = await Promise.all([
    discussing.reply({ parent: message, author: "alice", name: "Alice", text: "First", context: "LIVE" }),
    other.reply({ parent: message, author: "carol", name: "Carol", text: "Second", context: "LIVE" }),
  ]);
  const nested = await discussing.reply({ parent: second.message, author: "bob", name: "Bob", text: "Follow-up", context: "LIVE" });
  const messages = (await discussing._thread({ thread }))[0]!.messages;
  expect(messages).toHaveLength(4);
  expect(messages.map(({ message }) => message)).toEqual(expect.arrayContaining([first.message, second.message]));
  expect(messages.findIndex(({ message }) => message === second.message))
    .toBeLessThan(messages.findIndex(({ message }) => message === nested.message));
});
