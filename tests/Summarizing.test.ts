import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { SummarizingConcept, SummaryUnavailable, type SummaryItem } from "../src/concepts/Summarizing.ts";
import { openTestDb, type TestDb } from "./test-db.ts";
let db: TestDb;
beforeAll(async () => { db = await openTestDb(); });
beforeEach(async () => { await db.db.dropDatabase(); });
afterAll(async () => { await db?.close(); });
const items = [{ thread: "thread-1", anchor: 12, messages: [{ message: "msg-1", parent: null, author: "alice", name: "Alice", text: "Why?", context: "LIVE", postedAt: new Date() }] }] as unknown as SummaryItem[];
test("generates summary from existing discussion and saves references", async () => {
  let observedPrompt = "";
  const summaries = new SummarizingConcept(db.db, async (prompt) => { observedPrompt = prompt; return "Why? [thread-1]"; });
  const result = await summaries.request({ topic: "entry-1", items, expectedVersion: 0 });
  expect(result.summary.referencedThreads!.map(String)).toEqual(["thread-1"]);
  expect(observedPrompt).toContain("Why?");
  const other = new SummarizingConcept(db.db);
  expect((await other._summary({ topic: "entry-1", items }))[0]?.summary.text).toBe("Why? [thread-1]");
});
test("empty discussions and generator errors do not erase prior summary", async () => {
  const good = new SummarizingConcept(db.db, async () => "Saved summary [thread-1]");
  await good.request({ topic: "entry-1", items, expectedVersion: 0 });
  await expect(good.request({ topic: "entry-2", items: [], expectedVersion: 0 })).rejects.toBeInstanceOf(SummaryUnavailable);
  const bad = new SummarizingConcept(db.db, async () => { throw new Error("API failure"); });
  await expect(bad.request({ topic: "entry-1", items, expectedVersion: 0 })).rejects.toBeInstanceOf(SummaryUnavailable);
  expect((await bad._summary({ topic: "entry-1", items }))[0]?.summary.text).toBe("Saved summary [thread-1]");
});

test("only cited input threads are saved as references", async () => {
  const second = { ...items[0]!, thread: "thread-2" } as SummaryItem;
  const summaries = new SummarizingConcept(db.db, async () => "Review the first question [thread-1].");
  const saved = await summaries.request({ topic: "entry", items: [...items, second], expectedVersion: 0 });
  expect(saved.summary.referencedThreads!.map(String)).toEqual(["thread-1"]);
  const invalid = new SummarizingConcept(db.db, async () => "Unrelated claim [unknown-thread].");
  await expect(invalid.request({ topic: "entry", items, expectedVersion: 0 })).rejects.toBeInstanceOf(SummaryUnavailable);
  expect((await invalid._summary({ topic: "entry", items: [...items, second] }))[0]?.summary).toEqual(saved.summary);
});

test("deleted text is excluded and invalidating removes an older overview", async () => {
  let prompt = "";
  const summaries = new SummarizingConcept(db.db, async (value) => { prompt = value; return "Answer [thread-1]"; });
  await summaries.request({ topic: "entry", items, expectedVersion: 0 });
  await summaries.invalidate({ topic: "entry" });
  expect((await summaries._summary({ topic: "entry", items }))[0]?.summary.stale).toBe(true);
  const deleted = { ...items[0]!, messages: [{ ...items[0]!.messages[0]!, text: "", deletedAt: new Date() }] } as SummaryItem;
  await expect(summaries.request({ topic: "entry", items: [deleted], expectedVersion: 1 })).rejects.toBeInstanceOf(SummaryUnavailable);
  await summaries.request({ topic: "entry", items: [{ ...deleted, messages: [...deleted.messages, { ...deleted.messages[0]!, text: "Answer", deletedAt: undefined }] }], expectedVersion: 1 });
  expect(prompt).toContain("Answer");
  expect(prompt).not.toContain("Why?");
});

test("an in-flight overview cannot restore text after invalidation", async () => {
  let start!: () => void;
  let finish!: (text: string) => void;
  const started = new Promise<void>((resolve) => { start = resolve; });
  const generated = new Promise<string>((resolve) => { finish = resolve; });
  const summaries = new SummarizingConcept(db.db, async () => { start(); return generated; });
  const pending = summaries.request({ topic: "entry", items, expectedVersion: 0 });
  await started;
  await summaries.invalidate({ topic: "entry" });
  finish("Old text [thread-1]");
  await expect(pending).rejects.toBeInstanceOf(SummaryUnavailable);
  expect(await summaries._summary({ topic: "entry", items })).toEqual([]);
});

