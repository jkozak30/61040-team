import type { Db } from "mongodb";

export function createHealthHandler(db?: Db) {
  return async () => {
    const headers = { "Cache-Control": "no-store" };
    if (!db) return Response.json({ status: "ok", database: "not configured" }, { headers });

    try {
      await db.command({ ping: 1 }, { timeoutMS: 3000 });
      return Response.json({ status: "ok", database: "reachable" }, { headers });
    } catch {
      return Response.json({ status: "unavailable", database: "unreachable" }, { status: 503, headers });
    }
  };
}
