import type { Discussing } from "./concepts.ts";
import type { LectureSource, SummaryThreads } from "./lecture-summary.ts";
import type { MediaSource } from "./media-source.ts";

type Discussion = Awaited<ReturnType<Discussing["_discussion"]>>["discussion"];

export function summarySource({ discussion, media }: { discussion: Discussion; media: MediaSource }): {
  sourceRevision: number; source: LectureSource;
} {
  const ordered = [...discussion.threads].sort((left, right) => left.anchor - right.anchor);
  const threads: SummaryThreads = ordered.map(({ anchor }) => ({ position: anchor, messages: [] }));
  const byThread = new Map(ordered.map(({ thread }, index) => [thread, threads[index]!]));
  const messageIndexes = new Map<Discussion["messages"][number]["message"], number>();
  for (const { message, thread, parent, text } of discussion.messages) {
    const target = byThread.get(thread);
    if (!target) continue;
    const replyTo = parent ? messageIndexes.get(parent) : undefined;
    messageIndexes.set(message, target.messages.length);
    target.messages.push({ text, ...(replyTo === undefined ? {} : { replyTo }) });
  }
  return { sourceRevision: discussion.revision, source: { media, threads } };
}

export const discussionRevision = ({ discussion }: { discussion: Discussion }) => discussion.revision;