test("a version captured before a deletion rejects stale discussion items", async () => {
  let generated = false;
  const summaries = new SummarizingConcept(db.db, async () => { generated = true; return "Old text [thread-1]"; });
  const [{ version }] = await summaries._version({ topic: "entry" });
  await summaries.invalidate({ topic: "entry" });
  await expect(summaries.request({ topic: "entry", items, expectedVersion: version })).rejects.toBeInstanceOf(SummaryUnavailable);
  expect(generated).toBe(false);
  expect(await summaries._summary({ topic: "entry", items })).toEqual([]);
});

test("Gemini structured output preserves references even without inline citations", async () => {
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-only";
  let requestBody: any;
  globalThis.fetch = (async (_url: unknown, options: RequestInit) => {
    requestBody = JSON.parse(String(options.body));
    return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [
      { thought: true, text: "Internal thought, excluded" },
      { text: JSON.stringify({ text: "## Overview\nStudents asked why.", referencedThreads: ["thread-1"] }) },
    ] } }] });
  }) as typeof fetch;
  try {
    const summaries = new SummarizingConcept(db.db);
    const result = await summaries.request({ topic: "structured", items, expectedVersion: 0 });
    expect(result.summary.referencedThreads!.map(String)).toEqual(["thread-1"]);
    expect(result.summary.text).not.toContain("Internal thought");
    expect(requestBody.generationConfig.responseMimeType).toBe("application/json");
    expect(requestBody.generationConfig.responseSchema.properties.referencedThreads.items.enum).toEqual(["thread-1"]);
    globalThis.fetch = (async () => Response.json({ candidates: [{ finishReason: "MAX_TOKENS" }] })) as unknown as typeof fetch;
    await expect(summaries.request({ topic: "structured", items, expectedVersion: 0 })).rejects.toBeInstanceOf(SummaryUnavailable);
    expect((await summaries._summary({ topic: "structured", items }))[0]?.summary).toEqual(result.summary);
    globalThis.fetch = (async () => new Response(null, { status: 403 })) as unknown as typeof fetch;
    await expect(summaries.request({ topic: "structured", items, expectedVersion: 0 })).rejects.toThrow("Gemini HTTP 403");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  }
});

const source = { provider: "youtube" as const, id: "M7lc1UVf-VE" };
const videoResult = () => ({ videoOverview: { videoId: source.id, text: "A lecture about pruning.", generatedAt: new Date() },
  suggestedAnswers: [{ thread: "thread-1", text: "The lecturer explains why weights can be removed.", timestamps: [12, 35] }], generatedAt: new Date() });

test("enhancement preserves the baseline, caches video context, and hides all stale answers", async () => {
  let reused = false;
  const summaries = new SummarizingConcept(db.db, async () => "Original discussion [thread-1]", undefined,
    async ({ overview }) => { reused = !!overview; return videoResult(); });
  const baseline = (await summaries.request({ topic: "video", items, expectedVersion: 0 })).summary;
  const enhanced = (await summaries.enhance({ topic: "video", items, source, expectedBaseline: baseline.baselineId! })).summary;
  expect(enhanced.text).toBe(baseline.text);
  expect(enhanced.enhancement?.suggestedAnswers[0]?.timestamps).toEqual([12, 35]);
  expect(enhanced.enhanced).toBe(true);
  await summaries.invalidate({ topic: "video" });
  const stale = (await summaries._summary({ topic: "video", items }))[0]!.summary;
  expect(stale.stale).toBe(true);
  expect(stale.text).toBeUndefined();
  expect(stale.enhancement).toBeUndefined();
  expect(stale.videoOverview).toEqual(enhanced.videoOverview);
  expect(stale.enhanced).toBe(true);
  const next = (await summaries.request({ topic: "video", items, expectedVersion: 1 })).summary;
  expect(next.enhancement).toBeUndefined();
  expect(next.enhanced).toBe(true);
  await summaries.enhance({ topic: "video", items, source, expectedBaseline: next.baselineId! });
  expect(reused).toBe(true);
});

