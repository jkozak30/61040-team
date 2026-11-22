import { type Collection, type Db, type UpdateFilter } from "mongodb";

export class InvalidMessage extends Error {}
export class ThreadUnavailable extends Error {}
export type Thread = string & { readonly __brand: "Thread" };
export type Message = string & { readonly __brand: "Message" };
export type DiscussionContext = "LIVE" | "HISTORICAL";
export interface DiscussionMessage<Author extends string> {
  message: Message;
  parent: Message | null;
  author: Author;
  name: string;
  text: string;
  context: DiscussionContext;
  postedAt: Date;
  editedAt?: Date;
  deletedAt?: Date;
}
interface ThreadDocument<Topic extends string, Author extends string> {
  _id: Thread;
  topic: Topic;
  anchor: number;
  messages: DiscussionMessage<Author>[];
}

export class DiscussingConcept<Topic extends string = string, Author extends string = string> {
  private readonly threads: Collection<ThreadDocument<Topic, Author>>;
  constructor(db: Db, private readonly clock: () => Date = () => new Date()) {
    this.threads = db.collection("discussing.threads");
  }

  async startThread({ topic, author, name, anchor, text, context }: {
    topic: Topic; author: Author; name: string; anchor: number; text: string; context: DiscussionContext;
  }) {
    const clean = validate(text, name);
    if (!Number.isFinite(anchor) || anchor < 0) throw new InvalidMessage("Choose a valid video timestamp.");
    if (context !== "LIVE" && context !== "HISTORICAL") throw new InvalidMessage("Invalid discussion context.");
    const thread = crypto.randomUUID() as Thread;
    const message = crypto.randomUUID() as Message;
    await this.threads.insertOne({
      _id: thread, topic, anchor,
      messages: [{ message, parent: null, author, name: name.trim(), text: clean, context, postedAt: this.clock() }],
    });
    return { thread, message };
  }

  async reply({ parent, author, name, text, context }: {
    parent: Message; author: Author; name: string; text: string; context: DiscussionContext;
  }) {
    if (context !== "LIVE" && context !== "HISTORICAL") throw new InvalidMessage("Invalid discussion context.");
    const clean = validate(text, name);
    const thread = await this.threads.findOne({ "messages.message": parent });
    if (!thread) throw new ThreadUnavailable("This discussion is no longer available.");
    const parentMessage = thread.messages.find((message) => message.message === parent)!;
    const postedAt = new Date(Math.max(this.clock().getTime(), parentMessage.postedAt.getTime() + 1));
    const message = crypto.randomUUID() as Message;
    const newMessage: DiscussionMessage<Author> = {
      message, parent, author, name: name.trim(), text: clean, context, postedAt,
    };
    // MongoDB's generic $push type cannot infer a generic array element here.
    const update = { $push: { messages: newMessage } } as UpdateFilter<ThreadDocument<Topic, Author>>;
    const updated = await this.threads.findOneAndUpdate(
      { "messages.message": parent },
      update,
      { returnDocument: "after" },
    );
    if (!updated) throw new ThreadUnavailable("This discussion is no longer available.");
    return { message };
  }

  async editMessage({ message, author, text }: { message: Message; author: Author; text: string }) {
    const clean = validate(text);
    const changed = await this.threads.findOneAndUpdate(
      { messages: { $elemMatch: { message, author, deletedAt: { $exists: false } } } },
      { $set: { "messages.$.text": clean, "messages.$.editedAt": this.clock() } },
      { returnDocument: "after" },
    );
    if (!changed) throw new ThreadUnavailable("This comment is no longer available.");
    return { message, topic: changed.topic };
  }

  async deleteMessage({ message, author }: { message: Message; author: Author }) {
    const changed = await this.threads.findOneAndUpdate(
      { messages: { $elemMatch: { message, author, deletedAt: { $exists: false } } } },
      { $set: { "messages.$.text": "", "messages.$.deletedAt": this.clock() } },
      { returnDocument: "after" },
    );
    if (!changed) throw new ThreadUnavailable("This comment is no longer available.");
    return { message, topic: changed.topic };
  }

  async _message({ message }: { message: Message }) {
    const document = await this.threads.findOne({ "messages.message": message });
    return document ? [{ thread: document._id, topic: document.topic, anchor: document.anchor }] : [];
  }

  async _editableMessage({ message }: { message: Message }) {
    const document = await this.threads.findOne({ messages: { $elemMatch: { message, deletedAt: { $exists: false } } } });
    if (!document) return [];
    const found = document.messages.find((item) => item.message === message)!;
    return [{ thread: document._id, topic: document.topic, author: found.author }];
  }

  async _thread({ thread }: { thread: Thread }) {
    const doc = await this.threads.findOne({ _id: thread });
    return doc ? [{ topic: doc.topic, anchor: doc.anchor, messages: ordered(doc.messages) }] : [];
  }

  async _topicDiscussion({ topic }: { topic: Topic }) {
    const items = await this._topicThreads({ topic });
    return [{ items }];
  }

  async _topicThreads({ topic }: { topic: Topic }) {
    const docs = await this.threads.find({ topic }).toArray();
    return docs.sort((a, b) => a.anchor - b.anchor
      || +a.messages[0]!.postedAt - +b.messages[0]!.postedAt || a._id.localeCompare(b._id))
      .map((doc) => ({ thread: doc._id, anchor: doc.anchor, messages: ordered(doc.messages) }));
  }
}
function validate(text: string, name?: string) {
  if (typeof text !== "string" || (name !== undefined && typeof name !== "string")) throw new InvalidMessage("Write a comment of 1 to 2000 characters.");
  const cleaned = text.trim();
  if (!cleaned || cleaned.length > 2000 || (name !== undefined && (!name.trim() || name.trim().length > 32))) {
    throw new InvalidMessage("Write a comment of 1 to 2000 characters.");
  }
  return cleaned;
}
function ordered<Author extends string>(messages: DiscussionMessage<Author>[]) {
  return [...messages].sort((a, b) => +a.postedAt - +b.postedAt || a.message.localeCompare(b.message));
}
