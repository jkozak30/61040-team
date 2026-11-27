import { endpoint, receive, respond } from "@mit-sdg/sync-engine/boundary";
import { compute, no, where } from "@mit-sdg/sync-engine/language";
import { computations, concepts } from "../concepts.ts";
import { DiscussionAccess } from "./Discussion.ts";

const { Sessioning, Discussing, Summarizing, Watching } = concepts;

const Read = endpoint("/summary/read",
  ({ session, room, participant, entry, subject, summary, items }) =>
    receive({ session, room, participant, entry })
      .then(Sessioning.current({ session }).responds({ subject }))
      .then(
        where(DiscussionAccess({ room, participant, subject, entry }).is({}), Discussing._topicDiscussion({ topic: entry }).is({ items }), Summarizing._summary({ topic: entry, items }).is({ summary }))
          .then(respond({ summary })).named("exists"),
        where(DiscussionAccess({ room, participant, subject, entry }).is({}), Discussing._topicDiscussion({ topic: entry }).is({ items }), no(Summarizing._summary({ topic: entry, items }).is({})))
          .then(respond({ summary: null })).named("empty"),
        where(no(DiscussionAccess({ room, participant, subject, entry }).is({})))
          .then(respond({ error: "FORBIDDEN" })).named("denied"),
      ));

const Request = endpoint("/summary/request",
  ({ session, room, participant, entry, subject, version, items, summary }) =>
    receive({ session, room, participant, entry })
      .then(Sessioning.current({ session }).responds({ subject }))
      .then(
        where(DiscussionAccess({ room, participant, subject, entry }).is({}),
          Summarizing._version({ topic: entry }).is({ version }),
          Discussing._topicDiscussion({ topic: entry }).is({ items }))
          .then(Summarizing.request({ topic: entry, items, expectedVersion: version }).responds({ summary }))
          .then(respond({ summary })).named("allowed"),
        where(no(DiscussionAccess({ room, participant, subject, entry }).is({})))
          .then(respond({ error: "FORBIDDEN" })).named("denied"),
      ));

const Enhance = endpoint("/summary/enhance",
  ({ session, room, participant, entry, expectedBaseline, subject, items, entries, source, summary }) =>
    receive({ session, room, participant, entry, expectedBaseline })
      .then(Sessioning.current({ session }).responds({ subject }))
      .then(
        where(DiscussionAccess({ room, participant, subject, entry }).is({}),
          Watching._stream({ scope: room }).is({ entries }),
          compute(computations.summaryVideoSource, { entries, entry }, { source }),
          Discussing._topicDiscussion({ topic: entry }).is({ items }))
          .then(Summarizing.enhance({ topic: entry, items, source, expectedBaseline }).responds({ summary }))
          .then(respond({ summary })).named("allowed"),
        where(no(DiscussionAccess({ room, participant, subject, entry }).is({})))
          .then(respond({ error: "FORBIDDEN" })).named("denied"),
      ));

export const composition = { Read, Request, Enhance };
