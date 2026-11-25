import { endpoint, receive, respond, type EndpointValidator } from "@mit-sdg/sync-engine/boundary";
import { compute, each, former, no, reaction, view, when, where } from "@mit-sdg/sync-engine/language";
import { computations, concepts } from "../concepts.ts";
import { RoomAccess } from "./Rooms.ts";

const { Sessioning, RoomJoining, Presence, Watching, Discussing, Summarizing } = concepts;

export const DiscussionAccess = view("verified room membership and saved video entry",
  ({ room, participant, subject, entry }, { stream, snapshot, entries, name, canonical, live }, {}) => where(
    RoomAccess({ room, participant, subject }).is({ name, canonical }),
    Watching._stream({ scope: room }).is({ stream, snapshot, entries }),
    compute(computations.listedVideo, { entries, entry }, { listed: true }),
    compute(computations.liveVideo, { snapshot, entry }, { live }),
  )).optional();

const OwnedMessage = view("an editable comment owned by this room member",
  ({ room, participant, subject, message }, { entry, canonical }, {}) => where(
    Discussing._editableMessage({ message }).is({ topic: entry, author: canonical }),
    DiscussionAccess({ room, participant, subject, entry }).is({ canonical }),
  )).optional();

const TopicThreads = former("discussion threads on an entry", ({ entry }, { thread, anchor, messages }) =>
  each(Discussing._topicThreads({ topic: entry }).is({ thread, anchor, messages }))
    .form({ thread, anchor, messages }));

const inputValidator: EndpointValidator = (value) => {
  const ok = typeof value === "object" && value !== null && !Array.isArray(value)
    && Object.entries(value).every(([key, item]) => {
      if (key === "anchor") return typeof item === "number" && Number.isFinite(item) && item >= 0;
      if (key === "text") return typeof item === "string" && item.trim().length > 0 && item.trim().length <= 2000;
      if (key === "mode") return item === "LIVE" || item === "HISTORICAL";
      if (key === "connection") return item === null || (typeof item === "string" && item.length <= 128);
      return typeof item === "string" && item.length > 0 && item.length <= 128;
    });
  return ok ? { ok: true } : { ok: false, detail: "Invalid discussion input." };
};
const opts = { validators: { input: inputValidator } };

const ListThreads = endpoint("/discussion/threads",
  ({ session, room, participant, entry, subject }) => receive({ session, room, participant, entry })
    .then(Sessioning.current({ session }).responds({ subject }))
    .then(
      where(DiscussionAccess({ room, participant, subject, entry }).is({}))
        .then(respond({ threads: TopicThreads({ entry }) })).named("allowed"),
      where(no(DiscussionAccess({ room, participant, subject, entry }).is({})))
        .then(respond({ error: "FORBIDDEN" })).named("denied"),
    ), opts);

const ReadThread = endpoint("/discussion/thread",
  ({ session, room, participant, thread, subject, entry, anchor, messages }) =>
    receive({ session, room, participant, thread })
      .then(Sessioning.current({ session }).responds({ subject }))
      .then(
        where(Discussing._thread({ thread }).is({ topic: entry, anchor, messages }),
          DiscussionAccess({ room, participant, subject, entry }).is({}))
          .then(respond({ thread, entry, anchor, messages })).named("allowed"),
        where(no(Discussing._thread({ thread }).is({})))
          .then(respond({ error: "THREAD_UNAVAILABLE" })).named("unknown"),
        where(Discussing._thread({ thread }).is({ topic: entry }),
          no(DiscussionAccess({ room, participant, subject, entry }).is({})))
          .then(respond({ error: "FORBIDDEN" })).named("denied"),
      ), opts);

const StartThread = endpoint("/discussion/start-thread",
  ({ session, room, participant, entry, anchor, text, mode, connection, subject, name, canonical, live, thread, message }) =>
    receive({ session, room, participant, entry, anchor, text, mode, connection })
      .then(Sessioning.current({ session }).responds({ subject }))
      .then(
        where(DiscussionAccess({ room, participant, subject, entry }).is({ name, canonical }),
          compute(computations.isHistorical, { mode }, { historical: true }))
          .then(Discussing.startThread({ topic: entry, author: canonical, name, anchor, text, context: mode }).responds({ thread, message }))
          .then(respond({ thread, message })).named("historical"),
        where(DiscussionAccess({ room, participant, subject, entry }).is({ name, canonical, live: true }),
          compute(computations.isHistorical, { mode }, { historical: false }),
          Presence._connectionPresence({ scope: room, subject: canonical, connection }).is({ present: true }))
          .then(Discussing.startThread({ topic: entry, author: canonical, name, anchor, text, context: mode }).responds({ thread, message }))
          .then(respond({ thread, message })).named("live"),
        where(no(DiscussionAccess({ room, participant, subject, entry }).is({})))
          .then(respond({ error: "FORBIDDEN" })).named("denied"),
        where(DiscussionAccess({ room, participant, subject, entry }).is({}),
          compute(computations.isHistorical, { mode }, { historical: false }),
          no(DiscussionAccess({ room, participant, subject, entry }).is({ live: true })))
          .then(respond({ error: "PRESENCE_UNAVAILABLE" })).named("not-live"),
        where(DiscussionAccess({ room, participant, subject, entry }).is({ canonical, live: true }),
          compute(computations.isHistorical, { mode }, { historical: false }),
          no(Presence._connectionPresence({ scope: room, subject: canonical, connection }).is({ present: true })))
          .then(respond({ error: "PRESENCE_UNAVAILABLE" })).named("absent"),
      ), { ...opts, input: { required: ["session", "room", "participant", "entry", "anchor", "text", "mode"], defaults: { connection: null } } });

