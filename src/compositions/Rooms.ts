import { endpoint, receive, respond } from "@mit-sdg/sync-engine/boundary";
import { compute, each, former, no, reaction, view, when, where } from "@mit-sdg/sync-engine/language";
import { computations, concepts } from "../concepts.ts";
import { options } from "./Accounts.ts";

const { Authenticating, RoomJoining, Sessioning, Streaming } = concepts;
const { roomSubject } = computations;

const Create = endpoint("/rooms/create", ({ session, subject, account, visitor, name, room, participant, code }) =>
  receive({ session, name })
    .then(Sessioning.current({ session }).responds({ subject }))
    .then(
      where(compute(roomSubject, { subject }, { kind: "account", account, visitor: null }))
        .then(RoomJoining.create({ identity: account, name }).responds({ room, participant, code }))
        .then(respond({ room, participant, code })).named("account"),
      where(compute(roomSubject, { subject }, { kind: "guest", account: null, visitor }))
        .then(respond({ error: "FORBIDDEN" })).named("guest"),
    ), options);

const Join = endpoint("/rooms/join", ({ session, subject, identity, saveVisit, code, name, room, participant }) =>
  receive({ session, code, name })
    .then(Sessioning.current({ session }).responds({ subject }))
    .then(
      where(
        compute(computations.watchIdentity, { subject }, identity),
        compute(computations.isAccountIdentity, { identity }, { signedIn: saveVisit }),
      )
        .then(RoomJoining.join({ code, name, identity, saveVisit }).responds({ room, participant }))
        .then(respond({ room, participant })).named("member"),
    ), {
      ...options,
      input: { required: ["session", "code"], defaults: { name: "" } },
    });

const Reopen = endpoint("/rooms/reopen", ({ session, subject, account, visitor, room, participant, code }) =>
  receive({ session, room })
    .then(Sessioning.current({ session }).responds({ subject }))
    .then(
      where(compute(roomSubject, { subject }, { kind: "account", account, visitor: null }))
        .then(RoomJoining.reopen({ room, identity: account }).responds({ participant, code }))
        .then(respond({ room, participant, code })).named("account"),
      where(compute(roomSubject, { subject }, { kind: "guest", account: null, visitor }))
        .then(respond({ error: "FORBIDDEN" })).named("guest"),
    ), options);

const SavedRooms = former("saved rooms for an account", ({ account }, { room, lastActivityAt }) =>
  each(RoomJoining._history({ identity: account }).is({ room, lastActivityAt }))
    .form({ room, lastActivityAt }));

const History = endpoint("/rooms/history", ({ session, subject, account, visitor }) =>
  receive({ session })
    .then(Sessioning.current({ session }).responds({ subject }))
    .then(
      where(compute(roomSubject, { subject }, { kind: "account", account, visitor: null }))
        .then(respond({ rooms: SavedRooms({ account }) })).named("account"),
      where(compute(roomSubject, { subject }, { kind: "guest", account: null, visitor }))
        .then(respond({ error: "FORBIDDEN" })).named("guest"),
    ), options);

const RegisterAndClaim = endpoint(
  "/rooms/register-and-claim",
  ({ session, subject, visitor, participant, username, password, account, room, claimedParticipant, issuedSession, expiresAt }) =>
    receive({ session, participant, username, password })
      .then(Sessioning.current({ session }).responds({ subject }))
      .then(
        where(
          compute(roomSubject, { subject }, { kind: "guest", account: null, visitor }),
          RoomJoining._participant({ participant }).is({ identity: visitor }),
        )
          .then(Authenticating.register({ username, password }).responds({ account }))
          .then(RoomJoining.claimVisit({ participant, previousIdentity: subject, identity: account }).responds({ room, claimedParticipant }))
          .then(Sessioning.replace({ session, subject: account }).responds({ replacement: issuedSession, expiresAt }))
          .then(respond({ account, room, participant: claimedParticipant, issuedSession, expiresAt })).named("claim"),
        where(
          compute(roomSubject, { subject }, { kind: "guest", account: null, visitor }),
          no(RoomJoining._participant({ participant }).is({ identity: visitor })),
        ).then(respond({ error: "FORBIDDEN" })).named("foreign-visit"),
        where(compute(roomSubject, { subject }, { kind: "account", account, visitor: null }))
          .then(respond({ error: "FORBIDDEN" })).named("account"),
      ), options);

const SignInAndClaim = endpoint(
  "/rooms/sign-in-and-claim",
  ({ session, subject, visitor, participant, username, password, account, room, claimedParticipant, issuedSession, expiresAt }) =>
    receive({ session, participant, username, password })
      .then(Sessioning.current({ session }).responds({ subject }))
      .then(
        where(compute(roomSubject, { subject }, { kind: "guest", account: null, visitor }))
          .then(Authenticating.authenticate({ username, password }).responds({ account }))
          .then(RoomJoining.claimVisit({ participant, previousIdentity: subject, identity: account }).responds({ room, claimedParticipant }))
          .then(Sessioning.replace({ session, subject: account }).responds({ replacement: issuedSession, expiresAt }))
          .then(respond({ account, room, participant: claimedParticipant, issuedSession, expiresAt })).named("claim"),
        where(compute(roomSubject, { subject }, { kind: "account", account, visitor: null }))
          .then(respond({ error: "FORBIDDEN" })).named("account"),
      ), options);