test("read fingerprint hides new posts even before the invalidation action runs", async () => {
  const summaries = new SummarizingConcept(db.db, async () => "Original [thread-1]");
  await summaries.request({ topic: "video", items, expectedVersion: 0 });
  const changed = [{ ...items[0]!, messages: [...items[0]!.messages, { ...items[0]!.messages[0]!, text: "A new reply" }] }];
  const result = (await summaries._summary({ topic: "video", items: changed }))[0]!.summary;
  expect(result.stale).toBe(true);
  expect(result.text).toBeUndefined();
});

test("late enhancement cannot attach to a regenerated baseline", async () => {
  let begin!: () => void;
  let complete!: (value: ReturnType<typeof videoResult>) => void;
  const started = new Promise<void>(resolve => { begin = resolve; });
  const pending = new Promise<ReturnType<typeof videoResult>>(resolve => { complete = resolve; });
  const summaries = new SummarizingConcept(db.db, async () => "Recap [thread-1]", undefined, async () => { begin(); return pending; });
  const original = (await summaries.request({ topic: "video", items, expectedVersion: 0 })).summary;
  const enhancement = summaries.enhance({ topic: "video", items, source, expectedBaseline: original.baselineId! });
  await started;
  const next = (await summaries.request({ topic: "video", items, expectedVersion: 0 })).summary;
  complete(videoResult());
  await expect(enhancement).rejects.toBeInstanceOf(SummaryUnavailable);
  expect((await summaries._summary({ topic: "video", items }))[0]!.summary).toEqual(next);
});

test("failed enhancement preserves baseline and invalid references are refused", async () => {
  const failing = new SummarizingConcept(db.db, async () => "Recap [thread-1]", undefined, async () => { throw new Error("private video"); });
  const baseline = (await failing.request({ topic: "video", items, expectedVersion: 0 })).summary;
  await expect(failing.enhance({ topic: "video", items, source, expectedBaseline: baseline.baselineId! })).rejects.toBeInstanceOf(SummaryUnavailable);
  expect((await failing._summary({ topic: "video", items }))[0]!.summary).toEqual(baseline);
  const invalid = new SummarizingConcept(db.db, undefined, undefined, async () => ({ ...videoResult(), suggestedAnswers: [{ thread: "other", text: "Unsupported", timestamps: [12] }] }));
  await expect(invalid.enhance({ topic: "video", items, source, expectedBaseline: baseline.baselineId! })).rejects.toBeInstanceOf(SummaryUnavailable);
  expect((await invalid._summary({ topic: "video", items }))[0]!.summary).toEqual(baseline);
});

test("later baseline generation wins even if an older request finishes last", async () => {
  let start!: () => void;
  let finish!: (text: string) => void;
  let calls = 0;
  const started = new Promise<void>(resolve => { start = resolve; });
  const pending = new Promise<string>(resolve => { finish = resolve; });
  const summaries = new SummarizingConcept(db.db, async () => {
    if (++calls === 1) { start(); return pending; }
    return "Newer [thread-1]";
  });
  const old = summaries.request({ topic: "video", items, expectedVersion: 0 });
  await started;
  const newer = await summaries.request({ topic: "video", items, expectedVersion: 0 });
  finish("Older [thread-1]");
  await expect(old).rejects.toBeInstanceOf(SummaryUnavailable);
  expect((await summaries._summary({ topic: "video", items }))[0]!.summary).toEqual(newer.summary);
});

test("discussion changes during video analysis cannot restore stale answers", async () => {
  let begin!: () => void;
  let complete!: (value: ReturnType<typeof videoResult>) => void;
  const started = new Promise<void>(resolve => { begin = resolve; });
  const pending = new Promise<ReturnType<typeof videoResult>>(resolve => { complete = resolve; });
  const summaries = new SummarizingConcept(db.db, async () => "Recap [thread-1]", undefined, async () => { begin(); return pending; });
  const baseline = (await summaries.request({ topic: "video", items, expectedVersion: 0 })).summary;
  const enhancement = summaries.enhance({ topic: "video", items, source, expectedBaseline: baseline.baselineId! });
  await started;
  await summaries.invalidate({ topic: "video" });
  complete(videoResult());
  await expect(enhancement).rejects.toBeInstanceOf(SummaryUnavailable);
  expect((await summaries._summary({ topic: "video", items }))[0]!.summary.enhancement).toBeUndefined();
});

