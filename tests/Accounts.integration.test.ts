import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { createGateway } from "@mit-sdg/sync-engine/boundary";
import { createHttpHandler } from "@mit-sdg/sync-engine-http/handler";
import { assembleApplication } from "../src/assembly.ts";
import { policy } from "../src/http.ts";
import { openTestDb, type TestDb } from "./test-db.ts";

const credentials = { username: "viewer", password: "a long test passphrase" };
let testDb: TestDb;
let api: ReturnType<typeof createHttpHandler>;

beforeAll(async () => {
  testDb = await openTestDb();
});

beforeEach(async () => {
  await testDb.db.dropDatabase();
  const application = assembleApplication(testDb.db);
  api = createHttpHandler({ application, gateway: createGateway({ application }), policy });
});

afterAll(async () => {
  await testDb?.close();
});

function post(path: string, body: object = {}, cookie?: string, origin = policy.publicOrigin ?? "http://127.0.0.1:8080") {
  const headers = new Headers({ "Content-Type": "application/json", Origin: origin });
  if (cookie) headers.set("Cookie", cookie);
  return api(new Request(`http://127.0.0.1:3000/api/auth/${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  }));
}

function issuedCookie(response: Response) {
  const header = response.headers.get("Set-Cookie");
  expect(header).toContain("HttpOnly");
  expect(header).toContain("Secure");
  expect(header).toContain("SameSite=Strict");
  return header!.split(";")[0]!;
}

test("a browser registers, resolves its identity, and signs out", async () => {
  const registered = await post("register", credentials);
  expect(registered.status).toBe(200);
  const cookie = issuedCookie(registered);
  const body = await registered.json();
  expect(body).toEqual({ account: expect.any(String) });

  const me = await post("me", {}, cookie);
  expect(await me.json()).toEqual({ kind: "account", account: body.account, username: "viewer" });

  const logout = await post("logout", {}, cookie);
  expect(logout.status).toBe(200);
  expect(logout.headers.get("Set-Cookie")).toContain("Max-Age=0");
  expect((await post("me", {}, cookie)).status).toBe(401);
});

test("failed sign-in preserves the guest and successful sign-in rotates the cookie", async () => {
  const registration = await post("register", credentials);
  expect(registration.status).toBe(200);
  const originalAccount = issuedCookie(registration);
  const guest = await post("guest");
  expect(guest.status).toBe(200);
  expect(await guest.json()).toEqual({});
  const guestCookie = issuedCookie(guest);
  expect(issuedCookie(await post("guest", {}, guestCookie))).toBe(guestCookie);

  const wrong = await post("login", { ...credentials, password: "an incorrect password" }, guestCookie);
  expect(wrong.status).toBe(403);
  expect(wrong.headers.has("Set-Cookie")).toBe(false);
  expect(await (await post("me", {}, guestCookie)).json()).toEqual({ kind: "guest" });

  const login = await post("login", credentials, guestCookie);
  expect(login.status).toBe(200);
  const accountCookie = issuedCookie(login);
  expect(accountCookie).not.toBe(guestCookie);
  expect((await post("me", {}, guestCookie)).status).toBe(401);
  expect((await post("me", {}, originalAccount)).status).toBe(200);
  expect(await (await post("me", {}, accountCookie)).json()).toEqual({
    kind: "account", account: expect.any(String), username: "viewer",
  });
});

test("registration replaces an existing guest session", async () => {
  const guestCookie = issuedCookie(await post("guest"));
  const registration = await post("register", credentials, guestCookie);
  expect(registration.status).toBe(200);
  const accountCookie = issuedCookie(registration);
  expect(accountCookie).not.toBe(guestCookie);
  expect((await post("me", {}, guestCookie)).status).toBe(401);
  expect((await post("me", {}, accountCookie)).status).toBe(200);
});

test("an origin mismatch or a token supplied in the request body cannot authenticate", async () => {
  const cookie = issuedCookie(await post("guest"));
  const token = cookie.slice(cookie.indexOf("=") + 1);
  expect((await post("me", { session: token })).status).toBe(401);
  expect((await post("logout", {}, cookie, "https://example.com")).status).toBe(403);
  expect((await post("me", {}, cookie)).status).toBe(200);
});
