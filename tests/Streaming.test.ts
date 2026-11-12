import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import {
  ControlUnavailable, InvalidSeek,
  StalePlayback, StreamingConcept, UnknownStream,
  VideoUnavailable, type Stream, type VideoEntry,
} from "../src/concepts/Streaming.ts";
import { openTestDb, type TestDb } from "./test-db.ts";

let db: TestDb;
let streaming: StreamingConcept;
let now: Date;

beforeAll(async () => { db = await openTestDb(); });
beforeEach(async () => {
  await db.db.dropDatabase();
  now = new Date("2026-11-07T12:00:00Z");
  streaming = new StreamingConcept(db.db, () => now);
});
afterAll(async () => { await db?.close(); });

function advance(milliseconds: number) {
  now = new Date(now.getTime() + milliseconds);
}

async function watchVideo() {
  const { stream } = await streaming.open({ scope: "room" });
  const { entry } = await streaming.addVideo({ stream, source: "video-a" });
  const { revision } = await streaming.start({ stream, entry });
  return { stream, entry, revision };
}

test("opening the same scope is idempotent across instances", async () => {
  const other = new StreamingConcept(db.db, () => now);
  expect(await streaming._stream({ scope: "room" })).toEqual([]);
  const [first, second] = await Promise.all([
    streaming.open({ scope: "room" }),
    other.open({ scope: "room" }),
  ]);
  expect(first).toEqual(second);
  expect(await other._stream({ scope: "room" })).toEqual([{
    stream: first.stream, snapshot: { playback: "PAUSED", position: 0, positionAt: now, revision: 0 },
    entries: [],
  }]);
});

test("playing, seeking, and pausing update the anchor and emit ordered control events", async () => {
  const { stream, entry, revision } = await watchVideo();
  const control = { stream, viewer: "viewer" };
  expect(await streaming.control({ ...control, command: { entry, expectedRevision: revision, operation: "PLAY" } }))
    .toEqual({ revision: 3, changed: true });
  advance(2000);
  expect(await streaming.control({ ...control, command: { entry, expectedRevision: 3, operation: "SEEK", target: { position: 10 } } }))
    .toEqual({ revision: 4, changed: true });
  expect((await streaming._stream({ scope: "room" }))[0]?.snapshot).toEqual({
    activeEntry: entry, playback: "PLAYING", position: 10, positionAt: now, revision: 4,
  });
  advance(2500);
  expect(await streaming.control({ ...control, command: { entry, expectedRevision: 4, operation: "PAUSE" } }))
    .toEqual({ revision: 5, changed: true });
  expect(await streaming.control({ ...control, command: { entry, expectedRevision: 4, operation: "PAUSE" } }))
    .toEqual({ revision: 5, changed: false });
  expect((await streaming._stream({ scope: "room" }))[0]?.snapshot).toEqual({
    activeEntry: entry, playback: "PAUSED", position: 12.5, positionAt: now, revision: 5,
  });
  expect(await streaming._controlsAfter({ stream, afterRevision: 3, throughRevision: 5 })).toEqual([
    { viewer: "viewer", event: { entry, operation: "SEEK", position: 10, offset: 0, revision: 4 } },
    { viewer: "viewer", event: { entry, operation: "PAUSE", position: 12.5, offset: 0, revision: 5 } },
  ]);
});

