import { endpoint, receive, respond, type EndpointValidator } from "@mit-sdg/sync-engine/boundary";
import { compute, each, former, no, view, where } from "@mit-sdg/sync-engine/language";
import { computations, concepts } from "../concepts.ts";
import { RoomAccess } from "./Rooms.ts";

const { Discussing, Presence, Sessioning, Summarizing, Watching } = concepts;

const TopicAccess = view(
  "a member's saved video",
  ({ room, participant, subject, entry }, { canonical, name, snapshot }, { entries }) => where(
    RoomAccess({ room, participant, subject }).is({ canonical, name }),
    Watching._stream({ scope: room }).is({ snapshot, entries }),
    compute(computations.listedVideo, { entries, entry }, { listed: true }),
  ),
).optional();

const Threads = former("discussion threads for a video", ({ entry }, { thread, anchor, messages }) =>
  each(Discussing._topicThreads({ topic: entry }).is({ thread, anchor, messages }))
    .form({ thread, anchor, messages }));

const SavedSummary = former("saved overview for a video", ({ entry }, { summary }) =>
  each(Summarizing._summary({ topic: entry }).is({ summary })).form({ summary }));

const discussionInput: EndpointValidator = (value) => {
  const ok = typeof value === "object" && value !== null && !Array.isArray(value)
    && Object.entries(value).every(([field, item]) => {
      if (field === "session") return item === null || typeof item === "string";
      if (field === "connection") return typeof item === "string" && item.length <= 128;
      if (field === "anchor") return typeof item === "number" && Number.isFinite(item) && item >= 0;
      if (field === "mode") return item === "LIVE" || item === "HISTORICAL";
      if (field === "text") return typeof item === "string" && item.trim().length > 0 && item.trim().length <= 2000;
      return typeof item === "string" && item.length > 0 && item.length <= 128;
    });
  return ok ? { ok: true } : { ok: false, detail: "Invalid discussion input." };
};
const options = { validators: { input: discussionInput } };

const StartThread = endpoint("/discussion/start-thread",
  ({ session, room, participant, entry, anchor, text, mode, connection, subject, canonical, name, snapshot, thread, message }) =>
    receive({ session, room, participant, entry, anchor, text, mode, connection })
      .then(Sessioning.current({ session }).responds({ subject }))
      .then(
        where(TopicAccess({ room, participant, subject, entry }).is({ canonical, name }),
          compute(computations.discussionContext, { mode }, { context: "HISTORICAL" }))
          .then(Discussing.startThread({ topic: entry, author: canonical, name, anchor, text, context: "HISTORICAL" }).responds({ thread, message }))
          .then(respond({ thread, message })).named("historical"),
        where(TopicAccess({ room, participant, subject, entry }).is({ canonical, name, snapshot }),
          compute(computations.discussionContext, { mode }, { context: "LIVE" }),
          compute(computations.liveVideo, { snapshot, entry }, { live: true }),
          Presence._connectionPresence({ scope: room, subject: canonical, connection }).is({ present: true }))
          .then(Discussing.startThread({ topic: entry, author: canonical, name, anchor, text, context: "LIVE" }).responds({ thread, message }))
          .then(respond({ thread, message })).named("live"),
        where(TopicAccess({ room, participant, subject, entry }).is({ snapshot }),
          compute(computations.discussionContext, { mode }, { context: "LIVE" }),
          compute(computations.liveVideo, { snapshot, entry }, { live: false }))
          .then(respond({ error: "DISCUSSION_UNAVAILABLE" })).named("inactive"),
        where(TopicAccess({ room, participant, subject, entry }).is({ canonical, snapshot }),
          compute(computations.discussionContext, { mode }, { context: "LIVE" }),
          compute(computations.liveVideo, { snapshot, entry }, { live: true }),
          no(Presence._connectionPresence({ scope: room, subject: canonical, connection }).is({ present: true })))
          .then(respond({ error: "DISCUSSION_UNAVAILABLE" })).named("absent"),
        where(RoomAccess({ room, participant, subject }).is({}),
          no(TopicAccess({ room, participant, subject, entry }).is({})))
          .then(respond({ error: "DISCUSSION_UNAVAILABLE" })).named("missing-video"),
        where(no(RoomAccess({ room, participant, subject }).is({})))
          .then(respond({ error: "FORBIDDEN" })).named("denied"),
      ),
  { ...options, input: { required: ["session", "room", "participant", "entry", "anchor", "text", "mode"], defaults: { connection: "" } } });

