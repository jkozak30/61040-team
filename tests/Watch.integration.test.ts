import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { createGateway } from "@mit-sdg/sync-engine/boundary";
import { createHttpHandler } from "@mit-sdg/sync-engine-http/handler";
import { assembleApplication } from "../src/assembly.ts";
import { maintainWatches } from "../src/watch-maintenance.ts";
import { policy } from "../src/http.ts";
import { openTestDb, type TestDb } from "./test-db.ts";

const password = "a long test passphrase";
const lectureA = "M7lc1UVf-VE";
const lectureB = "aqz-KE-bpKQ";
let db: TestDb;
let application: ReturnType<typeof assembleApplication>;
let api: ReturnType<typeof createHttpHandler>;
beforeAll(async () => { db = await openTestDb(); });
beforeEach(async () => {
  await db.db.dropDatabase();
  application = assembleApplication(db.db, async (id) =>
    id === lectureA ? "Lecture A" : id === lectureB ? "Lecture B" : undefined);
  api = createHttpHandler({ application, gateway: createGateway({ application }), policy });
});
afterAll(async () => { await db?.close(); });

function post(path: string, body: object, cookie?: string) {
  const headers = new Headers({
    "Content-Type": "application/json",
    Origin: policy.publicOrigin ?? "http://127.0.0.1:8080",
  });
  if (cookie) headers.set("Cookie", cookie);
  return api(new Request(`http://127.0.0.1:3000/api${path}`, {
    method: "POST", headers, body: JSON.stringify(body),
  }));
}

function cookieFrom(response: Response) {
  expect(response.status).toBe(200);
  const header = response.headers.get("Set-Cookie");
  expect(header).toContain("HttpOnly");
  return header!.split(";")[0]!;
}

async function ok(path: string, body: object, cookie: string) {
  const result = await post(path, body, cookie);
  const response = await result.json();
  if (result.status !== 200) throw new Error(`${path}: ${result.status} ${JSON.stringify(response)}`);
  return response;
}

async function prepare() {
  const hostCookie = cookieFrom(await post("/auth/register", { username: "host", password }));
  const created = await ok("/rooms/create", { name: "Host" }, hostCookie);
  const guestCookie = cookieFrom(await post("/auth/guest", {}));
  const joined = await ok("/rooms/join", { code: created.code, name: "Guest" }, guestCookie);
  return {
    hostCookie, guestCookie, code: created.code,
    host: { room: created.room, participant: created.participant },
    guest: { room: joined.room, participant: joined.participant },
  };
}

