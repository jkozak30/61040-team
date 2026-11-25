import { expect, test } from "bun:test";
import { enhanceVideo } from "../src/video-enhancement.ts";
import type { SummaryItem } from "../src/concepts/Summarizing.ts";
const source = { provider: "youtube" as const, id: "M7lc1UVf-VE" };
const message = (id: string, text: string) => ({ message: id, parent: null, author: "a", name: "Alice", text, context: "LIVE", postedAt: new Date() });
const items = [
  { thread: "thread-one", anchor: 44, messages: [message("reaction", "Right here is a good part"), message("inspiration", "Who inspired the artist?")] },
  { thread: "thread-two", anchor: 157, messages: [message("words", "What are the lyrics saying right there?"), { ...message("deleted", "REMOVED SECRET"), deletedAt: new Date() }] },
  { thread: "thread-three", anchor: 50, messages: [message("count", "How many people are on the cover?")] },
] as unknown as SummaryItem[];
const response = (value: unknown) => Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [
  { thought: true, text: "not an answer" }, { text: JSON.stringify(value) },
] } }] });
async function mocked(fetcher: typeof fetch, run: () => Promise<void>) {
  const previous = globalThis.fetch; const key = process.env.GEMINI_API_KEY;
  globalThis.fetch = fetcher; process.env.GEMINI_API_KEY = "test-only";
  try { await run(); }
  finally { globalThis.fetch = previous; if (key === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = key; }
}

test("one whole-video call preserves the overview and maps answers to exact questions", async () => {
  let calls = 0; let body: any;
  const overview = { videoId: source.id, text: "Cached whole-video overview.", generatedAt: new Date() };
  await mocked((async (_url: unknown, options: RequestInit) => {
    calls++; body = JSON.parse(String(options.body));
    return response({ videoOverview: "Should not replace the cached overview", suggestedAnswers: [
      { questionMessage: "inspiration", evidenceKind: "explicit_statement", text: "The artist explicitly names an influence.", timestamps: [44] },
      { questionMessage: "words", evidenceKind: "audible_words", text: "The audible local phrase is clear.", timestamps: [157] },
    ] });
  }) as typeof fetch, async () => {
    const result = await enhanceVideo({ source, items, baseline: "Discussion recap", overview });
    expect(calls).toBe(1);
    expect(body.contents[0].parts[0]).toEqual({ fileData: { fileUri: "https://www.youtube.com/watch?v=M7lc1UVf-VE" }, videoMetadata: { fps: 0.2 } });
    expect(JSON.stringify(body)).not.toContain("REMOVED SECRET");
    expect(body.generationConfig.responseSchema.properties.suggestedAnswers.items.properties.questionMessage.enum).toEqual(["inspiration", "words", "count"]);
    expect(result.videoOverview).toEqual(overview);
    expect(result.suggestedAnswers.map(answer => answer.thread)).toEqual(["thread-one", "thread-two"]);
    expect(result.format).toBe("single-pass-questions-v1");
  });
});

test("transcription cannot answer inspiration, counts or non-question reactions", async () => {
  await mocked((async () => response({ videoOverview: "Overview.", suggestedAnswers: [
    { questionMessage: "inspiration", evidenceKind: "audible_words", text: "An unrelated lyric", timestamps: [44] },
    { questionMessage: "count", evidenceKind: "audible_words", text: "Another lyric", timestamps: [50] },
    { questionMessage: "reaction", evidenceKind: "explanation", text: "Invented question answer", timestamps: [44] },
    { questionMessage: "unknown", evidenceKind: "explanation", text: "Unknown question", timestamps: [44] },
  ] })) as unknown as typeof fetch, async () => {
    expect((await enhanceVideo({ source, items, baseline: "Recap" })).suggestedAnswers).toEqual([]);
  });
});

test("wording timestamps cannot cite a different part of the video", async () => {
  await mocked((async () => response({ videoOverview: "Overview.", suggestedAnswers: [
    { questionMessage: "words", evidenceKind: "audible_words", text: "A different verse", timestamps: [20] },
    { questionMessage: "count", evidenceKind: "visual_count", text: "The visible count is established.", timestamps: [50] },
  ] })) as unknown as typeof fetch, async () => {
    expect((await enhanceVideo({ source, items, baseline: "Recap" })).suggestedAnswers).toEqual([
      { thread: "thread-three", text: "The visible count is established.", timestamps: [50] },
    ]);
  });
});

test("uncached overview still uses the whole video without any clip pass", async () => {
  let calls = 0;
  await mocked((async (_url: unknown, options: RequestInit) => {
    calls++; const body = JSON.parse(String(options.body));
    expect(body.contents[0].parts[0].videoMetadata).toEqual({ fps: 0.2 });
    expect(body.contents[0].parts[1].text).toContain("covering its main ideas (under 150 words), not only its introduction");
    return response({ videoOverview: "Overview of the overall video.", suggestedAnswers: [] });
  }) as typeof fetch, async () => {
    const result = await enhanceVideo({ source, items, baseline: "Recap" });
    expect(calls).toBe(1);
    expect(result.videoOverview.text).toBe("Overview of the overall video.");
  });
});

test("a transient 503 has one bounded retry, not a chain of clip requests", async () => {
  let calls = 0;
  await mocked((async () => ++calls === 1 ? new Response(null, { status: 503 }) : response({ videoOverview: "Overview", suggestedAnswers: [] })) as unknown as typeof fetch,
    async () => { await enhanceVideo({ source, items, baseline: "Recap" }); expect(calls).toBe(2); });
});

test("failed or incomplete results do not produce answers", async () => {
  await mocked((async () => Response.json({ candidates: [{ finishReason: "MAX_TOKENS" }] })) as unknown as typeof fetch,
    async () => { await expect(enhanceVideo({ source, items, baseline: "Recap" })).rejects.toThrow("Incomplete"); });
  let calls = 0;
  await mocked((async () => { calls++; return new Response(null, { status: 403 }); }) as unknown as typeof fetch,
    async () => { await expect(enhanceVideo({ source, items, baseline: "Recap" })).rejects.toThrow("rejected"); expect(calls).toBe(1); });
});
