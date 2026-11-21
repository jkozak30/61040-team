import { type Collection, type Db, type Filter } from "mongodb";

export class InvalidAnchor extends Error {}
export class InvalidMessage extends Error {}
export class ThreadUnavailable extends Error {}

export type Thread = string & { readonly __brand: "Thread" };
export type Message = string & { readonly __brand: "Message" };

export interface PostedMessage<Author, Context> {
  message: Message;
  parent?: Message;
  author: Author;
  name: string;
  text: string;
  context: Context;
  postedAt: Date;
}

interface ThreadDocument<Topic, Author, Context> {
  _id: Thread;
  topic: Topic;
  anchor: number;
  version: number;
  messages: PostedMessage<Author, Context>[];
}

const MAX_TEXT_LENGTH = 2000;

export class DiscussingConcept<
  Topic extends string = string,
  Author extends string = string,
  Context extends string = string,
> {
  private readonly threads: Collection<ThreadDocument<Topic, Author, Context>>;

  constructor(database: Db, private readonly clock: () => Date = () => new Date()) {
    this.threads = database.collection("discussing.threads");
  }

  async startThread({ topic, author, name, anchor, text, context }: {
    topic: Topic; author: Author; name: string; anchor: number; text: string; context: Context;
  }) {
    if (!Number.isFinite(anchor) || anchor < 0) throw new InvalidAnchor("Choose a valid video position.");
    const clean = validateMessage(name, text, "comment");
    const thread = crypto.randomUUID() as Thread;
    const message = crypto.randomUUID() as Message;
    await this.threads.insertOne({
      _id: thread, topic, anchor, version: 0,
      messages: [{ message, author, name: clean.name, text: clean.text, context, postedAt: this.clock() }],
    });
    return { thread, message };
  }

  async reply({ parent, author, name, text, context }: {
    parent: Message; author: Author; name: string; text: string; context: Context;
  }) {
    const message = crypto.randomUUID() as Message;
    for (let attempt = 0; attempt < 10; attempt++) {
      const thread = await this.threads.findOne({ "messages.message": parent } as Filter<ThreadDocument<Topic, Author, Context>>);
      if (!thread) throw new ThreadUnavailable("This discussion is no longer available.");
      const clean = validateMessage(name, text, "reply");
      const parentMessage = thread.messages.find((candidate) => candidate.message === parent)!;
      const postedAt = new Date(Math.max(this.clock().getTime(), parentMessage.postedAt.getTime() + 1));
      const posted: PostedMessage<Author, Context> = {
        message, parent, author, name: clean.name, text: clean.text, context, postedAt,
      };
      const result = await this.threads.replaceOne(
        { _id: thread._id, version: thread.version },
        { ...thread, version: thread.version + 1, messages: [...thread.messages, posted] },
      );
      if (result.matchedCount === 1) return { message };
    }
    throw new Error("Discussion changed repeatedly. Retry the reply.");
  }

  async _thread({ thread }: { thread: Thread }): Promise<{
    topic: Topic; anchor: number; messages: PostedMessage<Author, Context>[];
  }[]> {
    const found = await this.threads.findOne({ _id: thread });
    return found ? [{ topic: found.topic, anchor: found.anchor, messages: orderedMessages(found.messages) }] : [];
  }

  async _message({ message }: { message: Message }): Promise<{
    thread: Thread; topic: Topic; anchor: number;
  }[]> {
    const found = await this.threads.findOne({ "messages.message": message } as Filter<ThreadDocument<Topic, Author, Context>>);
    return found ? [{ thread: found._id, topic: found.topic, anchor: found.anchor }] : [];
  }

  async _topicThreads({ topic }: { topic: Topic }): Promise<{
    thread: Thread; anchor: number; messages: PostedMessage<Author, Context>[];
  }[]> {
    const threads = await this.threads.find({ topic } as Filter<ThreadDocument<Topic, Author, Context>>).toArray();
    return threads.sort((left, right) => left.anchor - right.anchor
      || left.messages[0]!.postedAt.getTime() - right.messages[0]!.postedAt.getTime()
      || left._id.localeCompare(right._id))
      .map((thread) => ({ thread: thread._id, anchor: thread.anchor, messages: orderedMessages(thread.messages) }));
  }
}

function validateMessage(name: string, text: string, kind: "comment" | "reply") {
  const trimmedName = name.trim();
  const trimmedText = text.trim();
  if (!trimmedName || !trimmedText || trimmedText.length > MAX_TEXT_LENGTH) {
    throw new InvalidMessage(`Write a ${kind} of 1 to 2000 characters.`);
  }
  return { name: trimmedName, text: trimmedText };
}

function orderedMessages<Author, Context>(messages: PostedMessage<Author, Context>[]) {
  return [...messages].sort((left, right) => left.postedAt.getTime() - right.postedAt.getTime()
    || left.message.localeCompare(right.message));
}
