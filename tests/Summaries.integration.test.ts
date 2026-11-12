import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { createGateway } from "@mit-sdg/sync-engine/boundary";
import { createHttpHandler } from "@mit-sdg/sync-engine-http/handler";
import { assembleApplication } from "../src/assembly.ts";
import { policy } from "../src/http.ts";
import { openTestDb, type TestDb } from "./test-db.ts";

const password = "a long test passphrase";
const lectureA = "M7lc1UVf-VE";
let db: TestDb;
const generatedInputs: unknown[] = [];
const overviewInputs: string[] = [];
let providerUnavailable = false;
let waitForProvider: (() => Promise<void>) | undefined;
let api: ReturnType<typeof createHttpHandler>;
beforeAll(async () => { db = await openTestDb(); });
beforeEach(async () => {
  await db.db.dropDatabase();
  const application = assembleApplication(db.db, async () => undefined, {
    overview: async (media) => {
      overviewInputs.push(media.id);
      return "This lecture introduces vision transformers.";
    },
    recap: async (media, threads) => {
      expect(media.id).toBe(lectureA);
      generatedInputs.push(threads);
      await waitForProvider?.();
      if (providerUnavailable) throw new Error("Fake provider unavailable");
      return ["* **Discussion summary**"];
    },
  });
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



test("authorized viewers summarize a snapshot and can retry without losing the previous summary", async () => {
  const hostCookie = cookieFrom(await post("/auth/register", { username: "host", password }));
  const { room, participant, code } = await ok("/rooms/create", { name: "Host" }, hostCookie);
  const owner = { room, participant };
  const guestCookie = cookieFrom(await post("/auth/guest", {}));
  const guest = await ok("/rooms/join", { code, name: "Guest" }, guestCookie);
  await ok("/watch/open", owner, hostCookie);
  const { entry } = await ok("/watch/add-video", { ...owner, videoId: lectureA }, hostCookie);
  const input = { ...owner, entry };
  expect(await ok("/summaries/read", input, hostCookie)).toEqual({ summary: null, currentRevision: 0 });
  expect((await post("/summaries/summarize", input, guestCookie)).status).toBe(403);
  expect((await post("/summaries/summarize", input, hostCookie)).status).toBe(400);
  expect(generatedInputs).toHaveLength(0);

  const { message } = await ok("/discussion/start-thread", { ...guest, entry, position: 23.5, text: "Question" }, guestCookie);
  const started = Promise.withResolvers<void>();
  const finish = Promise.withResolvers<void>();
  waitForProvider = () => {
    started.resolve();
    return finish.promise;
  };
  await ok("/watch/start", input, hostCookie);
  const pending = ok("/summaries/summarize", input, hostCookie);
  await started.promise;
  try {
    expect((await ok("/watch/read", { ...owner, afterRevision: 0 }, hostCookie)).watch.snapshot.activeEntry).toBe(entry);
  } finally {
    waitForProvider = undefined;
    finish.resolve();
  }
  const first = await pending;
  expect(first.summary).toMatchObject({ content: { insights: ["Discussion summary"], overview: "This lecture introduces vision transformers." }, sourceRevision: 1 });
  expect(await ok("/summaries/summarize", input, hostCookie)).toEqual(first);
  expect(generatedInputs).toEqual([[{ position: 23.5, messages: [{ text: "Question" }] }]]);

  await ok("/watch/end", owner, hostCookie);
  await ok("/discussion/reply", { ...owner, parent: message, text: "Answer" }, hostCookie);
  const stale = { ...first, currentRevision: 2 };
  expect(await ok("/summaries/read", { ...guest, entry }, guestCookie)).toEqual(stale);
  providerUnavailable = true;
  expect((await post("/summaries/summarize", input, hostCookie)).status).toBe(500);
  expect(await ok("/summaries/read", input, hostCookie)).toEqual(stale);
  providerUnavailable = false;
  const refreshed = await ok("/summaries/summarize", { ...guest, entry }, guestCookie);
  expect(refreshed.summary.sourceRevision).toBe(2);
  expect(overviewInputs).toEqual([lectureA]);
  expect(generatedInputs.at(-1)).toEqual([{ position: 23.5, messages: [
    { text: "Question" }, { text: "Answer", replyTo: 0 },
  ] }]);
});
