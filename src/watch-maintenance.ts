import type { assembleApplication } from "./assembly.ts";

export async function maintainWatches({ Presence, Watching }: ReturnType<typeof assembleApplication>["concepts"]) {
  for (const { scope } of await Presence._due({})) {
    const { drained } = await Presence.expirePresence({ scope });
    if (!drained) continue;
    const [watch] = await Watching._stream({ scope });
    if (watch) await Watching.end({ stream: watch.stream });
    await Presence.close({ scope });
  }
}
