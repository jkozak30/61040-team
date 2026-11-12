import { endpoint, receive, respond, type EndpointValidator } from "@mit-sdg/sync-engine/boundary";
import { compute, each, form, former, no, reaction, view, when, where } from "@mit-sdg/sync-engine/language";
import { computations, concepts } from "../concepts.ts";
import { EligibleSuccessor, OwnerAccess, RoomAccess } from "./Rooms.ts";

const { RoomJoining, Sessioning, Streaming } = concepts;

const WatchAccess = view(
  "a member's watch",
  ({ room, participant, subject }, { stream, isOwner, live }, { snapshot }) => where(
    RoomAccess({ room, participant, subject }).is({ owner: isOwner }),
    Streaming._stream({ scope: room }).is({ stream, snapshot }),
    compute(computations.watchLive, { snapshot }, { live }),
  ),
).optional();

const OwnerWatchAccess = view(
  "an owner's watch",
  ({ room, participant, subject }, { stream }) => where(
    OwnerAccess({ room, participant, subject }).is({}),
    Streaming._stream({ scope: room }).is({ stream }),
  ),
).optional();

const WatchState = former(
  "shared state and viewers in a watch",
  ({ room, stream, afterRevision }, { snapshot, entries, member, memberName, memberOwner, viewer, name, owner, candidate, candidateName, candidateIdentity, event, snapshotRevision }) =>
    where(
      Streaming._stream({ scope: room }).is({ stream, snapshot, entries }),
      compute(computations.watchRevision, { snapshot }, snapshotRevision),
    ).form({
      snapshot,
      entries,
      ownershipCandidates: each(RoomJoining._ownershipCandidates({ room }).is({ participant: candidate, name: candidateName, identity: candidateIdentity }))
        .where(EligibleSuccessor({ room, participant: candidate }).is({}))
        .form({ participant: candidate, name: candidateName }),
      participants: each(Sessioning._presentSubjects({ scope: room, reusable: true }).is({ subject: member }))
        .where(RoomJoining._participant({ participant: member }).is({ room, name: memberName, owner: memberOwner }))
        .form({ participant: member, name: memberName, owner: memberOwner }),
      viewers: each(Sessioning._presentSubjects({ scope: room }).is({ subject: viewer }))
        .where(RoomJoining._participant({ participant: viewer }).is({ room, name, owner }))
        .form({ viewer, name, owner }),
      controls: each(Streaming._controlsAfter({ stream, afterRevision, throughRevision: snapshotRevision }).is({ viewer, event }))
        .where(RoomJoining._participant({ participant: viewer }).is({ room, name }))
        .form({ viewer, name, event }),
    }),
);

const SavedWatches = former("watch history for an account", ({ account }, { room, participant, lastActivityAt, lastJoinedAt, owner, watch }) =>
  each(RoomJoining._history({ identity: account }).is({ room, participant, lastActivityAt, lastJoinedAt, owner }))
    .where(Streaming._historyWatch({ scope: room }).is({ watch }))
    .form({ room, participant, lastActivityAt, lastJoinedAt, owner, watch }));

const watchInput: EndpointValidator = (value) => {
  const ok = typeof value === "object" && value !== null && !Array.isArray(value)
    && Object.entries(value).every(([field, item]) => {
      if (field === "session") return item === null || typeof item === "string";
      if (field === "afterRevision" || field === "expectedRevision") {
        return Number.isSafeInteger(item) && item >= 0;
      }
      if (field === "offset") return item === null || item === -10 || item === 10;
      if (field === "position") return item === null || (Number.isFinite(item) && item >= 0);
      if (field === "operation") return item === "PLAY" || item === "PAUSE" || item === "SEEK";
      if (field === "previewTitle") return item === null || (typeof item === "string" && item.length <= 200);
      if (field === "videoId") return typeof item === "string" && item.length === 11 && !/[^A-Za-z0-9_-]/.test(item);
      return typeof item === "string" && item.length > 0 && item.length <= 128;
    });
  return ok ? { ok: true } : { ok: false, detail: "Invalid watch input." };
};
const options = { validators: { input: watchInput } };