const Reply = endpoint("/discussion/reply",
  ({ session, room, participant, parent, text, mode, connection, subject, entry, name, canonical, live, message }) =>
    receive({ session, room, participant, parent, text, mode, connection })
      .then(Sessioning.current({ session }).responds({ subject }))
      .then(
        where(Discussing._message({ message: parent }).is({ topic: entry }),
          DiscussionAccess({ room, participant, subject, entry }).is({ name, canonical }),
          compute(computations.isHistorical, { mode }, { historical: true }))
          .then(Discussing.reply({ parent, author: canonical, name, text, context: mode }).responds({ message }))
          .then(respond({ message })).named("historical"),
        where(Discussing._message({ message: parent }).is({ topic: entry }),
          DiscussionAccess({ room, participant, subject, entry }).is({ name, canonical, live: true }),
          compute(computations.isHistorical, { mode }, { historical: false }),
          Presence._connectionPresence({ scope: room, subject: canonical, connection }).is({ present: true }))
          .then(Discussing.reply({ parent, author: canonical, name, text, context: mode }).responds({ message }))
          .then(respond({ message })).named("live"),
        where(no(Discussing._message({ message: parent }).is({})))
          .then(respond({ error: "THREAD_UNAVAILABLE" })).named("missing"),
        where(Discussing._message({ message: parent }).is({ topic: entry }),
          no(DiscussionAccess({ room, participant, subject, entry }).is({})))
          .then(respond({ error: "FORBIDDEN" })).named("denied"),
        where(Discussing._message({ message: parent }).is({ topic: entry }),
          DiscussionAccess({ room, participant, subject, entry }).is({}),
          compute(computations.isHistorical, { mode }, { historical: false }),
          no(DiscussionAccess({ room, participant, subject, entry }).is({ live: true })))
          .then(respond({ error: "PRESENCE_UNAVAILABLE" })).named("not-live"),
        where(Discussing._message({ message: parent }).is({ topic: entry }),
          DiscussionAccess({ room, participant, subject, entry }).is({ canonical, live: true }),
          compute(computations.isHistorical, { mode }, { historical: false }),
          no(Presence._connectionPresence({ scope: room, subject: canonical, connection }).is({ present: true })))
          .then(respond({ error: "PRESENCE_UNAVAILABLE" })).named("absent"),
      ), { ...opts, input: { required: ["session", "room", "participant", "parent", "text", "mode"], defaults: { connection: null } } });

const EditMessage = endpoint("/discussion/edit-message",
  ({ session, room, participant, message, text, subject, entry, canonical, changed }) =>
    receive({ session, room, participant, message, text })
      .then(Sessioning.current({ session }).responds({ subject }))
      .then(
        where(OwnedMessage({ room, participant, subject, message }).is({ entry, canonical }))
          .then(Discussing.editMessage({ message, author: canonical, text }).responds({ topic: entry, changed }))
          .then(respond({ message })).named("allowed"),
        where(no(Discussing._editableMessage({ message }).is({})))
          .then(respond({ error: "THREAD_UNAVAILABLE" })).named("missing"),
        where(Discussing._editableMessage({ message }).is({}),
          no(OwnedMessage({ room, participant, subject, message }).is({})))
          .then(respond({ error: "FORBIDDEN" })).named("denied"),
      ), { ...opts, input: { required: ["session", "room", "participant", "message", "text"] } });

const InvalidateEditedOverview = reaction(({ entry }) =>
  when(Discussing.editMessage({}).responds({ topic: entry, changed: true }))
    .then(Summarizing.invalidate({ topic: entry }).responds({})),
);

const DeleteMessage = endpoint("/discussion/delete-message",
  ({ session, room, participant, message, subject, entry, canonical }) =>
    receive({ session, room, participant, message })
      .then(Sessioning.current({ session }).responds({ subject }))
      .then(
        where(OwnedMessage({ room, participant, subject, message }).is({ entry, canonical }))
          .then(Discussing.deleteMessage({ message, author: canonical }).responds({ topic: entry }))
          .then(Summarizing.invalidate({ topic: entry }).responds({}))
          .then(respond({ message })).named("allowed"),
        where(no(Discussing._editableMessage({ message }).is({})))
          .then(respond({ error: "THREAD_UNAVAILABLE" })).named("missing"),
        where(Discussing._editableMessage({ message }).is({}),
          no(OwnedMessage({ room, participant, subject, message }).is({})))
          .then(respond({ error: "FORBIDDEN" })).named("denied"),
      ), { ...opts, input: { required: ["session", "room", "participant", "message"] } });

export const composition = { DiscussionAccess, OwnedMessage, TopicThreads, ListThreads, ReadThread, StartThread, Reply, EditMessage, InvalidateEditedOverview, DeleteMessage };
