import { endpoint, receive, respond, type EndpointValidator } from "@mit-sdg/sync-engine/boundary";
import { compute, no, reaction, view, when, where } from "@mit-sdg/sync-engine/language";
import { computations, concepts } from "../concepts.ts";
import { RoomAccess } from "./Rooms.ts";

const { Discussing, RoomJoining, Sessioning, Streaming } = concepts;

export const VideoAccess = view(
  "a room member's video entry",
  ({ room, participant, subject, entry }, { name, live, source }) => where(
    RoomAccess({ room, participant, subject }).is({ name }),
    Streaming._discussionEntry({ scope: room, entry }).is({ live, source }),
  ),
).optional();

const PostAccess = view(
  "an entry's discussion mode for this player",
  ({ room, participant, subject, entry, connection }, { name, context, writable }, { entryLive, present }) => where(
    VideoAccess({ room, participant, subject, entry }).is({ name, live: entryLive }),
    Sessioning._connectionPresence({ scope: room, subject: participant, connection }).is({ present }),
    compute(computations.discussionMode, { entryLive, connection, present }, { context, writable }),
  ),
).optional();

const ReplyAccess = view(
  "a room member's reply target",
  ({ room, participant, subject, parent, connection }, { name, context, writable }, { entry }) => where(
    Discussing._topic({ message: parent }).is({ topic: entry }),
    PostAccess({ room, participant, subject, entry, connection }).is({ name, context, writable }),
  ),
).optional();

const input: EndpointValidator = (value) => {
  const ok = typeof value === "object" && value !== null && !Array.isArray(value)
    && Object.entries(value).every(([field, item]) => {
      if (field === "connection" && item === null) return true;
      if (field === "session") return item === null || typeof item === "string";
      if (field === "position") return Number.isFinite(item) && item >= 0;
      if (field === "text") return typeof item === "string" && item.length <= 4000;
      return typeof item === "string" && item.length > 0 && item.length <= 128;
    });
  return ok ? { ok: true } : { ok: false, detail: "Invalid discussion input." };
};
const options = { validators: { input } };

const Read = endpoint(
  "/discussion/read",
  ({ session, room, participant, entry, subject, discussion }) =>
    receive({ session, room, participant, entry })
      .then(Sessioning.current({ session }).responds({ subject }))
      .then(
        where(VideoAccess({ room, participant, subject, entry }).is({}),
          Discussing._discussion({ topic: entry }).is({ discussion }))
          .then(respond({ discussion })).named("allowed"),
        where(no(VideoAccess({ room, participant, subject, entry }).is({})))
          .then(respond({ error: "FORBIDDEN" })).named("denied"),
      ),
  options,
);

const StartThread = endpoint(
  "/discussion/start-thread",
  ({ session, room, participant, entry, position, text, connection, subject, name, context, thread, message, revision }) =>
    receive({ session, room, participant, entry, position, text, connection })
      .then(Sessioning.current({ session }).responds({ subject }))
      .then(
        where(PostAccess({ room, participant, subject, entry, connection }).is({ name, context, writable: true }))
          .then(Discussing.startThread({ topic: entry, author: participant, name, anchor: position, text, context })
            .responds({ thread, message, revision }))
          .then(respond({ thread, message, revision, context })).named("allowed"),
        where(PostAccess({ room, participant, subject, entry, connection }).is({ writable: false }))
          .then(respond({ error: "DISCUSSION_ENTRY_CHANGED" })).named("stale"),
        where(no(PostAccess({ room, participant, subject, entry, connection }).is({})))
          .then(respond({ error: "FORBIDDEN" })).named("denied"),
      ),
  { ...options, input: { required: ["session", "room", "participant", "entry", "position", "text"], defaults: { connection: null } } },
);

const Reply = endpoint(
  "/discussion/reply",
  ({ session, room, participant, parent, text, connection, subject, name, context, message, revision }) =>
    receive({ session, room, participant, parent, text, connection })
      .then(Sessioning.current({ session }).responds({ subject }))
      .then(
        where(ReplyAccess({ room, participant, subject, parent, connection }).is({ name, context, writable: true }))
          .then(Discussing.reply({ parent, author: participant, name, text, context }).responds({ message, revision }))
          .then(respond({ message, revision, context })).named("allowed"),
        where(ReplyAccess({ room, participant, subject, parent, connection }).is({ writable: false }))
          .then(respond({ error: "DISCUSSION_ENTRY_CHANGED" })).named("stale"),
        where(no(ReplyAccess({ room, participant, subject, parent, connection }).is({})))
          .then(respond({ error: "FORBIDDEN" })).named("denied"),
      ),
  { ...options, input: { required: ["session", "room", "participant", "parent", "text"], defaults: { connection: null } } },
);

const SaveThreadActivity = reaction(({ author, room, identity }) =>
  when(Discussing.startThread({ author }).responds({}))
    .where(RoomJoining._participant({ participant: author }).is({ room, identity }),
      compute(computations.isAccountIdentity, { identity }, { signedIn: true }),
      RoomJoining._savedVisit({ room, identity }).is({}))
    .then(RoomJoining.recordActivity({ room, identity })),
);

const SaveReplyActivity = reaction(({ author, room, identity }) =>
  when(Discussing.reply({ author }).responds({}))
    .where(RoomJoining._participant({ participant: author }).is({ room, identity }),
      compute(computations.isAccountIdentity, { identity }, { signedIn: true }),
      RoomJoining._savedVisit({ room, identity }).is({}))
    .then(RoomJoining.recordActivity({ room, identity })),
);

export const composition = { VideoAccess, PostAccess, ReplyAccess, Read, StartThread, Reply, SaveThreadActivity, SaveReplyActivity };
