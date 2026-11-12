import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { createGateway } from "@mit-sdg/sync-engine/boundary";
import { createHttpHandler } from "@mit-sdg/sync-engine-http/handler";
import { assembleApplication } from "../src/assembly.ts";
import { policy } from "../src/http.ts";
import { openTestDb, type TestDb } from "./test-db.ts";

const password = "a long test passphrase";
const lectureA = "M7lc1UVf-VE";
const lectureB = "aqz-KE-bpKQ";
let db: TestDb;
let api: ReturnType<typeof createHttpHandler>;
beforeAll(async () => { db = await openTestDb(); });
beforeEach(async () => {
  await db.db.dropDatabase();
  const application = assembleApplication(db.db, async () => undefined);
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


test("local and live tabs share discussion and only the current live connection labels posts live", async () => {
  const hostCookie = cookieFrom(await post("/auth/register", { username: "host", password }));
  const host = await ok("/rooms/create", { name: "Host" }, hostCookie);
  const guestCookie = cookieFrom(await post("/auth/guest", {}));
  const guest = await ok("/rooms/join", { code: host.code, name: "Guest" }, guestCookie);
  const owner = { room: host.room, participant: host.participant };
  await ok("/watch/open", owner, hostCookie);
  const { entry } = await ok("/watch/add-video", { ...owner, videoId: lectureA }, hostCookie);
  await ok("/watch/start", { ...owner, entry }, hostCookie);
  await ok("/watch/presence", { ...guest, connection: "live-tab" }, guestCookie);
  expect((await post("/discussion/start-thread", {
    ...guest, entry, position: -1, text: "Invalid anchor",
  }, guestCookie)).status).toBe(400);
  const opening = await ok("/discussion/start-thread", { ...guest, connection: "live-tab", entry, position: 23.5, text: "Question" }, guestCookie);
  expect(opening).toMatchObject({ context: "LIVE", revision: 1 });
  // Convert the opening post to the previous storage shape before replying.
  await db.db.collection("discussing.discussions").updateOne({ _id: entry }, {
    $set: { "threads.0.position": 23.5, "messages.0.live": true },
    $unset: { "threads.0.anchor": "", "messages.0.context": "" },
  });
  expect((await post("/discussion/read", { ...owner, entry }, guestCookie)).status).toBe(403);
  expect((await post("/discussion/reply", { ...owner, parent: opening.message, text: "Forged", live: false }, hostCookie)).status).toBe(400);

  const local = await ok("/discussion/reply", { ...guest, parent: opening.message, text: "Local answer" }, guestCookie);
  expect(local).toMatchObject({ context: "HISTORICAL", revision: 2 });
  expect((await post("/discussion/reply", { ...guest, parent: opening.message, connection: "local-tab", text: "Stale" }, guestCookie)).status).toBe(409);
  const next = await ok("/watch/add-video", { ...owner, videoId: lectureB }, hostCookie);
  await ok("/watch/switch-video", { ...owner, entry: next.entry }, hostCookie);
  expect((await post("/discussion/start-thread", { ...guest, connection: "live-tab", entry, position: 25, text: "Stale" }, guestCookie)).status).toBe(409);
  expect((await post("/discussion/reply", { ...guest, connection: "live-tab", parent: opening.message, text: "Stale" }, guestCookie)).status).toBe(409);
  expect(await ok("/discussion/read", { ...guest, entry: next.entry }, guestCookie)).toEqual({
    discussion: { revision: 0, threads: [], messages: [] },
  });

  await ok("/watch/end", owner, hostCookie);
  const reply = await ok("/discussion/reply", { ...owner, parent: opening.message, text: "Answer" }, hostCookie);
  expect(reply).toMatchObject({ context: "HISTORICAL", revision: 3 });
  const response = await ok("/discussion/read", { ...guest, entry }, guestCookie);
  expect(response.discussion).toMatchObject({
    revision: 3,
    threads: [{ thread: opening.thread, anchor: 23.5 }],
    messages: [
      { message: opening.message, text: "Question", name: "Guest", context: "LIVE" },
      { message: local.message, parent: opening.message, text: "Local answer", name: "Guest", context: "HISTORICAL" },
      { message: reply.message, parent: opening.message, text: "Answer", name: "Host", context: "HISTORICAL" },
    ],
  });
});

test("signing into an existing room membership preserves earlier guest attribution", async () => {
  const hostCookie = cookieFrom(await post("/auth/register", { username: "host", password }));
  const { room, participant, code } = await ok("/rooms/create", { name: "Host" }, hostCookie);
  const owner = { room, participant };
  const accountCookie = cookieFrom(await post("/auth/register", { username: "member", password }));
  const account = await ok("/rooms/join", { code, name: "Original Name" }, accountCookie);
  const guestCookie = cookieFrom(await post("/auth/guest", {}));
  const guest = await ok("/rooms/join", { code, name: "Guest Name" }, guestCookie);
  await ok("/watch/open", owner, hostCookie);
  const { entry } = await ok("/watch/add-video", { ...owner, videoId: lectureA }, hostCookie);
  const opening = await ok("/discussion/start-thread", { ...guest, entry, position: 10, text: "Guest question" }, guestCookie);

  const signIn = await post("/rooms/sign-in-and-claim", {
    participant: guest.participant, username: "member", password,
  }, guestCookie);
  const claimedCookie = cookieFrom(signIn);
  expect(await signIn.json()).toMatchObject(account);
  expect(await ok("/rooms/join", { code, name: "Different Name" }, claimedCookie)).toEqual(account);
  await ok("/discussion/reply", { ...account, parent: opening.message, text: "Account reply" }, claimedCookie);

  const { discussion } = await ok("/discussion/read", { ...account, entry }, claimedCookie);
  expect(discussion.messages).toMatchObject([
    { author: guest.participant, name: "Guest Name", text: "Guest question" },
    { author: account.participant, name: "Original Name", text: "Account reply" },
  ]);
});
