import type { VideoEnhancer } from "../src/video-enhancement.ts";
import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { createGateway } from "@mit-sdg/sync-engine/boundary";
import { createHttpHandler } from "@mit-sdg/sync-engine-http/handler";
import { assembleApplication } from "../src/assembly.ts";
import { policy } from "../src/http.ts";
import { openTestDb, type TestDb } from "./test-db.ts";

let db: TestDb;
let api: ReturnType<typeof createHttpHandler>;
let generate: (prompt: string) => Promise<string>;
let enhance: VideoEnhancer;
const password = "a long test passphrase";

beforeAll(async () => { db = await openTestDb(); });
beforeEach(async () => {
  await db.db.dropDatabase();
  generate = async (prompt) => {
    const thread = prompt.match(/"thread":"([^"]+)"/)?.[1];
    return `The group discussed pruning [${thread}].`;
  };
  enhance = async ({ source, items, overview }) => ({
    videoOverview: overview ?? { videoId: source.id, text: "Video about pruning.", generatedAt: new Date() },
    suggestedAnswers: [{ thread: String(items[0]!.thread), text: "The video explains the answer.", timestamps: [25] }], generatedAt: new Date(),
  });
  const application = assembleApplication(db.db, async () => "Lecture", (prompt) => generate(prompt), (input) => enhance(input));
  api = createHttpHandler({ application, gateway: createGateway({ application }), policy });
});
afterAll(async () => { await db?.close(); });

function post(path: string, body: object, cookie?: string) {
  const headers = new Headers({ "Content-Type": "application/json", Origin: policy.publicOrigin ?? "http://127.0.0.1:8080" });
  if (cookie) headers.set("Cookie", cookie);
  return api(new Request(`http://127.0.0.1:3000/api${path}`, { method: "POST", headers, body: JSON.stringify(body) }));
}

async function ok(path: string, body: object, cookie: string) {
  const response = await post(path, body, cookie);
  const value = await response.json();
  if (response.status !== 200) throw new Error(`${path}: ${response.status} ${JSON.stringify(value)}`);
  return value;
}

function cookie(response: Response) {
  expect(response.status).toBe(200);
  return response.headers.get("Set-Cookie")!.split(";")[0]!;
}

async function setup() {
  const hostCookie = cookie(await post("/auth/register", { username: "host", password }));
  const created = await ok("/rooms/create", { name: "Host" }, hostCookie);
  const guestCookie = cookie(await post("/auth/guest", {}));
  const joined = await ok("/rooms/join", { code: created.code, name: "Guest" }, guestCookie);
  const host = { room: created.room, participant: created.participant };
  const guest = { room: joined.room, participant: joined.participant };
  await ok("/watch/open", host, hostCookie);
  const first = await ok("/watch/add-video", { ...host, videoId: "M7lc1UVf-VE" }, hostCookie);
  const second = await ok("/watch/add-video", { ...host, videoId: "M7lc1UVf-VE" }, hostCookie);
  return { hostCookie, guestCookie, host, guest, first: first.entry as string, second: second.entry as string };
}

test("members revisit a thread on its saved video entry", async () => {
  const { hostCookie, guestCookie, host, guest, first, second } = await setup();
  const opening = await ok("/discussion/start-thread", {
    ...host, entry: first, anchor: 1122, text: " Why can these connections go? ", mode: "HISTORICAL",
  }, hostCookie);
  const reply = await ok("/discussion/reply", {
    ...guest, parent: opening.message, text: "Small weights contribute little.", mode: "HISTORICAL",
  }, guestCookie);
  const listed = await ok("/discussion/threads", { ...guest, entry: first }, guestCookie);
  expect(listed.threads).toMatchObject([{ thread: opening.thread, anchor: 1122, messages: [
    { message: opening.message, author: host.participant, name: "Host", text: "Why can these connections go?", context: "HISTORICAL" },
    { message: reply.message, parent: opening.message, author: guest.participant, name: "Guest", context: "HISTORICAL" },
  ] }]);
  expect((await ok("/discussion/thread", { ...guest, thread: opening.thread }, guestCookie)).messages).toEqual(listed.threads[0].messages);
  expect((await ok("/discussion/threads", { ...host, entry: second }, hostCookie)).threads).toEqual([]);
});

