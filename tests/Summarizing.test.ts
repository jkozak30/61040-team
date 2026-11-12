import { afterAll, beforeAll, expect, test } from "bun:test";
import { EmptySource, SummarizingConcept, SummaryUnavailable } from "../src/concepts/Summarizing.ts";
import { lectureSummarizer } from "../src/lecture-summary.ts";
import { type VideoEntry } from "../src/concepts/Streaming.ts";
import { openTestDb, type TestDb } from "./test-db.ts";

let db: TestDb;
beforeAll(async () => { db = await openTestDb(); });
afterAll(async () => { await db?.close(); });

const document = { paragraphs: ["Question"] };
const documentGenerator = { format: "paragraphs-v1", isEmpty: (source: typeof document) => !source.paragraphs.length };
const lecture = {
  media: { provider: "youtube" as const, id: "M7lc1UVf-VE" },
  threads: [{ position: 12, messages: [{ text: "Question" }] }],
};

test("overlapping calls share generation and a late result cannot overwrite a newer summary", async () => {
  const olderResult = Promise.withResolvers<string>();
  const olderStarted = Promise.withResolvers<void>();
  let calls = 0;
  const concept = new SummarizingConcept<string, typeof document, string>(db.db, {
    ...documentGenerator,
    generate: async () => {
      calls++;
      if (calls !== 1) return "Newer";
      olderStarted.resolve();
      return olderResult.promise;
    },
  });
  const input = { topic: "lecture", sourceRevision: 1, source: document };
  const older = concept.summarize(input);
  const duplicate = concept.summarize(input);
  await olderStarted.promise;
  const newer = await concept.summarize({ ...input, sourceRevision: 2 });
  olderResult.resolve("Older");
  expect(await older).toEqual(newer);
  expect(await duplicate).toEqual(newer);
  expect(await concept.summarize(input)).toEqual(newer);
  expect(await concept._saved({ topic: input.topic })).toEqual(newer);
  expect(newer.summary).toMatchObject({ content: "Newer", sourceRevision: 2 });
  expect(calls).toBe(2);
});

test("failed generation preserves the previous summary and can be retried", async () => {
  let result = "First";
  const concept = new SummarizingConcept<string, typeof document, string>(db.db, {
    ...documentGenerator, generate: async () => {
      if (!result.trim()) throw new Error("Provider unavailable");
      return result;
    },
  });
  const input = { topic: "retry", sourceRevision: 1, source: document };
  expect(await concept._saved({ topic: input.topic })).toEqual({ summary: null });
  await expect(concept.summarize({ ...input, source: { paragraphs: [] } })).rejects.toBeInstanceOf(EmptySource);
  const first = await concept.summarize(input);
  result = " ";
  const refresh = { ...input, sourceRevision: 2 };
  await expect(concept.summarize(refresh)).rejects.toBeInstanceOf(SummaryUnavailable);
  expect(await concept._saved({ topic: input.topic })).toEqual(first);
  result = "Updated";
  expect((await concept.summarize(refresh)).summary).toMatchObject({ content: "Updated", sourceRevision: 2 });
});


test("a recap refresh reuses the lecture opener and supports empty takeaways", async () => {
  const topic = "lecture-refresh" as VideoEntry;
  let overviews = 0;
  const concept = new SummarizingConcept(db.db, lectureSummarizer(db.db, {
    overview: async () => { overviews++; return "Vision transformers."; },
    recap: async () => [],
  }));
  await concept.summarize({ topic, sourceRevision: 1, source: lecture });
  const refreshed = await concept.summarize({ topic, sourceRevision: 2, source: lecture });
  expect(refreshed.summary).toMatchObject({ content: { overview: "Vision transformers.", insights: [] }, sourceRevision: 2 });
  expect(overviews).toBe(1);
});
