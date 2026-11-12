import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import {
  EndNotSignedIn,
  LeaveNotOwner,
  PresenceUnavailable,
  ReplaceNotSignedIn,
  type Session,
  SessioningConcept,
  CurrentNotSignedIn,
} from "../src/concepts/Sessioning.ts";
import { openTestDb, type TestDb } from "./test-db.ts";

const DAY = 24 * 60 * 60 * 1000;
let testDb: TestDb;
let sessions: SessioningConcept;
let now: Date;

beforeAll(async () => {
  testDb = await openTestDb();
});

beforeEach(async () => {
  await testDb.db.dropDatabase();
  now = new Date();
  sessions = new SessioningConcept(testDb.db, () => now);
});

afterAll(async () => {
  await testDb?.close();
});

test("a session starts, resolves across instances, and becomes unavailable after ending", async () => {
  const { session, expiresAt } = await sessions.start({ subject: "account:viewer" });
  const other = await sessions.start({ subject: "account:viewer" });
  const reader = new SessioningConcept(testDb.db, () => now);

  expect(session).not.toBe(other.session);
  expect(expiresAt.getTime()).toBe(now.getTime() + 90 * DAY);
  expect(await reader.current({ session })).toEqual({ subject: "account:viewer" });
  expect(await sessions.end({ session })).toEqual({ session });
  await expect(reader.current({ session })).rejects.toBeInstanceOf(CurrentNotSignedIn);
  await expect(reader.end({ session })).rejects.toBeInstanceOf(EndNotSignedIn);
  expect(await reader.current({ session: other.session })).toEqual({ subject: "account:viewer" });
});

test("current extends the idle window without extending absolute expiry", async () => {
  const { session, expiresAt } = await sessions.start({ subject: "guest:viewer" });
  now = new Date(now.getTime() + 6 * DAY);
  await sessions.current({ session });
  now = new Date(now.getTime() + 6 * DAY);
  expect(await sessions.current({ session })).toEqual({ subject: "guest:viewer" });

  while (expiresAt.getTime() - now.getTime() > 6 * DAY) {
    now = new Date(now.getTime() + 6 * DAY);
    await sessions.current({ session });
  }
  now = expiresAt;
  await expect(sessions.current({ session })).rejects.toBeInstanceOf(CurrentNotSignedIn);
});

test("unknown and exactly idle-expired sessions cannot be used, replaced, or ended", async () => {
  const issued = await sessions.start({ subject: "guest:viewer" });
  now = new Date(now.getTime() + 7 * DAY);
  for (const session of ["invented" as Session, issued.session]) {
    await expect(sessions.current({ session })).rejects.toBeInstanceOf(CurrentNotSignedIn);
    await expect(sessions.replace({ session, subject: "account:viewer" })).rejects.toBeInstanceOf(ReplaceNotSignedIn);
    await expect(sessions.end({ session })).rejects.toBeInstanceOf(EndNotSignedIn);
  }
  expect(await testDb.db.collection("sessioning.sessions").countDocuments()).toBe(1);
});

test("only one replacement can redeem the old token", async () => {
  const { session } = await sessions.start({ subject: "guest:viewer" });
  now = new Date(now.getTime() + DAY);
  const outcomes = await Promise.allSettled([
    sessions.replace({ session, subject: "account:viewer" }),
    sessions.replace({ session, subject: "account:viewer" }),
  ]);

  expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
  for (const outcome of outcomes) {
    if (outcome.status === "rejected") {
      expect(outcome.reason).toBeInstanceOf(ReplaceNotSignedIn);
    } else {
      const { replacement, expiresAt } = outcome.value;
      expect(replacement).not.toBe(session);
      expect(expiresAt.getTime()).toBe(now.getTime() + 90 * DAY);
      expect(await sessions.current({ session: replacement })).toEqual({ subject: "account:viewer" });
    }
  }
  await expect(sessions.current({ session })).rejects.toBeInstanceOf(CurrentNotSignedIn);
  expect(await testDb.db.collection("sessioning.sessions").countDocuments()).toBe(1);
});

const first = { scope: "room", subject: "viewer", connection: "tab" };

function advance(ms: number) {
  now = new Date(now.getTime() + ms);
}

test("multiple tabs count once and only their viewer can leave them", async () => {
  const second = { ...first, connection: "other-tab" };
  const another = { ...first, subject: "other", connection: "their-tab" };
  await sessions.keepPresent(first);
  await sessions.keepPresent(second);
  await sessions.keepPresent(another);
  expect(await sessions._presentSubjects(first)).toEqual([{ subject: "viewer" }, { subject: "other" }]);
  await expect(sessions.keepPresent({ ...first, subject: "other" })).rejects.toBeInstanceOf(PresenceUnavailable);
  await expect(sessions.leave({ ...first, subject: "other" })).rejects.toBeInstanceOf(LeaveNotOwner);
  expect(await sessions.leave(first)).toEqual({ drained: false });
  expect(await sessions.leave(another)).toEqual({ drained: false });
  expect(await sessions._presentSubjects(first)).toEqual([{ subject: "viewer" }]);
  expect(await sessions.leave(second)).toEqual({ drained: true });
  expect(await sessions.leave(second)).toEqual({ drained: false });
  expect(await sessions._presentSubjects(first)).toEqual([]);
  await expect(sessions.keepPresent(first)).rejects.toBeInstanceOf(PresenceUnavailable);
});

test("heartbeats are scoped and expired groups stay due until closed", async () => {
  const other = { ...first, scope: "other-room" };
  expect(await sessions.expirePresence(first)).toEqual({ drained: false });
  await sessions.keepPresent(first);
  await sessions.keepPresent(other);
  advance(10_000);
  await sessions.keepPresent(first);
  advance(50_000);
  expect(await sessions._due({})).toEqual([{ scope: other.scope }]);
  expect(await sessions.expirePresence(other)).toEqual({ drained: true });
  expect(await sessions.expirePresence(other)).toEqual({ drained: true });
  expect(await sessions._presentSubjects(first)).toEqual([{ subject: "viewer" }]);
  await sessions.close(other);
  expect(await sessions._due({})).toEqual([]);
  advance(10_000);
  expect(await sessions._presentSubjects(first)).toEqual([]);
  await expect(sessions.keepPresent(first)).rejects.toBeInstanceOf(PresenceUnavailable);
  expect(await sessions.expirePresence(first)).toEqual({ drained: true });
});

test("explicit close prevents a new group from taking connections", async () => {
  await sessions.close(first);
  expect(await sessions._presentSubjects(first)).toEqual([]);
  await expect(sessions.keepPresent(first)).rejects.toBeInstanceOf(PresenceUnavailable);
});

test("reusable presence can be renewed after everyone leaves or expires", async () => {
  const first = { scope: "room", subject: "member", connection: "first", reusable: true };
  const second = { ...first, connection: "second" };
  await sessions.keepPresent(first);
  await sessions.keepPresent(second);
  expect(await sessions._presentSubjects({ scope: first.scope })).toEqual([]);
  expect(await sessions.leave(first)).toEqual({ drained: false });
  expect(await sessions._presentSubjects(first)).toEqual([{ subject: "member" }]);
  expect(await sessions.leave(second)).toEqual({ drained: false });
  expect(await sessions._presentSubjects(first)).toEqual([]);
  await sessions.keepPresent(first);
  now = new Date(now.getTime() + 60_000);
  expect(await sessions._presentSubjects(first)).toEqual([]);
  expect(await sessions._due({})).toEqual([]);
  await sessions.keepPresent(second);
  expect(await sessions._presentSubjects(first)).toEqual([{ subject: "member" }]);
});
