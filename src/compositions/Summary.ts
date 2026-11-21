import { endpoint, receive, respond } from "@mit-sdg/sync-engine/boundary";
import { no, where } from "@mit-sdg/sync-engine/language";
import { concepts } from "../concepts.ts";
import { DiscussionAccess } from "./Discussion.ts";

const { Sessioning, Discussing, Summarizing } = concepts;

const Read = endpoint("/summary/read",
  ({ session, room, participant, entry, subject, summary }) =>
    receive({ session, room, participant, entry })
      .then(Sessioning.current({ session }).responds({ subject }))
      .then(
        where(DiscussionAccess({ room, participant, subject, entry }).is({}), Summarizing._summary({ topic: entry }).is({ summary }))
          .then(respond({ summary })).named("exists"),
        where(DiscussionAccess({ room, participant, subject, entry }).is({}), no(Summarizing._summary({ topic: entry }).is({})))
          .then(respond({ summary: null })).named("empty"),
        where(no(DiscussionAccess({ room, participant, subject, entry }).is({})))
          .then(respond({ error: "FORBIDDEN" })).named("denied"),
      ));

const Request = endpoint("/summary/request",
  ({ session, room, participant, entry, subject, items, summary }) =>
    receive({ session, room, participant, entry })
      .then(Sessioning.current({ session }).responds({ subject }))
      .then(
        where(DiscussionAccess({ room, participant, subject, entry }).is({}),
          Discussing._topicDiscussion({ topic: entry }).is({ items }))
          .then(Summarizing.request({ topic: entry, items }).responds({ summary }))
          .then(respond({ summary })).named("allowed"),
        where(no(DiscussionAccess({ room, participant, subject, entry }).is({})))
          .then(respond({ error: "FORBIDDEN" })).named("denied"),
      ));

export const composition = { Read, Request };
