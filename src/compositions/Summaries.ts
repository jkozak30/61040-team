import { endpoint, receive, respond } from "@mit-sdg/sync-engine/boundary";
import { compute, no, where } from "@mit-sdg/sync-engine/language";
import { computations, concepts } from "../concepts.ts";
import { VideoAccess } from "./Discussion.ts";
import { options } from "./Accounts.ts";

const { Discussing, Sessioning, Summarizing } = concepts;

const Summarize = endpoint(
  "/summaries/summarize",
  ({ session, room, participant, entry, subject, media, discussion, sourceRevision, source, summary }) =>
    receive({ session, room, participant, entry })
      .then(Sessioning.current({ session }).responds({ subject }))
      .then(
        where(VideoAccess({ room, participant, subject, entry }).is({ source: media }),
          Discussing._discussion({ topic: entry }).is({ discussion }),
          compute(computations.summarySource, { discussion, media }, { sourceRevision, source }))
          .then(Summarizing.summarize({ topic: entry, sourceRevision, source }).responds({ summary }))
          .then(respond({ summary })).named("allowed"),
        where(no(VideoAccess({ room, participant, subject, entry }).is({})))
          .then(respond({ error: "FORBIDDEN" })).named("denied"),
      ),
  options,
);

const Read = endpoint(
  "/summaries/read",
  ({ session, room, participant, entry, subject, discussion, currentRevision, summary }) =>
    receive({ session, room, participant, entry })
      .then(Sessioning.current({ session }).responds({ subject }))
      .then(
        where(VideoAccess({ room, participant, subject, entry }).is({}),
          Discussing._discussion({ topic: entry }).is({ discussion }),
          compute(computations.discussionRevision, { discussion }, currentRevision),
          Summarizing._saved({ topic: entry }).is({ summary }))
          .then(respond({ summary, currentRevision })).named("allowed"),
        where(no(VideoAccess({ room, participant, subject, entry }).is({})))
          .then(respond({ error: "FORBIDDEN" })).named("denied"),
      ),
  options,
);

export const composition = { Summarize, Read };