test("one transient Gemini 503 is retried and grouped citations or math do not invalidate structured references", async () => {
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-only";
  let calls = 0;
  const second = { ...items[0]!, thread: "thread-2" } as SummaryItem;
  globalThis.fetch = (async () => {
    if (++calls === 1) return new Response(null, { status: 503 });
    return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify({
      text: "The group discussed [thread-1,thread-2] and the interval [0,1].", referencedThreads: ["thread-1", "thread-2"],
    }) }] } }] });
  }) as unknown as typeof fetch;
  try {
    const summaries = new SummarizingConcept(db.db);
    const saved = (await summaries.request({ topic: "retry", items: [...items, second], expectedVersion: 0 })).summary;
    expect(calls).toBe(2);
    expect(saved.referencedThreads?.map(String)).toEqual(["thread-1", "thread-2"]);
    expect(saved.text).toContain("[thread-1] [thread-2]");
    expect(saved.text).toContain("[0,1]");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  }
});

test("persistent Gemini 503 stops after one retry and preserves the last good recap", async () => {
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-only";
  let calls = 0;
  globalThis.fetch = (async () => { calls++; return new Response(null, { status: 503 }); }) as unknown as typeof fetch;
  try {
    const good = new SummarizingConcept(db.db, async () => "Existing recap [thread-1]");
    const saved = (await good.request({ topic: "outage", items, expectedVersion: 0 })).summary;
    const service = new SummarizingConcept(db.db);
    await expect(service.request({ topic: "outage", items, expectedVersion: 0 })).rejects.toThrow("Gemini HTTP 503");
    expect(calls).toBe(2);
    expect((await service._summary({ topic: "outage", items }))[0]?.summary).toEqual(saved);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  }
});

test("older verification formats expose Enhance again without discarding discussion or video overview", async () => {
  const summaries = new SummarizingConcept(db.db, async () => "Current recap [thread-1]", undefined, async () => videoResult());
  const baseline = (await summaries.request({ topic: "upgrade", items, expectedVersion: 0 })).summary;
  const enhanced = (await summaries.enhance({ topic: "upgrade", items, source, expectedBaseline: baseline.baselineId! })).summary;
  expect(enhanced.enhancement?.format).toBe("single-pass-questions-v1");
  await db.db.collection("summarizing.summaries").updateOne({ _id: "upgrade" as any }, { $unset: { "result.enhancement.format": "" } });
  const upgraded = (await summaries._summary({ topic: "upgrade", items }))[0]!.summary;
  expect(upgraded.stale).toBe(false);
  expect(upgraded.text).toBe(baseline.text);
  expect(upgraded.videoOverview).toEqual(enhanced.videoOverview);
  expect(upgraded.enhancement).toBeUndefined();
});

test("an older recap prompt enables regeneration while preserving cached video context", async () => {
  const summaries = new SummarizingConcept(db.db, async () => "Recap [thread-1]", undefined, async () => videoResult());
  const baseline = (await summaries.request({ topic: "prompt-upgrade", items, expectedVersion: 0 })).summary;
  const enhanced = (await summaries.enhance({ topic: "prompt-upgrade", items, source, expectedBaseline: baseline.baselineId! })).summary;
  await db.db.collection<{ _id: string }>("summarizing.summaries").updateOne({ _id: "prompt-upgrade" }, { $unset: { "result.format": "" } });
  const stale = (await summaries._summary({ topic: "prompt-upgrade", items }))[0]!.summary;
  expect(stale.stale).toBe(true);
  expect(stale.staleReason).toBe("format");
  await expect(summaries.enhance({ topic: "prompt-upgrade", items, source, expectedBaseline: baseline.baselineId! })).rejects.toBeInstanceOf(SummaryUnavailable);
  expect(stale.text).toBeUndefined();
  expect(stale.videoOverview).toEqual(enhanced.videoOverview);
  const regenerated = (await summaries.request({ topic: "prompt-upgrade", items, expectedVersion: 0 })).summary;
  expect(regenerated.stale).toBe(false);
  expect(regenerated.format).toBe("topic-bullets-v1");
});
