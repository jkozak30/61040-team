import { type Collection, type Db } from "mongodb";

export class NoDiscussion extends Error {}

export interface SummaryItem<Item> {
  item: Item;
  text: string;
}

export interface SummaryRecord<Item> {
  content: string;
  referencedItems: Item[];
  generatedAt: Date;
}

interface SummaryDocument<Topic, Item> extends SummaryRecord<Item> {
  _id: Topic;
}

export type GenerateSummary<Item> = (items: SummaryItem<Item>[]) => Promise<{
  content: string;
  referencedItems: Item[];
}>;

export class SummarizingConcept<Topic extends string = string, Item extends string = string> {
  private readonly summaries: Collection<SummaryDocument<Topic, Item>>;

  constructor(database: Db, private readonly generate: GenerateSummary<Item>,
    private readonly clock: () => Date = () => new Date()) {
    this.summaries = database.collection("summarizing.summaries");
  }

  async summarize({ topic, items }: { topic: Topic; items: SummaryItem<Item>[] }) {
    if (items.length === 0) throw new NoDiscussion("There is no discussion to summarize yet.");
    try {
      const generated = await this.generate(items);
      const allowed = new Set(items.map(({ item }) => item));
      if (!generated.content.trim() || !Array.isArray(generated.referencedItems)
        || generated.referencedItems.some((item) => !allowed.has(item))) return { failed: true };
      await this.summaries.updateOne({ _id: topic }, {
        $set: {
          content: generated.content.trim(),
          referencedItems: [...new Set(generated.referencedItems)],
          generatedAt: this.clock(),
        },
      }, { upsert: true });
      return { failed: false };
    } catch {
      return { failed: true };
    }
  }

  async _summary({ topic }: { topic: Topic }): Promise<{ summary: SummaryRecord<Item> }[]> {
    const found = await this.summaries.findOne({ _id: topic });
    return found ? [{ summary: {
      content: found.content, referencedItems: found.referencedItems, generatedAt: found.generatedAt,
    } }] : [];
  }
}
