import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { LeaveNotOwner, PresenceConcept, PresenceUnavailable } from "../src/concepts/Presence.ts";
import { openTestDb, type TestDb } from "./test-db.ts";

let testDb: TestDb;
let presence: PresenceConcept;
let now: Date;

beforeAll(async () => {
  testDb = await openTestDb();
});

beforeEach(async () => {
  await testDb.db.dropDatabase();
  now = new Date();
  presence = new PresenceConcept(testDb.db, () => now);
});

afterAll(async () => {
  await testDb?.close();
});

const first = { scope: "room", subject: "viewer", connection: "tab" };

function advance(ms: number) {
  now = new Date(now.getTime() + ms);
}

test("multiple tabs count once and only their viewer can leave them", async () => {
  const second = { ...first, connection: "other-tab" };
  const another = { ...first, subject: "other", connection: "their-tab" };
  await presence.keepPresent(first);
  await presence.keepPresent(second);
  await presence.keepPresent(another);
  expect(await presence._presentSubjects(first)).toEqual([{ subject: "viewer" }, { subject: "other" }]);
  await expect(presence.keepPresent({ ...first, subject: "other" })).rejects.toBeInstanceOf(PresenceUnavailable);
  await expect(presence.leave({ ...first, subject: "other" })).rejects.toBeInstanceOf(LeaveNotOwner);
  expect(await presence.leave(first)).toEqual({ drained: false });
  expect(await presence.leave(another)).toEqual({ drained: false });
  expect(await presence._presentSubjects(first)).toEqual([{ subject: "viewer" }]);
  expect(await presence.leave(second)).toEqual({ drained: true });
  expect(await presence.leave(second)).toEqual({ drained: false });
  expect(await presence._presentSubjects(first)).toEqual([]);
  await expect(presence.keepPresent(first)).rejects.toBeInstanceOf(PresenceUnavailable);
});

test("heartbeats are scoped and expired groups stay due until closed", async () => {
  const other = { ...first, scope: "other-room" };
  expect(await presence.expirePresence(first)).toEqual({ drained: false });
  await presence.keepPresent(first);
  await presence.keepPresent(other);
  advance(10_000);
  await presence.keepPresent(first);
  advance(50_000);
  expect(await presence._due({})).toEqual([{ scope: other.scope }]);
  expect(await presence.expirePresence(other)).toEqual({ drained: true });
  expect(await presence.expirePresence(other)).toEqual({ drained: true });
  expect(await presence._presentSubjects(first)).toEqual([{ subject: "viewer" }]);
  await presence.close(other);
  expect(await presence._due({})).toEqual([]);
  advance(10_000);
  expect(await presence._presentSubjects(first)).toEqual([]);
  await expect(presence.keepPresent(first)).rejects.toBeInstanceOf(PresenceUnavailable);
  expect(await presence.expirePresence(first)).toEqual({ drained: true });
});

test("explicit close prevents a new group from taking connections", async () => {
  await presence.close(first);
  expect(await presence._presentSubjects(first)).toEqual([]);
  await expect(presence.keepPresent(first)).rejects.toBeInstanceOf(PresenceUnavailable);
});

test("reusable presence can be renewed after everyone leaves or expires", async () => {
  const first = { scope: "room", subject: "member", connection: "first", reusable: true };
  const second = { ...first, connection: "second" };
  await presence.keepPresent(first);
  await presence.keepPresent(second);
  expect(await presence._presentSubjects({ scope: first.scope })).toEqual([]);
  expect(await presence.leave(first)).toEqual({ drained: false });
  expect(await presence._presentSubjects(first)).toEqual([{ subject: "member" }]);
  expect(await presence.leave(second)).toEqual({ drained: false });
  expect(await presence._presentSubjects(first)).toEqual([]);
  await presence.keepPresent(first);
  now = new Date(now.getTime() + 60_000);
  expect(await presence._presentSubjects(first)).toEqual([]);
  expect(await presence._due({})).toEqual([]);
  await presence.keepPresent(second);
  expect(await presence._presentSubjects(first)).toEqual([{ subject: "member" }]);
});