test("switching entries resets playback and preserves every entry after ending", async () => {
  const { stream, entry, revision } = await watchVideo();
  await streaming.control({ stream, viewer: "viewer", command: { entry, expectedRevision: revision, operation: "PLAY" } });
  const second = await streaming.addVideo({ stream, source: "video-b" });
  expect((await streaming._stream({ scope: "room" }))[0]?.snapshot.activeEntry).toBe(entry);
  expect(await streaming.switchVideo({ stream, entry: second.entry })).toEqual({ revision: 5 });
  expect(await streaming.switchVideo({ stream, entry })).toEqual({ revision: 6 });
  expect((await streaming._stream({ scope: "room" }))[0]?.snapshot).toEqual({
    activeEntry: entry, playback: "PAUSED", position: 0, positionAt: now, revision: 6,
  });
  await streaming.control({ stream, viewer: "viewer", command: { entry, expectedRevision: 6, operation: "PLAY" } });
  advance(1500);
  expect(await streaming.end({ stream })).toEqual({ ended: true });
  expect(await streaming.end({ stream })).toEqual({ ended: false });
  expect(await streaming.open({ scope: "room" })).toEqual({ stream });
  expect((await streaming._stream({ scope: "room" }))[0]?.snapshot).toEqual({
    activeEntry: entry, playback: "PAUSED", position: 1.5,
    positionAt: now, endedAt: now, revision: 8,
  });
  expect((await streaming._stream({ scope: "room" }))[0]?.entries).toEqual([
    { entry, source: "video-a" }, { entry: second.entry, source: "video-b" },
  ]);
  await expect(streaming.addVideo({ stream, source: "another" })).resolves.toMatchObject({ revision: 9 });
  await expect(streaming.start({ stream, entry })).rejects.toBeInstanceOf(VideoUnavailable);
  await expect(streaming.switchVideo({ stream, entry })).rejects.toBeInstanceOf(VideoUnavailable);
  await expect(streaming.control({ stream, viewer: "viewer", command: { entry, expectedRevision: 8, operation: "PLAY" } }))
    .rejects.toBeInstanceOf(ControlUnavailable);
});

test("refused commands leave playback and notifications intact", async () => {
  const { stream, entry, revision } = await watchVideo();
  const original = await streaming._stream({ scope: "room" });
  const control = { stream, viewer: "viewer" };
  await expect(streaming.end({ stream: "missing" as Stream })).rejects.toBeInstanceOf(UnknownStream);
  await expect(streaming.switchVideo({ stream, entry: "missing" as VideoEntry })).rejects.toBeInstanceOf(VideoUnavailable);
  for (const position of [undefined, -1, Infinity, NaN]) {
    await expect(streaming.control({ ...control, command: { entry, expectedRevision: revision, operation: "SEEK", target: position === undefined ? null : { position } } })).rejects.toBeInstanceOf(InvalidSeek);
  }
  await expect(streaming.control({ ...control, command: { entry, operation: "PLAY", expectedRevision: 0 } }))
    .rejects.toBeInstanceOf(StalePlayback);
  expect(await streaming._stream({ scope: "room" })).toEqual(original);
  expect(await streaming._controlsAfter({ stream, afterRevision: 0, throughRevision: 133 })).toEqual([]);
});

test("concurrent changes share one revision and notification history is bounded", async () => {
  const { stream, entry, revision } = await watchVideo();
  const other = new StreamingConcept(db.db, () => now);
  const control = { stream, viewer: "viewer" };
  const attempts = await Promise.allSettled([
    streaming.control({ ...control, command: { entry, expectedRevision: revision, operation: "SEEK", target: { position: 5 } } }),
    other.control({ ...control, command: { entry, expectedRevision: revision, operation: "SEEK", target: { position: 7 } } }),
  ]);
  expect(attempts.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
  const refusal = attempts.find((attempt) => attempt.status === "rejected");
  expect(refusal?.reason).toBeInstanceOf(StalePlayback);
  for (let expectedRevision = 3; expectedRevision < 133; expectedRevision++) {
    await streaming.control({ ...control, command: { entry, expectedRevision, operation: "SEEK", target: { position: expectedRevision } } });
  }
  const events = await streaming._controlsAfter({ stream, afterRevision: 0, throughRevision: 133 });
  expect(events).toHaveLength(128);
  expect(events[0]?.event.revision).toBe(6);
  expect(events.at(-1)?.event.revision).toBe(133);
});