test("both viewers see accepted controls and departure ends shared playback", async () => {
  const { hostCookie, guestCookie, host, guest, code } = await prepare();
  const beforeOpen = await ok("/watch/history", {}, hostCookie);
  expect(beforeOpen.rooms[0].watch).toEqual({ status: "NOT_STARTED", entries: [] });
  expect(beforeOpen.rooms[0]).toMatchObject({ owner: true, lastJoinedAt: expect.any(String) });
  const opened = await ok("/watch/open", host, hostCookie);
  expect(await ok("/watch/open", guest, guestCookie)).toEqual(opened);
  const added = await ok("/watch/add-video", { ...host, videoId: lectureA }, hostCookie);
  expect(added.revision).toBe(1);
  expect((await post("/watch/control", {
    ...guest, connection: "guest-tab", entry: added.entry, expectedRevision: 1, operation: "PLAY",
  }, guestCookie)).status).toBe(409);
  expect((await ok("/watch/history", {}, hostCookie)).rooms[0].watch.status).toBe("NOT_STARTED");
  await ok("/watch/start", { ...host, entry: added.entry }, hostCookie);
  await ok("/watch/presence", { ...host, connection: "host-tab" }, hostCookie);
  await ok("/watch/presence", { ...guest, connection: "guest-tab" }, guestCookie);
  await ok("/watch/presence", { ...guest, connection: "guest-other-tab" }, guestCookie);
  const control = { ...guest, connection: "guest-tab", entry: added.entry, expectedRevision: 2, operation: "PLAY" };
  expect(await ok("/watch/control", control, guestCookie)).toEqual({ revision: 3, changed: true });
  expect((await post("/watch/control", { ...control, operation: "SEEK", position: 12 }, guestCookie)).status)
    .toBe(409);
  expect((await post("/watch/control", { ...control, expectedRevision: 3, operation: "SEEK" }, guestCookie)).status)
    .toBe(400);

  await ok("/rooms/presence", { ...host, connection: "host-room-tab" }, hostCookie);
  await ok("/rooms/presence", { ...guest, connection: "guest-room-tab" }, guestCookie);
  const hostRead = await ok("/watch/read", { ...host, afterRevision: 2 }, hostCookie);
  const guestRead = await ok("/watch/read", { ...guest, afterRevision: 2 }, guestCookie);
  expect(hostRead.isOwner).toBe(true);
  expect(guestRead.isOwner).toBe(false);
  expect(guestRead.watch).toEqual(hostRead.watch);
  expect(hostRead.watch).toMatchObject({
    snapshot: { activeEntry: added.entry, playback: "PLAYING", revision: 3 },
    entries: [{ entry: added.entry, source: { provider: "youtube", id: lectureA } }],
    controls: [{ viewer: guest.participant, name: "Guest", event: { entry: added.entry, operation: "PLAY", revision: 3 } }],
    participants: expect.arrayContaining([
      { participant: host.participant, name: "Host", owner: true },
      { participant: guest.participant, name: "Guest", owner: false },
    ]),
    viewers: [
      { viewer: host.participant, name: "Host", owner: true },
      { viewer: guest.participant, name: "Guest", owner: false },
    ],
  });

  expect(await ok("/watch/leave", { ...host, connection: "host-tab" }, hostCookie)).toEqual({ ended: false });
  expect(await ok("/watch/leave", { ...guest, connection: "guest-tab" }, guestCookie)).toEqual({ ended: false });
  expect(await ok("/watch/leave", { ...guest, connection: "guest-other-tab" }, guestCookie)).toEqual({ ended: true });
  const ended = await ok("/watch/read", { ...host, afterRevision: 3 }, hostCookie);
  expect(ended.watch).toMatchObject({ snapshot: { playback: "PAUSED", endedAt: expect.any(String) }, viewers: [] });
  expect((await ok("/watch/history", {}, hostCookie)).rooms[0]).toMatchObject({
    room: host.room, watch: { status: "ENDED", activeEntry: added.entry, endedAt: ended.watch.snapshot.endedAt },
  });
  expect(await ok("/rooms/reopen", { room: host.room }, hostCookie)).toEqual({ ...host, code });
  expect((await post("/watch/presence", { ...guest, connection: "guest-tab" }, guestCookie)).status).toBe(409);
  expect(await ok("/auth/me", {}, guestCookie)).toEqual({ kind: "guest" });
});

test("owner permissions and room membership gate the watch endpoints", async () => {
  const { hostCookie, guestCookie, host, guest } = await prepare();
  const outsider = cookieFrom(await post("/auth/guest", {}));
  expect((await post("/watch/open", guest, outsider)).status).toBe(403);
  await ok("/watch/open", host, hostCookie);
  expect((await post("/watch/read", { ...host, afterRevision: 0 }, outsider)).status).toBe(403);
  expect((await post("/watch/read", { ...guest, room: "wrong-room", afterRevision: 0 }, guestCookie)).status).toBe(403);
  expect((await post("/watch/add-video", { ...guest, videoId: lectureA }, guestCookie)).status).toBe(403);
  expect((await post("/watch/add-video", { ...host, videoId: "invalid" }, hostCookie)).status).toBe(400);
  expect((await ok("/watch/read", { ...host, afterRevision: 0 }, hostCookie)).watch.entries).toEqual([]);
  const first = await ok("/watch/add-video", { ...host, videoId: lectureA }, hostCookie);
  const second = await ok("/watch/add-video", { ...host, videoId: lectureB }, hostCookie);
  expect((await post("/watch/switch-video", { ...guest, entry: first.entry }, guestCookie)).status).toBe(403);
  expect(await ok("/watch/start", { ...host, entry: first.entry }, hostCookie)).toEqual({ revision: 3 });
  const read = await ok("/watch/read", { ...host, afterRevision: 0 }, hostCookie);
  expect(read.watch.snapshot).toMatchObject({ activeEntry: first.entry, position: 0, playback: "PAUSED" });
  expect(read.watch.entries.map(({ entry }: { entry: string }) => entry)).toEqual([first.entry, second.entry]);
  await ok("/watch/presence", { ...host, connection: "tab" }, hostCookie);
  await ok("/watch/control", { ...host, connection: "tab", entry: first.entry, expectedRevision: 3, operation: "SEEK", offset: 10 }, hostCookie);
  const shifted = await ok("/watch/read", { ...host, afterRevision: 3 }, hostCookie);
  expect(shifted.watch.controls[0].event).toMatchObject({ operation: "SEEK", position: 10, offset: 10 });
  expect((await ok("/watch/history", {}, hostCookie)).rooms[0].watch.entries).toEqual([
    { entry: first.entry, source: { provider: "youtube", id: lectureA, title: "Lecture A" } },
    { entry: second.entry, source: { provider: "youtube", id: lectureB, title: "Lecture B" } },
  ]);
  expect((await post("/watch/end", guest, guestCookie)).status).toBe(403);
  expect(await ok("/watch/end", host, hostCookie)).toEqual({ ended: true });
});