export const RoomAccess = view(
  "a session's membership in a room",
  ({ room, participant, subject }, { owner, name, canonical }, { identity }) => where(
    compute(computations.watchIdentity, { subject }, identity),
    RoomJoining._participant({ participant }).is({ room, identity, owner, name, canonical }),
  ),
).optional();

export const OwnerAccess = view(
  "a room's owner",
  ({ room, participant, subject }, { name }) => where(
    RoomAccess({ room, participant, subject }).is({ owner: true, name }),
  ),
).optional();

export const EligibleSuccessor = view(
  "a present account member eligible to own a room",
  ({ room, participant }, { identity }) => where(
    RoomJoining._participant({ participant }).is({ room, identity, canonical: participant }),
    compute(computations.isAccountIdentity, { identity }, { signedIn: true }),
    Sessioning._presentSubjects({ scope: room, reusable: true }).is({ subject: participant }),
  ),
).optional();

const KeepPresent = endpoint(
  "/rooms/presence",
  ({ session, room, participant, connection, subject, canonical }) =>
    receive({ session, room, participant, connection })
      .then(Sessioning.current({ session }).responds({ subject }))
      .then(
        where(RoomAccess({ room, participant, subject }).is({ canonical }))
          .then(Sessioning.keepPresent({ scope: room, subject: canonical, connection, reusable: true }).responds({}))
          .then(respond({})).named("allowed"),
        where(no(RoomAccess({ room, participant, subject }).is({})))
          .then(respond({ error: "FORBIDDEN" })).named("denied"),
      ), options);

const Leave = endpoint(
  "/rooms/leave",
  ({ session, room, participant, connection, subject, canonical, drained }) =>
    receive({ session, room, participant, connection })
      .then(Sessioning.current({ session }).responds({ subject }))
      .then(
        where(RoomAccess({ room, participant, subject }).is({ canonical }))
          .then(Sessioning.leave({ scope: room, subject: canonical, connection, reusable: true }).responds({ drained }))
          .then(respond({})).named("allowed"),
        where(no(RoomAccess({ room, participant, subject }).is({})))
          .then(respond({ error: "FORBIDDEN" })).named("denied"),
      ), options);

const PresentOwner = view(
  "the owner present in a room",
  ({ room }, { participant }) => where(
    Sessioning._presentSubjects({ scope: room, reusable: true }).is({ subject: participant }),
    RoomJoining._participant({ participant }).is({ room, owner: true }),
  ),
).optional();

const OwnerlessWatch = view(
  "a live watch whose owner is absent",
  ({ room }, { stream }, { snapshot }) => where(
    no(PresentOwner({ room })),
    Streaming._stream({ scope: room }).is({ stream, snapshot }),
    compute(computations.watchLive, { snapshot }, { live: true }),
  ),
).optional();

const EndOwnerDeparture = reaction(({ scope, subject, stream }) =>
  when(Sessioning.leave({ scope, subject, reusable: true }).responds({}))
    .where(
      RoomJoining._participant({ participant: subject }).is({ room: scope, owner: true }),
      OwnerlessWatch({ room: scope }).is({ stream }),
    )
    .then(Streaming.end({ stream }).responds({}))
    .then(Sessioning.close({ scope }).responds({})),
);

const EndOwnerAbsence = reaction(({ scope, stream }) =>
  when(Sessioning.keepPresent({ scope, reusable: true }).responds({}))
    .where(OwnerlessWatch({ room: scope }).is({ stream }))
    .then(Streaming.end({ stream }).responds({}))
    .then(Sessioning.close({ scope }).responds({})),
);

const TransferOwnership = endpoint(
  "/rooms/transfer-ownership",
  ({ session, room, participant, successor, subject }) =>
    receive({ session, room, participant, successor })
      .then(Sessioning.current({ session }).responds({ subject }))
      .then(
        where(
          OwnerAccess({ room, participant, subject }).is({}),
          EligibleSuccessor({ room, participant: successor }).is({}),
        )
          .then(RoomJoining.transferOwnership({ room, actor: participant, successor }).responds({}))
          .then(respond({})).named("allowed"),
        where(
          OwnerAccess({ room, participant, subject }).is({}),
          no(EligibleSuccessor({ room, participant: successor }).is({})),
        ).then(respond({ error: "FORBIDDEN" })).named("ineligible"),
        where(no(OwnerAccess({ room, participant, subject }).is({})))
          .then(respond({ error: "FORBIDDEN" })).named("denied"),
      ),
  options,
);

export const composition = {
  Create, Join, Reopen, SavedRooms, History, RoomAccess, OwnerAccess, EligibleSuccessor,
  RegisterAndClaim, SignInAndClaim, KeepPresent, Leave, PresentOwner, OwnerlessWatch, EndOwnerDeparture, EndOwnerAbsence, TransferOwnership,
};
