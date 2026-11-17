import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import {
  InvalidOwnerName, InvalidJoinName, InvalidRoomCode,
  NoSavedVisit, RoomJoiningConcept, VisitNotClaimable,
} from "../src/concepts/RoomJoining.ts";
import { openTestDb, type TestDb } from "./test-db.ts";

let db: TestDb;
let rooms: RoomJoiningConcept<string>;
let now: Date;
beforeAll(async () => { db = await openTestDb(); });
beforeEach(async () => {
  await db.db.dropDatabase();
  now = new Date("2026-11-07T12:00:00Z");
  rooms = new RoomJoiningConcept(db.db, () => now);
});
afterAll(async () => { await db?.close(); });

test("a guest visit can be claimed without changing the participant", async () => {
  const { room, code, participant: host } = await rooms.create({ identity: "host", name: "Host" });
  expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  expect(await rooms._participant({ participant: host })).toMatchObject([{ room, identity: "host", owner: true }]);
  const joined = await rooms.join({ code: code.toLowerCase(), name: " Guest ", identity: "guest", saveVisit: false });
  const { participant } = joined;
  await db.db.collection<{ _id: typeof room }>("roomjoining.rooms").updateOne({ _id: room }, {
    $set: { "participants.0.account": "host", "participants.1.visitor": "guest", visits: [{ account: "host", lastActivityAt: now }] },
    $unset: { "participants.0.identity": "", "participants.1.identity": "" },
  });
  expect(await rooms._history({ identity: "host" })).toEqual([{ room, participant: host, lastActivityAt: now, lastJoinedAt: now, owner: true }]);
  expect(await rooms.join({ code, name: "Other name", identity: "guest", saveVisit: false })).toEqual(joined);
  expect(await rooms._participant({ participant })).toEqual([{ room, name: "Guest", identity: "guest", owner: false, canonical: participant }]);
  await expect(rooms.claimVisit({ participant, previousIdentity: "outsider", identity: "viewer" }))
    .rejects.toBeInstanceOf(VisitNotClaimable);
  expect(await rooms._history({ identity: "viewer" })).toEqual([]);
  expect(await rooms._history({ identity: "guest" })).toEqual([]);

  const claim = { participant, previousIdentity: "guest", identity: "viewer" };
  expect(await rooms.claimVisit(claim)).toEqual({ room, claimedParticipant: participant });
  expect(await rooms.claimVisit(claim)).toEqual({ room, claimedParticipant: participant });
  expect(await rooms._participant({ participant })).toEqual([{ room, name: "Guest", identity: "viewer", owner: false, canonical: participant }]);
  expect(await rooms.recordActivity({ room, identity: "viewer" })).toEqual({ participant });
});

test("saved rooms follow activity order and concurrent joins reuse a participant", async () => {
  const first = await rooms.create({ identity: "host", name: "Host" });
  now = new Date(now.getTime() + 1000);
  const second = await rooms.create({ identity: "host", name: "Host" });
  expect((await rooms._history({ identity: "host" })).map(({ room }) => room))
    .toEqual([second.room, first.room]);
  now = new Date(now.getTime() + 1000);
  await rooms.recordActivity({ room: first.room, identity: "host" });
  expect(await rooms._savedVisit({ room: first.room, identity: "host" })).toEqual([{ lastActivityAt: now }]);
  expect((await rooms._history({ identity: "host" })).map(({ room }) => room))
    .toEqual([first.room, second.room]);
  const join = { code: first.code, name: "Viewer", identity: "viewer", saveVisit: true };
  const [left, right] = await Promise.all([rooms.join(join), rooms.join(join)]);
  expect(left).toEqual(right);
  expect(await rooms._history({ identity: "viewer" })).toHaveLength(1);
});

test("invalid requests do not grant room access", async () => {
  await expect(rooms.create({ identity: "host", name: " " })).rejects.toBeInstanceOf(InvalidOwnerName);
  const { room, code } = await rooms.create({ identity: "host", name: "Host" });
  await expect(rooms.join({ code: "invalid", name: "Viewer", identity: "viewer", saveVisit: true }))
    .rejects.toBeInstanceOf(InvalidRoomCode);
  await expect(rooms.join({ code, name: "a".repeat(33), identity: "viewer", saveVisit: true }))
    .rejects.toBeInstanceOf(InvalidJoinName);
  await expect(rooms.recordActivity({ room, identity: "viewer" })).rejects.toBeInstanceOf(NoSavedVisit);
  expect(await rooms._savedVisit({ room, identity: "viewer" })).toEqual([]);
});

test("claiming a guest visit reuses the account's existing name and participant", async () => {
  const { room, code } = await rooms.create({ identity: "host", name: "Host" });
  const account = await rooms.join({ code, identity: "account", name: "Original", saveVisit: true });
  const guest = await rooms.join({ code, identity: "guest", name: "Guest", saveVisit: false });
  const claim = { participant: guest.participant, previousIdentity: "guest", identity: "account" };
  expect(await rooms.claimVisit(claim)).toEqual({ room, claimedParticipant: account.participant });
  expect(await rooms.claimVisit(claim)).toEqual({ room, claimedParticipant: account.participant });
  expect(await rooms.join({ code, identity: "account", saveVisit: true })).toEqual(account);
  expect(await rooms._participant(account)).toMatchObject([{ name: "Original", identity: "account" }]);
  expect(await rooms._participant(guest)).toMatchObject([{ name: "Guest", identity: "guest" }]);
});

test("legacy saved visits and duplicate IDs survive consolidation", async () => {
  const { room, code, participant } = await rooms.create({ identity: "host", name: "Original" });
  const oldParticipant = crypto.randomUUID() as typeof participant;
  const later = new Date(now.getTime() + 1000);
  await db.db.collection<{ _id: typeof room }>("roomjoining.rooms").updateOne({ _id: room }, {
    $set: {
      participants: [{ id: participant, name: "Original", account: "host" },
        { id: oldParticipant, name: "Duplicate", identity: "host" }],
      visits: [{ account: "host", lastActivityAt: later }],
    },
  });
  expect(await rooms._history({ identity: "host" })).toEqual([{ room, participant, lastActivityAt: later, lastJoinedAt: null, owner: true }]);
  expect(await rooms.join({ code, identity: "host", name: "New", saveVisit: true })).toEqual({ room, participant });
  expect(await rooms._participant({ participant: oldParticipant })).toMatchObject([{ name: "Original", canonical: participant }]);
  const stored = await db.db.collection<{ _id: typeof room; visits?: unknown; participants: unknown[] }>("roomjoining.rooms").findOne({ _id: room });
  expect(stored?.visits).toBeUndefined();
  expect(stored?.participants).toHaveLength(1);
});

test("room activity and joins have separate timestamps", async () => {
  const { room, participant, code } = await rooms.create({ identity: "host", name: "Host" });
  const createdAt = now;
  now = new Date(now.getTime() + 1000);
  await rooms.recordActivity({ room, identity: "host" });
  expect(await rooms._history({ identity: "host" })).toEqual([
    { room, participant, owner: true, lastActivityAt: now, lastJoinedAt: createdAt },
  ]);
  now = new Date(now.getTime() + 1000);
  expect(await rooms.reopen({ room, identity: "host" })).toEqual({ participant, code });
  expect(await rooms._history({ identity: "host" })).toEqual([
    { room, participant, owner: true, lastActivityAt: now, lastJoinedAt: now },
  ]);
});