test("a missing title keeps the video usable by ID", async () => {
  const { host, hostCookie } = await prepare();
  await ok("/watch/open", host, hostCookie);
  const videoId = "noTitle0000";
  const { entry } = await ok("/watch/add-video", { ...host, videoId }, hostCookie);
  const history = await ok("/watch/history", {}, hostCookie);
  expect(history.rooms[0].watch.entries).toEqual([{ entry, source: { provider: "youtube", id: videoId } }]);
});

test("the owner can transfer before or during a live watch and both accounts keep history", async () => {
  const { host, hostCookie, guest, code } = await prepare();
  const friendCookie = cookieFrom(await post("/auth/register", { username: "friend", password }));
  const friend = await ok("/rooms/join", { code, name: "Friend" }, friendCookie);
  await db.db.collection("roomjoining.rooms").updateOne({ _id: host.room }, [
    { $set: { host: "$owner" } }, { $unset: "owner" },
  ]);
  await ok("/watch/open", host, hostCookie);
  expect((await post("/rooms/transfer-ownership", { ...host, successor: guest.participant }, hostCookie)).status).toBe(403);
  expect((await post("/rooms/transfer-ownership", { ...friend, successor: host.participant }, friendCookie)).status).toBe(403);
  expect((await post("/rooms/transfer-ownership", { ...host, successor: friend.participant }, hostCookie)).status).toBe(403);
  await ok("/rooms/presence", { ...friend, connection: "friend-room-tab" }, friendCookie);
  expect((await post("/rooms/presence", { ...friend, connection: "forged-tab" }, hostCookie)).status).toBe(403);
  const localFriend = await ok("/watch/read", { ...host, afterRevision: 0 }, hostCookie);
  expect(localFriend.watch.ownershipCandidates).toEqual([{ participant: friend.participant, name: "Friend" }]);
  expect(localFriend.watch.viewers).toEqual([]);
  await ok("/rooms/leave", { ...friend, connection: "friend-room-tab" }, friendCookie);
  expect((await ok("/watch/read", { ...host, afterRevision: 0 }, hostCookie)).watch.ownershipCandidates).toEqual([]);
  expect((await post("/rooms/transfer-ownership", { ...host, successor: friend.participant }, hostCookie)).status).toBe(403);
  await ok("/rooms/presence", { ...friend, connection: "friend-room-tab" }, friendCookie);
  await db.db.collection("sessioning.reusableConnections").updateOne({ _id: host.room }, {
    $set: { "connections.0.lastSeen": new Date(Date.now() - 61_000) },
  });
  expect((await ok("/watch/read", { ...host, afterRevision: 0 }, hostCookie)).watch.ownershipCandidates).toEqual([]);
  expect((await post("/rooms/transfer-ownership", { ...host, successor: friend.participant }, hostCookie)).status).toBe(403);
  await ok("/rooms/presence", { ...friend, connection: "friend-room-tab" }, friendCookie);
  await ok("/rooms/transfer-ownership", { ...host, successor: friend.participant }, hostCookie);
  expect((await post("/watch/add-video", { ...host, videoId: lectureA }, hostCookie)).status).toBe(403);
  const first = await ok("/watch/add-video", { ...friend, videoId: lectureA }, friendCookie);
  await ok("/watch/start", { ...friend, entry: first.entry }, friendCookie);
  await ok("/watch/presence", { ...host, connection: "host-tab" }, hostCookie);
  await ok("/watch/presence", { ...friend, connection: "friend-tab" }, friendCookie);
  await ok("/watch/leave", { ...friend, connection: "friend-tab" }, friendCookie);
  await maintainWatches(application.concepts);
  expect((await ok("/watch/read", { ...friend, afterRevision: 0 }, friendCookie)).isOwner).toBe(true);
  await ok("/rooms/presence", { ...host, connection: "host-room-tab" }, hostCookie);
  await ok("/rooms/transfer-ownership", { ...friend, successor: host.participant }, friendCookie);
  expect((await post("/watch/end", friend, friendCookie)).status).toBe(403);
  await ok("/rooms/leave", { ...friend, connection: "friend-room-tab" }, friendCookie);
  expect((await ok("/watch/read", { ...host, afterRevision: 0 }, hostCookie)).watch.snapshot.endedAt).toBeUndefined();
  await ok("/watch/end", host, hostCookie);
  await ok("/watch/add-video", { ...host, videoId: lectureB }, hostCookie);
  expect((await post("/watch/start", { ...host, entry: first.entry }, hostCookie)).status).toBe(409);
  for (const cookie of [hostCookie, friendCookie]) {
    expect((await ok("/watch/history", {}, cookie)).rooms[0]).toMatchObject({
      room: host.room, watch: { status: "ENDED", entries: [expect.any(Object), expect.any(Object)] },
    });
  }
});

