import { type Collection, type Db, type Filter, MongoServerError } from "mongodb";

export class EmptySource extends Error {}
export class SummaryUnavailable extends Error {}

export type SummaryGenerator<Topic, Source, Content> = {
  format: string;
  isEmpty(source: Source): boolean;
  generate(topic: Topic, source: Source): Promise<Content>;
};

type Summary<Content> = { content: Content; sourceRevision: number; generatedAt: Date; format?: string };
type SummaryDocument<Topic, Content> = Summary<Content> & { _id: Topic };

export class SummarizingConcept<Topic extends string, Source, Content> {
  private readonly summaries: Collection<SummaryDocument<Topic, Content>>;
  private readonly inFlight = new Map<Topic, Map<number, Promise<Summary<Content>>>>();

  constructor(
    database: Db,
    private readonly generator: SummaryGenerator<Topic, Source, Content>,
    private readonly clock: () => Date = () => new Date(),
  ) {
    this.summaries = database.collection("summarizing.summaries");
  }

  async summarize({ topic, sourceRevision, source }: {
    topic: Topic; sourceRevision: number; source: Source;
  }): Promise<{ summary: Summary<Content> }> {
    if (!Number.isSafeInteger(sourceRevision) || sourceRevision < 1 || this.generator.isEmpty(source)) {
      throw new EmptySource("There is no source material to summarize.");
    }
    let pending = this.inFlight.get(topic);
    if (!pending) this.inFlight.set(topic, pending = new Map());
    const existing = pending.get(sourceRevision);
    if (existing) return { summary: await existing };

    const result = this.#summarize(topic, sourceRevision, source);
    pending.set(sourceRevision, result);
    try {
      return { summary: await result };
    } finally {
      pending.delete(sourceRevision);
      if (!pending.size) this.inFlight.delete(topic);
    }
  }

  async _saved({ topic }: { topic: Topic }): Promise<{ summary: Summary<Content> | null }> {
    const row = await this.summaries.findOne({ _id: topic });
    if (!row) return { summary: null };
    const { _id, ...summary } = row;
    return { summary };
  }

  async #summarize(topic: Topic, sourceRevision: number, source: Source): Promise<Summary<Content>> {
    const { summary } = await this._saved({ topic });
    const { format } = this.generator;
    if (summary && summary.sourceRevision >= sourceRevision &&
        (summary.sourceRevision > sourceRevision || summary.format === format)) return summary;

    let content: Content;
    try {
      content = await this.generator.generate(topic, source);
    } catch {
      throw new SummaryUnavailable("Could not generate a summary. Try again.");
    }

    const next = { content, format, sourceRevision, generatedAt: this.clock() };
    const uncovered: Filter<SummaryDocument<Topic, Content>> = { _id: topic, $or: [
      { sourceRevision: { $lt: sourceRevision } },
      { sourceRevision, format: { $ne: format } },
    ] };
    try {
      const updated = await this.summaries.updateOne(uncovered, { $set: next }, { upsert: true });
      if (updated.matchedCount || updated.upsertedCount) return next;
    } catch (error) {
      if (!(error instanceof MongoServerError && error.code === 11000)) throw error;
    }
    const updated = await this.summaries.updateOne(uncovered, { $set: next });
    if (updated.matchedCount) return next;
    const saved = (await this._saved({ topic })).summary;
    if (!saved) throw new Error("Summary disappeared after generation.");
    return saved;
  }
}