test("live posts require the selected video and the participant's player connection", async () => {
  const { hostCookie, guestCookie, host, guest, first, second } = await setup();
  const live = { ...guest, entry: first, anchor: 8, text: "Question", mode: "LIVE", connection: "guest-player" };
  expect((await post("/discussion/start-thread", live, guestCookie)).status).toBe(409);
  await ok("/watch/start", { ...host, entry: first }, hostCookie);
  expect((await post("/discussion/start-thread", live, guestCookie)).status).toBe(409);
  await ok("/watch/presence", { ...guest, connection: "guest-player" }, guestCookie);
  expect((await post("/discussion/start-thread", { ...live, connection: "other-player" }, guestCookie)).status).toBe(409);
  expect((await post("/discussion/start-thread", { ...live, entry: second }, guestCookie)).status).toBe(409);
  const opening = await ok("/discussion/start-thread", live, guestCookie);
  expect((await post("/discussion/reply", { ...host, parent: opening.message, text: "No", mode: "LIVE", connection: "guest-player" }, hostCookie)).status).toBe(409);
  await ok("/watch/presence", { ...host, connection: "host-player" }, hostCookie);
  await ok("/discussion/reply", { ...host, parent: opening.message, text: "Yes", mode: "LIVE", connection: "host-player" }, hostCookie);
  await ok("/watch/end", { ...host, connection: "host-player" }, hostCookie);
  expect((await post("/discussion/reply", { ...guest, parent: opening.message, text: "After", mode: "LIVE", connection: "guest-player" }, guestCookie)).status).toBe(409);
  await ok("/discussion/reply", { ...guest, parent: opening.message, text: "After", mode: "HISTORICAL" }, guestCookie);
});

test("room access and video ownership guard posts, thread links, and summaries", async () => {
  const { hostCookie, guestCookie, host, guest, first } = await setup();
  const outsider = cookie(await post("/auth/guest", {}));
  const opening = await ok("/discussion/start-thread", { ...host, entry: first, anchor: 1, text: "Question", mode: "HISTORICAL" }, hostCookie);
  for (const [path, body] of [
    ["/discussion/threads", { ...guest, entry: first }],
    ["/discussion/thread", { ...guest, thread: opening.thread }],
    ["/summary/read", { ...guest, entry: first }],
    ["/summary/request", { ...guest, entry: first }],
    ["/discussion/reply", { ...guest, parent: opening.message, text: "Reply", mode: "HISTORICAL" }],
    ["/discussion/edit-message", { ...guest, message: opening.message, text: "Changed" }],
    ["/discussion/delete-message", { ...guest, message: opening.message }],
  ] as const) expect((await post(path, body, outsider)).status).toBe(403);
  expect((await post("/discussion/start-thread", { ...guest, entry: "foreign", anchor: 1, text: "Question", mode: "HISTORICAL" }, guestCookie)).status).toBe(403);
  expect((await post("/discussion/threads", { ...guest, entry: "foreign" }, guestCookie)).status).toBe(403);
  expect((await post("/discussion/thread", { ...guest, thread: "missing" }, guestCookie)).status).toBe(404);
  expect((await post("/discussion/reply", { ...guest, parent: "missing", text: "Reply", mode: "HISTORICAL" }, guestCookie)).status).toBe(404);
  expect((await post("/discussion/start-thread", { ...guest, entry: first, anchor: -1, text: "Question", mode: "HISTORICAL" }, guestCookie)).status).toBe(400);
  expect((await post("/discussion/start-thread", { ...guest, entry: first, anchor: 1, text: "  ", mode: "HISTORICAL" }, guestCookie)).status).toBe(400);
});

test("overview cites original threads and failed regeneration preserves the previous one", async () => {
  const { hostCookie, guestCookie, host, guest, first, second } = await setup();
  const opening = await ok("/discussion/start-thread", { ...host, entry: first, anchor: 90, text: "Why prune?", mode: "HISTORICAL" }, hostCookie);
  await ok("/discussion/reply", { ...guest, parent: opening.message, text: "To simplify the model.", mode: "HISTORICAL" }, guestCookie);
  const result = await ok("/summary/request", { ...guest, entry: first }, guestCookie);
  expect(result.summary).toMatchObject({ text: `The group discussed pruning [${opening.thread}].`, referencedThreads: [opening.thread], generatedAt: expect.any(String) });
  expect((await ok("/summary/read", { ...host, entry: first }, hostCookie)).summary).toEqual(result.summary);
  expect((await ok("/summary/read", { ...host, entry: second }, hostCookie)).summary).toBeNull();
  generate = async () => "Unsupported claim [not-a-thread].";
  expect((await post("/summary/request", { ...host, entry: first }, hostCookie)).status).toBe(409);
  expect((await ok("/summary/read", { ...host, entry: first }, hostCookie)).summary).toEqual(result.summary);
});