const Open = endpoint(
  "/watch/open",
  ({ session, room, participant, subject, stream }) =>
    receive({ session, room, participant })
      .then(Sessioning.current({ session }).responds({ subject }))
      .then(
        where(RoomAccess({ room, participant, subject }).is({}))
          .then(Streaming.open({ scope: room }).responds({ stream }))
          .then(respond({ stream })).named("allowed"),
        where(no(RoomAccess({ room, participant, subject }).is({})))
          .then(respond({ error: "FORBIDDEN" })).named("denied"),
      ),
  options,
);

const Read = endpoint(
  "/watch/read",
  ({ session, room, participant, afterRevision, subject, stream, isOwner }) =>
    receive({ session, room, participant, afterRevision })
      .then(Sessioning.current({ session }).responds({ subject }))
      .then(
        where(WatchAccess({ room, participant, subject }).is({ stream, isOwner }))
          .then(respond({ isOwner, watch: WatchState({ room, stream, afterRevision }) })).named("allowed"),
        where(no(WatchAccess({ room, participant, subject }).is({})))
          .then(respond({ error: "FORBIDDEN" })).named("denied"),
      ),
  options,
);

const KeepPresent = endpoint(
  "/watch/presence",
  ({ session, room, participant, connection, subject }) =>
    receive({ session, room, participant, connection })
      .then(Sessioning.current({ session }).responds({ subject }))
      .then(
        where(WatchAccess({ room, participant, subject }).is({ live: true }))
          .then(Sessioning.keepPresent({ scope: room, subject: participant, connection }).responds({}))
          .then(respond({})).named("allowed"),
        where(WatchAccess({ room, participant, subject }).is({ live: false }))
          .then(respond({ error: "PRESENCE_UNAVAILABLE" })).named("ended"),
        where(no(WatchAccess({ room, participant, subject }).is({})))
          .then(respond({ error: "FORBIDDEN" })).named("denied"),
      ),
  options,
);

const Leave = endpoint(
  "/watch/leave",
  ({ session, room, participant, connection, subject, drained }) =>
    receive({ session, room, participant, connection })
      .then(Sessioning.current({ session }).responds({ subject }))
      .then(
        where(WatchAccess({ room, participant, subject }).is({}))
          .then(Sessioning.leave({ scope: room, subject: participant, connection }).responds({ drained }))
          .then(respond({ ended: drained })).named("allowed"),
        where(no(WatchAccess({ room, participant, subject }).is({})))
          .then(respond({ error: "FORBIDDEN" })).named("denied"),
      ),
  options,
);

const EndDrainedWatch = reaction(({ scope, stream }) =>
  when(Sessioning.leave({ scope }).responds({ drained: true }))
    .where(Streaming._stream({ scope }).is({ stream }))
    .then(Streaming.end({ stream }).responds({}))
    .then(Sessioning.close({ scope })),
);

const AddVideo = endpoint(
  "/watch/add-video",
  ({ session, room, participant, videoId, previewTitle, subject, stream, source, entry, revision }) =>
    receive({ session, room, participant, videoId, previewTitle })
      .then(Sessioning.current({ session }).responds({ subject }))
      .then(
        where(OwnerWatchAccess({ room, participant, subject }).is({ stream }),
          compute(computations.youtubeSource, { videoId, previewTitle }, source))
          .then(Streaming.addVideo({ stream, source }).responds({ entry, revision }))
          .then(respond({ entry, revision })).named("allowed"),
        where(no(OwnerWatchAccess({ room, participant, subject }).is({})))
          .then(respond({ error: "FORBIDDEN" })).named("denied"),
      ),
  {
    ...options,
    input: {
      required: ["session", "room", "participant", "videoId"],
      defaults: { previewTitle: null },
    },
  },
);

