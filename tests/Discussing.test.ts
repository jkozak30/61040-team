import { afterAll, beforeAll, expect, test } from "bun:test";
import { DiscussingConcept, EmptyReply, InvalidThread, UnknownParent } from "../src/concepts/Discussing.ts";
import { openTestDb, type TestDb } from "./test-db.ts";

let db: TestDb;
beforeAll(async () => { db = await openTestDb(); });
afterAll(async () => { await db?.close(); });

test("threads retain document anchors and nested messages retain their individual context", async () => {
  const concept = new DiscussingConcept<string, string, { section: string }, "DRAFT" | "REVIEW">(db.db);
  const author = { author: "viewer", name: "Viewer" };
  const topic = "entry";
  expect((await concept._discussion({ topic })).discussion).toEqual({ revision: 0, threads: [], messages: [] });
  const [first, second] = await Promise.all([
    concept.startThread({ topic, ...author, anchor: { section: "appendix" }, text: " First ", context: "DRAFT" }),
    concept.startThread({ topic, ...author, anchor: { section: "intro" }, text: "Second", context: "DRAFT" }),
  ]);
  expect([first.revision, second.revision].sort()).toEqual([1, 2]);
  const reply = await concept.reply({ parent: first.message, ...author, text: "Later", context: "REVIEW" });
  const nested = await concept.reply({ parent: reply.message, ...author, text: "Nested", context: "REVIEW" });
  expect(await concept._topic({ message: nested.message })).toEqual([{ topic }]);
  const { discussion } = await concept._discussion({ topic });
  expect(discussion.revision).toBe(4);
  expect(discussion.threads).toEqual([
    { thread: first.thread, anchor: { section: "appendix" }, revision: first.revision },
    { thread: second.thread, anchor: { section: "intro" }, revision: second.revision },
  ].sort((left, right) => left.revision - right.revision).map(({ thread, anchor }) => ({ thread, anchor })));
  expect(discussion.messages.find(({ message }) => message === first.message)).toMatchObject({ text: "First", context: "DRAFT" });
  expect(discussion.messages[2]).toMatchObject({ parent: first.message, thread: first.thread, context: "REVIEW" });
  expect(discussion.messages[3]).toMatchObject({ parent: reply.message, thread: first.thread, context: "REVIEW" });
  expect(discussion.messages[3]).not.toHaveProperty("anchor");
  await expect(concept.startThread({ topic, ...author, anchor: { section: "intro" }, text: " ", context: "DRAFT" })).rejects.toBeInstanceOf(InvalidThread);
  await expect(concept.reply({ parent: reply.message, ...author, text: " ", context: "DRAFT" })).rejects.toBeInstanceOf(EmptyReply);
  await expect(concept.reply({ parent: "missing" as typeof reply.message, ...author, text: "Reply", context: "REVIEW" })).rejects.toBeInstanceOf(UnknownParent);
  expect((await concept._discussion({ topic })).discussion.revision).toBe(4);
});
