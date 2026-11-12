import { type Db, MongoServerError } from "mongodb";
import type { SummaryGenerator } from "./concepts/Summarizing.ts";
import type { VideoEntry } from "./concepts/Streaming.ts";
import type { MediaSource } from "./media-source.ts";

export type SummaryThreads = { position: number; messages: { text: string; replyTo?: number }[] }[];
export type LectureSource = { media: MediaSource; threads: SummaryThreads };
export type LectureSummary = { overview?: string; insights: string[] };
export type LectureGenerator = {
  overview(media: MediaSource): Promise<string>;
  recap(media: MediaSource, threads: SummaryThreads): Promise<string[]>;
};

export const LECTURE_RECAP_FORMAT = "lecture-insights-v5";

export function plainInsight(text: string) {
  return text.trim().replace(/^(?:[-*•]|\d+[.)]|#{1,6})\s+/, "")
    .replace(/\*\*([^*]+)\*\*|__([^_]+)__|`([^`]+)`/g, (_match, bold, underline, code) => bold ?? underline ?? code)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .trim();
}

export function lectureSummarizer(database: Db, generator: LectureGenerator): SummaryGenerator<VideoEntry, LectureSource, LectureSummary> {
  const overviews = database.collection<{ _id: VideoEntry; text: string }>("summarizing.overviews");
  const pending = new Map<VideoEntry, Promise<string>>();

  async function loadOverview(entry: VideoEntry, media: MediaSource) {
    const existing = await overviews.findOne({ _id: entry });
    if (existing) return existing.text;
    const text = (await generator.overview(media)).trim();
    if (!text) throw new Error("The provider returned an empty lecture overview.");
    try {
      const saved = await overviews.findOneAndUpdate(
        { _id: entry }, { $setOnInsert: { text } }, { upsert: true, returnDocument: "after" },
      );
      if (saved) return saved.text;
    } catch (error) {
      if (!(error instanceof MongoServerError && error.code === 11000)) throw error;
    }
    const saved = await overviews.findOne({ _id: entry });
    if (!saved) throw new Error("Lecture overview disappeared after generation.");
    return saved.text;
  }

  async function overview(entry: VideoEntry, media: MediaSource) {
    const existing = pending.get(entry);
    if (existing) return existing;
    const result = loadOverview(entry, media);
    pending.set(entry, result);
    try {
      return await result;
    } finally {
      pending.delete(entry);
    }
  }

  function visibleOverview(text: unknown) {
    if (typeof text !== "string" || /^(unknown|the (lecture )?topic is unclear)[.!]?$/i.test(text.trim())) return {};
    const cleaned = plainInsight(text);
    return cleaned ? { overview: cleaned } : {};
  }

  return {
    format: LECTURE_RECAP_FORMAT,
    isEmpty: ({ threads }) => !threads.some(({ messages }) => messages.length),
    async generate(entry, { media, threads }) {
      const opener = await overview(entry, media);
      const insights = (await generator.recap(media, threads)).map(plainInsight).filter(Boolean);
      return { ...visibleOverview(opener), insights };
    },
  };
}