const Start = endpoint(
  "/watch/start",
  ({ session, room, participant, entry, subject, stream, revision }) =>
    receive({ session, room, participant, entry })
      .then(Sessioning.current({ session }).responds({ subject }))
      .then(
        where(OwnerWatchAccess({ room, participant, subject }).is({ stream }))
          .then(Streaming.start({ stream, entry }).responds({ revision }))
          .then(respond({ revision })).named("allowed"),
        where(no(OwnerWatchAccess({ room, participant, subject }).is({})))
          .then(respond({ error: "FORBIDDEN" })).named("denied"),
      ),
  options,
);

const SwitchVideo = endpoint(
  "/watch/switch-video",
  ({ session, room, participant, entry, subject, stream, revision }) =>
    receive({ session, room, participant, entry })
      .then(Sessioning.current({ session }).responds({ subject }))
      .then(
        where(OwnerWatchAccess({ room, participant, subject }).is({ stream }))
          .then(Streaming.switchVideo({ stream, entry }).responds({ revision }))
          .then(respond({ revision })).named("allowed"),
        where(no(OwnerWatchAccess({ room, participant, subject }).is({})))
          .then(respond({ error: "FORBIDDEN" })).named("denied"),
      ),
  options,
);

const End = endpoint(
  "/watch/end",
  ({ session, room, participant, subject, stream, ended }) =>
    receive({ session, room, participant })
      .then(Sessioning.current({ session }).responds({ subject }))
      .then(
        where(OwnerWatchAccess({ room, participant, subject }).is({ stream }))
          .then(Streaming.end({ stream }).responds({ ended }))
          .then(Sessioning.close({ scope: room }).responds({}))
          .then(respond({ ended })).named("allowed"),
        where(no(OwnerWatchAccess({ room, participant, subject }).is({})))
          .then(respond({ error: "FORBIDDEN" })).named("denied"),
      ),
  options,
);

const Control = endpoint(
  "/watch/control",
  ({ session, room, participant, entry, expectedRevision, connection, operation, position, offset, subject, stream, command, revision, changed }) =>
    receive({ session, room, participant, entry, expectedRevision, connection, operation, position, offset })
      .then(Sessioning.current({ session }).responds({ subject }))
      .then(
        where(
          WatchAccess({ room, participant, subject }).is({ stream }),
          Sessioning._connectionPresence({ scope: room, subject: participant, connection }).is({ present: true }),
          compute(computations.playbackCommand, { entry, expectedRevision, operation, position, offset }, command),
        )
          .then(Streaming.control({ stream, viewer: participant, command }).responds({ revision, changed }))
          .then(respond({ revision, changed })).named("allowed"),
        where(
          WatchAccess({ room, participant, subject }).is({}),
          no(Sessioning._connectionPresence({ scope: room, subject: participant, connection }).is({ present: true })),
        ).then(respond({ error: "CONTROL_UNAVAILABLE" })).named("absent"),
        where(no(WatchAccess({ room, participant, subject }).is({})))
          .then(respond({ error: "FORBIDDEN" })).named("denied"),
      ),
  {
    ...options,
    input: {
      required: ["session", "room", "participant", "entry", "expectedRevision", "connection", "operation"],
      defaults: { position: null, offset: null },
    },
  },
);

const History = endpoint(
  "/watch/history",
  ({ session, subject, account, visitor }) =>
    receive({ session })
      .then(Sessioning.current({ session }).responds({ subject }))
      .then(
        where(compute(computations.roomSubject, { subject }, { kind: "account", account, visitor: null }))
          .then(respond({ rooms: SavedWatches({ account }) })).named("account"),
        where(compute(computations.roomSubject, { subject }, { kind: "guest", account: null, visitor }))
          .then(respond({ error: "FORBIDDEN" })).named("guest"),
      ),
  options,
);

export const composition = {
  WatchAccess, OwnerWatchAccess, WatchState, SavedWatches, Open, Read, KeepPresent,
  Leave, EndDrainedWatch, AddVideo, Start, SwitchVideo, End, Control, History,
};
