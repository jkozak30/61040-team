import { type Collection, type Db, type PushOperator, MongoServerError } from "mongodb";

export class InvalidThread extends Error {}
export class UnknownParent extends Error {}
export class EmptyReply extends Error {}

type Thread = string & { readonly __brand: "Thread" };
type Message = string & { readonly __brand: "Message" };
type Post<Author, Context> = { author: Author; name: string; text: string; context: Context };
type MessageRow<Author, Context> = Post<Author, Context> & {
  message: Message; thread: Thread; parent?: Message; postedAt: Date; revision: number;
};
type ThreadRow<Anchor> = { thread: Thread; anchor: Anchor };
type LegacyFields = Record<string, unknown>;
type DiscussionDocument<Topic, Author, Anchor, Context> = {
  _id: Topic;
  revision: number;
  threads: ({ thread: Thread; anchor?: Anchor } & LegacyFields)[];
  messages: (Omit<MessageRow<Author, Context>, "context"> & { context?: Context } & LegacyFields)[];
};

export class DiscussingConcept<Topic extends string, Author extends string, Anchor, Context> {
  private readonly discussions: Collection<DiscussionDocument<Topic, Author, Anchor, Context>>;

  constructor(
    database: Db,
    private readonly clock: () => Date = () => new Date(),
    private readonly legacy?: { anchor(row: LegacyFields): Anchor; context(row: LegacyFields): Context },
  ) {
    this.discussions = database.collection("discussing.discussions");
  }

  async startThread({ topic, anchor, ...post }: Post<Author, Context> & { topic: Topic; anchor: Anchor }) {
    post.text = post.text.trim();
    if (!post.text) throw new InvalidThread("Enter an opening message.");
    const thread = crypto.randomUUID() as Thread;
    const message = crypto.randomUUID() as Message;
    const postedAt = this.clock();
    for (let attempt = 0; attempt < 10; attempt++) {
      const revision = (await this.discussions.findOne({ _id: topic }, { projection: { revision: 1 } }))?.revision ?? 0;
      try {
        const result = await this.discussions.updateOne({ _id: topic, revision }, {
          $inc: { revision: 1 },
          $push: { threads: { thread, anchor }, messages: { ...post, message, thread, postedAt, revision: revision + 1 } } as PushOperator<DiscussionDocument<Topic, Author, Anchor, Context>>,
        }, { upsert: revision === 0 });
        if (result.matchedCount || result.upsertedCount) return { thread, message, revision: revision + 1 };
      } catch (error) {
        if (!(error instanceof MongoServerError && error.code === 11000)) throw error;
      }
    }
    throw new Error("Discussion changed repeatedly. Retry the request.");
  }

  async reply({ parent, ...post }: Post<Author, Context> & { parent: Message }) {
    const message = crypto.randomUUID() as Message;
    const postedAt = this.clock();
    post.text = post.text.trim();
    for (let attempt = 0; attempt < 10; attempt++) {
      const discussion = await this.discussions.findOne({ "messages.message": parent }, {
        projection: { revision: 1, "messages.$": 1 },
      });
      const thread = discussion?.messages[0]?.thread;
      if (!discussion || !thread) throw new UnknownParent("This message is unavailable.");
      if (!post.text) throw new EmptyReply("Enter a reply.");
      const revision = discussion.revision + 1;
      const result = await this.discussions.updateOne({ _id: discussion._id, revision: discussion.revision }, {
        $inc: { revision: 1 },
        $push: { messages: { ...post, parent, message, thread, postedAt, revision } } as PushOperator<DiscussionDocument<Topic, Author, Anchor, Context>>,
      });
      if (result.matchedCount) return { message, revision };
    }
    throw new Error("Discussion changed repeatedly. Retry the request.");
  }

  async _topic({ message }: { message: Message }): Promise<{ topic: Topic }[]> {
    const row = await this.discussions.findOne({ "messages.message": message }, { projection: { _id: 1 } });
    return row ? [{ topic: row._id }] : [];
  }

  async _discussion({ topic }: { topic: Topic }) {
    const row = await this.discussions.findOne({ _id: topic });
    return { discussion: {
      revision: row?.revision ?? 0,
      threads: row?.threads.map((thread): ThreadRow<Anchor> => ({
        thread: thread.thread,
        anchor: readStored(thread.anchor, this.legacy?.anchor, thread),
      })) ?? [],
      messages: row?.messages.map((row): MessageRow<Author, Context> => {
        const { author, name, text, message, thread, parent, postedAt, revision } = row;
        const context = readStored(row.context, this.legacy?.context, row);
        return { author, name, text, message, thread, ...(parent === undefined ? {} : { parent }), postedAt, revision, context };
      }) ?? [],
    } };
  }
}

function readStored<Value>(value: Value | undefined, decode: ((row: LegacyFields) => Value) | undefined, row: LegacyFields): Value {
  if (value !== undefined) return value;
  if (!decode) throw new Error("Stored discussion is missing an anchor or context.");
  return decode(row);
}
