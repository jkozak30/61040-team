import type { assembleApplication } from "./assembly.ts";

export async function maintainWatches({ Sessioning, Streaming }: ReturnType<typeof assembleApplication>["concepts"]) {
  for (const { scope } of await Sessioning._due({})) {
    const { drained } = await Sessioning.expirePresence({ scope });
    if (!drained) continue;
    const [watch] = await Streaming._stream({ scope });
    if (watch) await Streaming.end({ stream: watch.stream });
    await Sessioning.close({ scope });
  }
}