test("only the author can edit or delete, and changes clear the old overview", async () => {
  const { hostCookie, guestCookie, host, guest, first } = await setup();
  const opened = await ok("/discussion/start-thread", { ...host, entry: first, anchor: 90, text: "Original question", mode: "HISTORICAL" }, hostCookie);
  const reply = await ok("/discussion/reply", { ...guest, parent: opened.message, text: "Answer", mode: "HISTORICAL" }, guestCookie);
  const saved = await ok("/summary/request", { ...host, entry: first }, hostCookie);
  await ok("/discussion/edit-message", { ...host, message: opened.message, text: " Original question " }, hostCookie);
  expect((await ok("/summary/read", { ...host, entry: first }, hostCookie)).summary).toEqual(saved.summary);
  const unchanged = await ok("/discussion/thread", { ...host, thread: opened.thread }, hostCookie);
  expect(unchanged.messages[0].editedAt).toBeUndefined();
  expect((await post("/discussion/edit-message", { ...guest, message: opened.message, text: "Taken over" }, guestCookie)).status).toBe(403);
  expect((await post("/discussion/delete-message", { ...host, message: reply.message }, hostCookie)).status).toBe(403);
  expect((await post("/discussion/edit-message", { ...host, message: opened.message, text: "  " }, hostCookie)).status).toBe(400);
  await ok("/discussion/edit-message", { ...host, message: opened.message, text: "  Revised question  " }, hostCookie);
  expect((await ok("/summary/read", { ...guest, entry: first }, guestCookie)).summary.stale).toBe(true);
  let thread = await ok("/discussion/thread", { ...guest, thread: opened.thread }, guestCookie);
  expect(thread.messages[0]).toMatchObject({ text: "Revised question", editedAt: expect.any(String) });
  expect(thread.messages[1]).toMatchObject({ message: reply.message, parent: opened.message, text: "Answer" });
  await ok("/summary/request", { ...guest, entry: first }, guestCookie);
  await ok("/discussion/delete-message", { ...host, message: opened.message }, hostCookie);
  expect((await ok("/summary/read", { ...host, entry: first }, hostCookie)).summary.stale).toBe(true);
  thread = await ok("/discussion/thread", { ...guest, thread: opened.thread }, guestCookie);
  expect(thread.messages[0]).toMatchObject({ text: "", deletedAt: expect.any(String) });
  expect(thread.messages[1]).toMatchObject({ message: reply.message, parent: opened.message, text: "Answer" });
  expect((await post("/discussion/edit-message", { ...host, message: opened.message, text: "Restore" }, hostCookie)).status).toBe(404);
  expect((await post("/discussion/delete-message", { ...host, message: opened.message }, hostCookie)).status).toBe(404);
});


test("new threads and replies hide recap and answers but retain video overview", async () => {
  const { hostCookie, guestCookie, host, guest, first } = await setup();
  const opened = await ok("/discussion/start-thread", { ...host, entry: first, anchor: 25, text: "Why prune?", mode: "HISTORICAL" }, hostCookie);
  const baseline = await ok("/summary/request", { ...host, entry: first }, hostCookie);
  let actualVideo = "";
  const original = enhance;
  enhance = async input => { actualVideo = input.source.id; return original(input); };
  const enhanced = await ok("/summary/enhance", { ...guest, entry: first, expectedBaseline: baseline.summary.baselineId }, guestCookie);
  expect(actualVideo).toBe("M7lc1UVf-VE");
  expect(enhanced.summary.text).toBe(baseline.summary.text);
  expect(enhanced.summary.enhancement.suggestedAnswers).toHaveLength(1);
  const outsider = cookie(await post("/auth/guest", {}));
  expect((await post("/summary/enhance", { ...guest, entry: first, expectedBaseline: baseline.summary.baselineId }, outsider)).status).toBe(403);
  await ok("/discussion/reply", { ...guest, parent: opened.message, text: "Another question", mode: "HISTORICAL" }, guestCookie);
  const stale = (await ok("/summary/read", { ...host, entry: first }, hostCookie)).summary;
  expect(stale.stale).toBe(true);
  expect(stale.text).toBeUndefined();
  expect(stale.enhancement).toBeUndefined();
  expect(stale.videoOverview).toEqual(enhanced.summary.videoOverview);
  expect(stale.enhanced).toBe(true);
  expect((await post("/summary/enhance", { ...host, entry: first, expectedBaseline: baseline.summary.baselineId }, hostCookie)).status).toBe(409);
  await ok("/summary/request", { ...host, entry: first }, hostCookie);
  await ok("/discussion/start-thread", { ...guest, entry: first, anchor: 50, text: "A new topic", mode: "HISTORICAL" }, guestCookie);
  expect((await ok("/summary/read", { ...host, entry: first }, hostCookie)).summary.stale).toBe(true);
});