const Reply = endpoint("/discussion/reply",
  ({ session, room, participant, parent, text, mode, connection, subject, entry, canonical, name, snapshot, message }) =>
    receive({ session, room, participant, parent, text, mode, connection })
      .then(Sessioning.current({ session }).responds({ subject }))
      .then(
        where(Discussing._message({ message: parent }).is({ topic: entry }),
          TopicAccess({ room, participant, subject, entry }).is({ canonical, name }),
          compute(computations.discussionContext, { mode }, { context: "HISTORICAL" }))
          .then(Discussing.reply({ parent, author: canonical, name, text, context: "HISTORICAL" }).responds({ message }))
          .then(respond({ message })).named("historical"),
        where(Discussing._message({ message: parent }).is({ topic: entry }),
          TopicAccess({ room, participant, subject, entry }).is({ canonical, name, snapshot }),
          compute(computations.discussionContext, { mode }, { context: "LIVE" }),
          compute(computations.liveVideo, { snapshot, entry }, { live: true }),
          Presence._connectionPresence({ scope: room, subject: canonical, connection }).is({ present: true }))
          .then(Discussing.reply({ parent, author: canonical, name, text, context: "LIVE" }).responds({ message }))
          .then(respond({ message })).named("live"),
        where(RoomAccess({ room, participant, subject }).is({}),
          no(Discussing._message({ message: parent }).is({})))
          .then(respond({ error: "THREAD_UNAVAILABLE" })).named("missing-parent"),
        where(no(RoomAccess({ room, participant, subject }).is({})))
          .then(respond({ error: "FORBIDDEN" })).named("denied"),
        where(RoomAccess({ room, participant, subject }).is({}),
          Discussing._message({ message: parent }).is({ topic: entry }),
          no(TopicAccess({ room, participant, subject, entry }).is({})))
          .then(respond({ error: "DISCUSSION_UNAVAILABLE" })).named("unavailable"),
        where(Discussing._message({ message: parent }).is({ topic: entry }),
          TopicAccess({ room, participant, subject, entry }).is({ snapshot }),
          compute(computations.discussionContext, { mode }, { context: "LIVE" }),
          compute(computations.liveVideo, { snapshot, entry }, { live: false }))
          .then(respond({ error: "DISCUSSION_UNAVAILABLE" })).named("inactive"),
        where(Discussing._message({ message: parent }).is({ topic: entry }),
          TopicAccess({ room, participant, subject, entry }).is({ canonical, snapshot }),
          compute(computations.discussionContext, { mode }, { context: "LIVE" }),
          compute(computations.liveVideo, { snapshot, entry }, { live: true }),
          no(Presence._connectionPresence({ scope: room, subject: canonical, connection }).is({ present: true })))
          .then(respond({ error: "DISCUSSION_UNAVAILABLE" })).named("absent"),
      ),
  { ...options, input: { required: ["session", "room", "participant", "parent", "text", "mode"], defaults: { connection: "" } } });

const ListThreads = endpoint("/discussion/threads",
  ({ session, room, participant, entry, subject }) =>
    receive({ session, room, participant, entry })
      .then(Sessioning.current({ session }).responds({ subject }))
      .then(
        where(TopicAccess({ room, participant, subject, entry }).is({}))
          .then(respond({ threads: Threads({ entry }) })).named("allowed"),
        where(RoomAccess({ room, participant, subject }).is({}),
          no(TopicAccess({ room, participant, subject, entry }).is({})))
          .then(respond({ error: "DISCUSSION_UNAVAILABLE" })).named("missing-video"),
        where(no(RoomAccess({ room, participant, subject }).is({})))
          .then(respond({ error: "FORBIDDEN" })).named("denied"),
      ), options);

const ReadThread = endpoint("/discussion/thread",
  ({ session, room, participant, thread, subject, entry, anchor, messages }) =>
    receive({ session, room, participant, thread })
      .then(Sessioning.current({ session }).responds({ subject }))
      .then(
        where(Discussing._thread({ thread }).is({ topic: entry, anchor, messages }),
          TopicAccess({ room, participant, subject, entry }).is({}))
          .then(respond({ thread, entry, anchor, messages })).named("allowed"),
        where(no(RoomAccess({ room, participant, subject }).is({})))
          .then(respond({ error: "FORBIDDEN" })).named("denied"),
        where(RoomAccess({ room, participant, subject }).is({}),
          no(Discussing._thread({ thread }).is({})))
          .then(respond({ error: "THREAD_UNAVAILABLE" })).named("missing"),
        where(Discussing._thread({ thread }).is({ topic: entry }),
          RoomAccess({ room, participant, subject }).is({}),
          no(TopicAccess({ room, participant, subject, entry }).is({})))
          .then(respond({ error: "THREAD_UNAVAILABLE" })).named("foreign-video"),
      ), options);

const RequestSummary = endpoint("/discussion/summarize",
  ({ session, room, participant, entry, subject, threads, items, failed }) =>
    receive({ session, room, participant, entry })
      .then(Sessioning.current({ session }).responds({ subject }))
      .then(
        where(TopicAccess({ room, participant, subject, entry }).is({}),
          Discussing._topicMaterial({ topic: entry }).is({ threads }),
          compute(computations.summaryItems, { threads }, items))
          .then(Summarizing.summarize({ topic: entry, items }).responds({ failed }))
          .then(respond({ failed, summaries: SavedSummary({ entry }) })).named("allowed"),
        where(RoomAccess({ room, participant, subject }).is({}),
          no(TopicAccess({ room, participant, subject, entry }).is({})))
          .then(respond({ error: "DISCUSSION_UNAVAILABLE" })).named("missing-video"),
        where(no(RoomAccess({ room, participant, subject }).is({})))
          .then(respond({ error: "FORBIDDEN" })).named("denied"),
      ), options);

const ReadSummary = endpoint("/discussion/summary",
  ({ session, room, participant, entry, subject }) =>
    receive({ session, room, participant, entry })
      .then(Sessioning.current({ session }).responds({ subject }))
      .then(
        where(TopicAccess({ room, participant, subject, entry }).is({}))
          .then(respond({ summaries: SavedSummary({ entry }) })).named("allowed"),
        where(RoomAccess({ room, participant, subject }).is({}),
          no(TopicAccess({ room, participant, subject, entry }).is({})))
          .then(respond({ error: "DISCUSSION_UNAVAILABLE" })).named("missing-video"),
        where(no(RoomAccess({ room, participant, subject }).is({})))
          .then(respond({ error: "FORBIDDEN" })).named("denied"),
      ), options);

export const composition = { TopicAccess, Threads, SavedSummary, StartThread, Reply, ListThreads, ReadThread, RequestSummary, ReadSummary };