test("a preview title is saved even if the server cannot look it up", async () => {
  const { host, hostCookie } = await prepare();
  await ok("/watch/open", host, hostCookie);
  const videoId = "noTitle0000";
  const { entry } = await ok("/watch/add-video", { ...host, videoId, previewTitle: "  Preview title  " }, hostCookie);
  const history = await ok("/watch/history", {}, hostCookie);
  expect(history.rooms[0].watch.entries).toEqual([{ entry, source: { provider: "youtube", id: videoId, title: "Preview title" } }]);
});

test("the live watch ends when the owner's last room tab leaves", async () => {
  const { host, hostCookie, guest, guestCookie } = await prepare();
  const firstTab = { ...host, connection: "owner-room-first" };
  const secondTab = { ...host, connection: "owner-room-second" };
  const guestTab = { ...guest, connection: "guest-room" };
  await ok("/rooms/presence", firstTab, hostCookie);
  await ok("/rooms/presence", secondTab, hostCookie);
  await ok("/rooms/presence", guestTab, guestCookie);
  await ok("/watch/open", host, hostCookie);
  const { entry } = await ok("/watch/add-video", { ...host, videoId: lectureA }, hostCookie);
  await ok("/watch/start", { ...host, entry }, hostCookie);
  await ok("/watch/presence", { ...guest, connection: "guest-live" }, guestCookie);

  await ok("/rooms/leave", firstTab, hostCookie);
  expect((await ok("/watch/read", { ...guest, afterRevision: 0 }, guestCookie)).watch.snapshot.endedAt).toBeUndefined();
  await ok("/rooms/leave", secondTab, hostCookie);
  const ended = await ok("/watch/read", { ...guest, afterRevision: 0 }, guestCookie);
  expect(ended.watch.snapshot).toMatchObject({ activeEntry: entry, endedAt: expect.any(String) });
  expect(ended.watch.entries).toHaveLength(1);
  expect((await post("/watch/start", { ...host, entry }, hostCookie)).status).toBe(409);
});

test("a room heartbeat ends the watch after the owner's room presence expires", async () => {
  const { host, hostCookie, guest, guestCookie } = await prepare();
  await ok("/rooms/presence", { ...host, connection: "owner-room" }, hostCookie);
  await ok("/rooms/presence", { ...guest, connection: "guest-room" }, guestCookie);
  await ok("/watch/open", host, hostCookie);
  const { entry } = await ok("/watch/add-video", { ...host, videoId: lectureA }, hostCookie);
  await ok("/watch/start", { ...host, entry }, hostCookie);
  await ok("/watch/presence", { ...guest, connection: "guest-live" }, guestCookie);
  await db.db.collection("sessioning.reusableConnections").updateOne(
    { _id: host.room, "connections.connection": "owner-room" },
    { $set: { "connections.$.lastSeen": new Date(Date.now() - 61_000) } },
  );

  await ok("/rooms/presence", { ...guest, connection: "guest-room" }, guestCookie);
  expect((await ok("/watch/read", { ...guest, afterRevision: 0 }, guestCookie)).watch.snapshot.endedAt).toEqual(expect.any(String));
});
