import { expect, test } from "bun:test";
import { createHealthHandler } from "../src/health.ts";

test("the scaffold reports healthy with no database configured", async () => {
  const response = await createHealthHandler()();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: "ok", database: "not configured" });
});
