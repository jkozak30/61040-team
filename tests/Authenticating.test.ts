import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import {
  type Account,
  AuthenticatingConcept,
  InvalidCredentials,
  InvalidPassword,
  InvalidUsername,
  UsernameTaken,
} from "../src/concepts/Authenticating.ts";
import { openTestDb, type TestDb } from "./test-db.ts";

const password = "a long test passphrase";
let testDb: TestDb;
let auth: AuthenticatingConcept;

beforeAll(async () => {
  testDb = await openTestDb();
});

beforeEach(async () => {
  await testDb.db.dropDatabase();
  auth = new AuthenticatingConcept(testDb.db);
});

afterAll(async () => {
  await testDb?.close();
});

test("registers, authenticates, and reads the normalized username across instances", async () => {
  const { account } = await auth.register({ username: "Viewer_A", password });
  const reader = new AuthenticatingConcept(testDb.db);
  expect(await reader.authenticate({ username: "VIEWER_a", password })).toEqual({ account });
  expect(await reader._username({ account })).toEqual([{ username: "viewer_a" }]);
  expect(await reader._username({ account: "unknown" as Account })).toEqual([]);
});

test("invalid registration leaves the username available", async () => {
  await expect(auth.register({ username: "viewer\n", password })).rejects.toBeInstanceOf(InvalidUsername);
  await expect(auth.register({ username: "viewer", password: "a".repeat(9) })).rejects.toBeInstanceOf(InvalidPassword);
  await expect(auth.register({ username: "viewer", password: "a".repeat(129) })).rejects.toBeInstanceOf(InvalidPassword);
  await auth.register({ username: "viewer", password });
  expect(await auth.authenticate({ username: "viewer", password })).toHaveProperty("account");
});

test("a duplicate username cannot replace the existing password", async () => {
  const username = "Viewer";
  const original = await auth.register({ username, password });
  const otherPassword = "a different passphrase";
  await expect(auth.register({ username: "VIEWER", password: otherPassword })).rejects.toBeInstanceOf(UsernameTaken);
  expect(await auth.authenticate({ username, password })).toEqual(original);
  for (const name of [username, "missing"]) {
    await expect(auth.authenticate({ username: name, password: otherPassword })).rejects.toBeInstanceOf(InvalidCredentials);
    await expect(auth.authenticate({ username: name, password: otherPassword })).rejects.toThrow(
      "The username or password is incorrect.",
    );
  }
});

test("concurrent registrations have one winner and store independently salted verifiers", async () => {
  const register = (username: string) => auth.register({ username, password });
  const outcomes = await Promise.allSettled([register("Viewer"), register("VIEWER")]);
  expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
  for (const outcome of outcomes) {
    if (outcome.status === "rejected") expect(outcome.reason).toBeInstanceOf(UsernameTaken);
  }
  await register("other-viewer");

  const rows = await testDb.db.collection("authenticating.accounts").find().toArray();
  expect(rows).toHaveLength(2);
  for (const row of rows) {
    expect(row).not.toHaveProperty("password");
    expect(row.verifier).toMatch(/^\$argon2id\$/);
    expect(row.verifier).not.toContain(password);
  }
  expect(rows[0]?.verifier).not.toBe(rows[1]?.verifier);
});
