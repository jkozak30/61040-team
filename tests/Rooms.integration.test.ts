import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { createGateway } from "@mit-sdg/sync-engine/boundary";
import { createHttpHandler } from "@mit-sdg/sync-engine-http/handler";
import { assembleApplication } from "../src/assembly.ts";
import { policy } from "../src/http.ts";
import { openTestDb, type TestDb } from "./test-db.ts";

const password = "a long test passphrase";
let db: TestDb;
let api: ReturnType<typeof createHttpHandler>;
beforeAll(async () => { db = await openTestDb(); });
beforeEach(async () => {
  await db.db.dropDatabase();
  const application = assembleApplication(db.db);
  api = createHttpHandler({ application, gateway: createGateway({ application }), policy });
});
afterAll(async () => { await db?.close(); });

function post(path: string, body: object = {}, cookie?: string) {
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

async function register(username: string) {
  return cookieFrom(await post("/auth/register", { username, password }));
}

async function createRoom() {
  const host = await register("host");
  const result = await post("/rooms/create", { name: "Host" }, host);
  expect(result.status).toBe(200);
  return await result.json() as { room: string; participant: string; code: string };
}

test("guest joins, signs in to save the visit, then reopens it with the new cookie", async () => {
  const { room, code } = await createRoom();
  const existing = await register("viewer");
  const guest = cookieFrom(await post("/auth/guest"));
  const joined = await post("/rooms/join", { code, name: "Viewer" }, guest);
  expect(joined.status).toBe(200);
  const { participant } = await joined.json();
  expect(await (await post("/rooms/history", {}, existing)).json()).toEqual({ rooms: [] });
  const claim = { participant, username: "viewer", password };
  expect((await post("/rooms/sign-in-and-claim", { ...claim, password: "incorrect passphrase" }, guest)).status)
    .toBe(403);
  expect(await (await post("/auth/me", {}, guest)).json()).toEqual({ kind: "guest" });

  const signedIn = await post("/rooms/sign-in-and-claim", claim, guest);
  const account = cookieFrom(signedIn);
  expect(account).not.toBe(guest);
  expect(await signedIn.json()).toEqual({ account: expect.any(String), room, participant });
  expect((await post("/auth/me", {}, guest)).status).toBe(401);
  expect(await (await post("/auth/me", {}, account)).json()).toMatchObject({ kind: "account", username: "viewer" });
  expect(await (await post("/rooms/reopen", { room }, account)).json()).toEqual({ room, participant, code });
  expect(await (await post("/rooms/history", {}, account)).json()).toEqual({
    rooms: [{ room, lastActivityAt: expect.any(String) }],
  });
});

test("only accounts can host and a guest can only register and claim its own visit", async () => {
  const { room, code } = await createRoom();
  const guest = cookieFrom(await post("/auth/guest"));
  const otherGuest = cookieFrom(await post("/auth/guest"));
  expect((await post("/rooms/create", { name: "Guest" }, guest)).status).toBe(403);
  expect((await post("/rooms/history", {}, guest)).status).toBe(403);
  expect((await post("/rooms/join", { code: "invalid", name: "Guest" }, guest)).status).toBe(404);
  const join = await post("/rooms/join", { code, name: "Guest" }, guest);
  const { participant } = await join.json();
  const claim = { participant, username: "new-viewer", password };
  expect((await post("/rooms/register-and-claim", claim, otherGuest)).status).toBe(403);
  const account = cookieFrom(await post("/rooms/register-and-claim", claim, guest));
  expect(await (await post("/rooms/reopen", { room }, account)).json()).toEqual({ room, participant, code });
  const outsider = await register("outsider");
  expect((await post("/rooms/reopen", { room }, outsider)).status).toBe(403);
  const joined = await post("/rooms/join", { code, name: "Outsider" }, outsider);
  expect(joined.status).toBe(200);
  expect((await post("/rooms/reopen", { room }, outsider)).status).toBe(200);
});

test("an invite requires a name only for a new participant", async () => {
  const { code } = await createRoom();
  const guest = cookieFrom(await post("/auth/guest"));
  expect((await post("/rooms/join", { code }, guest)).status).toBe(400);
  const first = await post("/rooms/join", { code, name: "Original" }, guest);
  expect(first.status).toBe(200);
  const reopened = await post("/rooms/join", { code }, guest);
  expect(reopened.status).toBe(200);
  expect(await reopened.json()).toEqual(await first.json());
});
