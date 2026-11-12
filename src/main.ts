import { createGateway } from "@mit-sdg/sync-engine/boundary";
import { createHttpHandler } from "@mit-sdg/sync-engine-http/handler";

import { assembleApplication } from "./assembly.ts";
import { openMongoClient } from "./db.ts";
import { createHealthHandler } from "./health.ts";
import { policy } from "./http.ts";
import { maintainWatches } from "./watch-maintenance.ts";

const mongoUrl = process.env.MONGODB_URL;
if (!mongoUrl) throw new Error("Set MONGODB_URL in .env before starting WatchParty.");
const client = openMongoClient(mongoUrl);
const db = client.db();
const application = assembleApplication(db);
const gateway = createGateway({ application });
const api = createHttpHandler({ application, gateway, policy });

const server = Bun.serve({
  hostname: process.env.HOST ?? "127.0.0.1",
  port: Number(process.env.PORT ?? 3000),
  routes: {
    "/api/*": api,
    "/health": createHealthHandler(db),
  },
  fetch() {
    return new Response("Not found", { status: 404 });
  },
});

console.log(`WatchParty backend listening on ${server.url}`);

let sweeping = false;
setInterval(async () => {
  if (sweeping) return;
  sweeping = true;
  try {
    await maintainWatches(application.concepts);
  } catch {
    console.error("Could not maintain live watches. Will retry.");
  } finally {
    sweeping = false;
  }
}, 5000).unref();
