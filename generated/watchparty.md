<!-- Generated from the WatchParty assembly. Do not edit. -->
<!-- Manifest producer: @mit-sdg/sync-engine@1.1.0; concept specification: sync-engine.concept-specification@1; renderer: @mit-sdg/sync-engine@1.1.0. -->

# WatchParty — assembled read-back

_Assembled by sync-engine from registered concepts and composition. Edit the concept_
_specifications and composition source, then regenerate this file._

## Concepts

### Authenticating

Defined in [Authenticating](../design/concepts/Authenticating.md), line 1.

#### Actions

- `register(username: String, password: String) : returns (account: Account)`
  - Refuses `INVALID_USERNAME`: A username must have 3 to 32 letters, digits, underscores, or hyphens.
  - Refuses `INVALID_PASSWORD`: A password must have 10 to 128 characters.
  - Refuses `USERNAME_TAKEN`: That username is taken.
- `authenticate(username: String, password: String) : returns (account: Account)`
  - Refuses `INVALID_CREDENTIALS`: The username or password is incorrect.

#### Queries

- `_username(account: Account) : optional (username: String)`

#### Instances

- `Authenticating` — instance of `Authenticating` — [Application types](../design/types.md), line 30.

### Discussing

Defined in [Discussing](../design/concepts/Discussing.md), line 1.

#### Actions

- `startThread(topic: Topic, author: Author, name: String, anchor: Anchor, text: String, context: Context) : returns (thread: Thread, message: Message, revision: Number)`
  - Refuses `INVALID_THREAD`: Enter an opening message.
- `reply(parent: Message, author: Author, name: String, text: String, context: Context) : returns (message: Message, revision: Number)`
  - Refuses `UNKNOWN_PARENT`: This message is unavailable.
  - Refuses `EMPTY_REPLY`: Enter a reply.

#### Queries

- `_topic(message: Message) : optional (topic: Topic)`
- `_discussion(topic: Topic) : one (discussion: DiscussionSnapshot)`

#### Instances

- `Discussing` — instance of `Discussing` — [Application types](../design/types.md), line 46.
  - `Anchor` is `PlaybackSeconds` — [Application types](../design/types.md), line 49.
  - `Author` is `RoomJoining.Participant` — [Application types](../design/types.md), line 48.
  - `Context` is `DiscussionContext` — [Application types](../design/types.md), line 50.
  - `Topic` is `Streaming.VideoEntry` — [Application types](../design/types.md), line 47.

### RoomJoining

Defined in [RoomJoining](../design/concepts/RoomJoining.md), line 1.

#### Actions

- `create(identity: Identity, name: String) : returns (room: Room, participant: Participant, code: String)`
  - Refuses `INVALID_OWNER_NAME`: Enter a display name of 1 to 32 characters.
- `join(code: String, name?: String, identity: Identity, saveVisit: Flag) : returns (room: Room, participant: Participant)`
  - Refuses `INVALID_ROOM_CODE`: This room code is invalid.
  - Refuses `INVALID_JOIN_NAME`: Enter a display name of 1 to 32 characters.
- `claimVisit(participant: Participant, previousIdentity: Identity, identity: Identity) : returns (room: Room, claimedParticipant: Participant)`
  - Refuses `VISIT_NOT_CLAIMABLE`: This visit cannot be claimed by that identity.
- `transferOwnership(room: Room, actor: Participant, successor: Participant) : returns ()`
  - Refuses `OWNERSHIP_TRANSFER_UNAVAILABLE`: Only the owner can transfer to a room member.
- `reopen(room: Room, identity: Identity) : returns (participant: Participant, code: String)`
  - Refuses `NO_SAVED_VISIT`: This room is not saved for this identity.
- `recordActivity(room: Room, identity: Identity) : returns (participant: Participant)`
  - Refuses `NO_SAVED_VISIT`: This room is not saved for this identity.

#### Queries

- `_savedVisit(room: Room, identity: Identity) : optional (lastActivityAt: DateTime)`
- `_participant(participant: Participant) : optional (room: Room, name: String, identity: Identity, owner: Flag, canonical: Participant)`
- `_ownershipCandidates(room: Room) : many (participant: Participant, name: String, identity: Identity)`
- `_history(identity: Identity) : many (room: Room, participant: Participant, lastActivityAt: DateTime, lastJoinedAt: LastJoinTime, owner: Flag)`

#### Instances

- `RoomJoining` — instance of `RoomJoining` — [Application types](../design/types.md), line 38.
  - `Identity` is `SessionSubject` — [Application types](../design/types.md), line 39.

### Sessioning

Defined in [Sessioning](../design/concepts/Sessioning.md), line 1.

#### Actions

- `start(subject: Subject) : returns (session: Session, expiresAt: DateTime)`
- `current(session: Session) : returns (subject: Subject)`
  - Refuses `CURRENT_NOT_SIGNED_IN`: Your session has ended. Sign in again.
- `replace(session: Session, subject: Subject) : returns (replacement: Session, expiresAt: DateTime)`
  - Refuses `REPLACE_NOT_SIGNED_IN`: Your session has ended. Sign in again.
- `end(session: Session) : returns (session: Session)`
  - Refuses `END_NOT_SIGNED_IN`: Your session has ended. Sign in again.
- `keepPresent(scope: Scope, subject: PresenceSubject, connection: Connection, reusable?: Flag) : returns ()`
  - Refuses `PRESENCE_UNAVAILABLE`: This connection cannot join the presence group.
- `leave(scope: Scope, subject: PresenceSubject, connection: Connection, reusable?: Flag) : returns (drained: Flag)`
  - Refuses `LEAVE_NOT_OWNER`: This connection belongs to another subject.
- `expirePresence(scope: Scope) : returns (drained: Flag)`
- `close(scope: Scope) : returns ()`

#### Queries

- `_active(session: Session) : optional (subject: Subject, expiresAt: DateTime)`
- `_presentSubjects(scope: Scope, reusable?: Flag) : many (subject: PresenceSubject)`
- `_connectionPresence(scope: Scope, subject: PresenceSubject, connection?: Connection) : one (present: Flag)`
- `_due() : many (scope: Scope)`

#### Instances

- `Sessioning` — instance of `Sessioning` — [Application types](../design/types.md), line 32.
  - `Connection` is `PlayerConnection` — [Application types](../design/types.md), line 36.
  - `PresenceSubject` is `RoomJoining.Participant` — [Application types](../design/types.md), line 35.
  - `Scope` is `RoomJoining.Room` — [Application types](../design/types.md), line 34.
  - `Subject` is `SessionSubject` — [Application types](../design/types.md), line 33.

### Streaming

Defined in [Streaming](../design/concepts/Streaming.md), line 1.

#### Actions

- `open(scope: Scope) : returns (stream: Stream)`
- `addVideo(stream: Stream, source: Media) : returns (entry: VideoEntry, revision: Number)`
  - Refuses `ADD_VIDEO_UNAVAILABLE`: This room cannot accept another video.
- `start(stream: Stream, entry: VideoEntry) : returns (revision: Number)`
  - Refuses `VIDEO_UNAVAILABLE`: This room cannot start another live watch.
- `switchVideo(stream: Stream, entry: VideoEntry) : returns (revision: Number)`
  - Refuses `VIDEO_UNAVAILABLE`: This video cannot be selected for the live watch.
- `control(stream: Stream, viewer: Viewer, command: PlaybackCommand) : returns (revision: Number, changed: Flag)`
  - Refuses `CONTROL_UNAVAILABLE`: This player cannot control the live watch.
  - Refuses `INVALID_SEEK`: Choose a valid playback position.
  - Refuses `STALE_PLAYBACK`: Playback changed. Try again from the current position.
- `end(stream: Stream) : returns (ended: Flag)`
  - Refuses `UNKNOWN_STREAM`: This watch does not exist.
  - Refuses `VIDEO_UNAVAILABLE`: There is no live watch to end.

#### Queries

- `_stream(scope: Scope) : optional (stream: Stream, snapshot: WatchSnapshot, entries: VideoList)`
- `_discussionEntry(scope: Scope, entry: VideoEntry) : optional (live: Flag, source: Media)`
- `_historyWatch(scope: Scope) : one (watch: WatchHistory)`
- `_controlsAfter(stream: Stream, afterRevision: Number, throughRevision: Number) : many (viewer: Viewer, event: ControlEvent)`

#### Instances

- `Streaming` — instance of `Streaming` — [Application types](../design/types.md), line 41.
  - `Media` is `MediaSource` — [Application types](../design/types.md), line 44.
  - `Scope` is `RoomJoining.Room` — [Application types](../design/types.md), line 42.
  - `Viewer` is `RoomJoining.Participant` — [Application types](../design/types.md), line 43.

### Summarizing

Defined in [Summarizing](../design/concepts/Summarizing.md), line 1.

#### Actions

- `summarize(topic: Topic, sourceRevision: Number, source: Source) : returns (summary: Summary)`
  - Refuses `EMPTY_SOURCE`: There is no source material to summarize.
  - Refuses `SUMMARY_UNAVAILABLE`: Could not generate a summary. Try again.

#### Queries

- `_saved(topic: Topic) : one (summary: Summary)`

#### Instances

- `Summarizing` — instance of `Summarizing` — [Application types](../design/types.md), line 52.
  - `Content` is `LectureSummary` — [Application types](../design/types.md), line 55.
  - `Source` is `LectureSource` — [Application types](../design/types.md), line 54.
  - `Topic` is `Streaming.VideoEntry` — [Application types](../design/types.md), line 53.

## Application types

Concrete types:

- `DiscussionContext` — [Application types](../design/types.md), line 22.
- `LectureSource` — [Application types](../design/types.md), line 13.
- `LectureSummary` — [Application types](../design/types.md), line 16.
- `MediaSource` — [Application types](../design/types.md), line 10.
- `PlaybackSeconds` — [Application types](../design/types.md), line 19.
- `PlayerConnection` — [Application types](../design/types.md), line 7.
- `SessionSubject` — [Application types](../design/types.md), line 25.

## Computations

- `accountSubject(account: Account) : SessionSubject` — [Accounts](../design/compositions/Accounts.md), line 33.
- `discussionMode(entryLive: Flag, connection?: PlayerConnection, present: Flag) : (context: DiscussionContext, writable: Flag)` — [Discussion](../design/compositions/Discussion.md), line 39.
- `discussionRevision(discussion: Discussing.DiscussionSnapshot) : Number` — [Summaries](../design/compositions/Summaries.md), line 29.
- `guestSubject() : SessionSubject` — [Accounts](../design/compositions/Accounts.md), line 30.
- `identifySubject(subject: SessionSubject) : SessionIdentity` — [Accounts](../design/compositions/Accounts.md), line 36.
- `isAccountIdentity(identity: SessionSubject) : (signedIn: Flag)` — [Rooms](../design/compositions/Rooms.md), line 81.
- `playbackCommand(entry: Streaming.VideoEntry, expectedRevision: Number, operation: String, position?: Number, offset?: Number) : Streaming.PlaybackCommand` — [Watch](../design/compositions/Watch.md), line 101.
- `roomSubject(subject: SessionSubject) : RoomIdentity` — [Rooms](../design/compositions/Rooms.md), line 84.
- `summarySource(discussion: Discussing.DiscussionSnapshot, media: MediaSource) : (sourceRevision: Number, source: LectureSource)` — [Summaries](../design/compositions/Summaries.md), line 26.
- `watchIdentity(subject: SessionSubject) : SessionSubject` — [Rooms](../design/compositions/Rooms.md), line 78.
- `watchLive(snapshot: Streaming.WatchSnapshot) : (live: Flag)` — [Watch](../design/compositions/Watch.md), line 95.
- `watchRevision(snapshot: Streaming.WatchSnapshot) : Number` — [Watch](../design/compositions/Watch.md), line 98.
- `youtubeSource(videoId: String, previewTitle?: String) : MediaSource` — [Watch](../design/compositions/Watch.md), line 92.

## Views

_Views name reusable conditions. Multiple `where` blocks are alternatives._

### the owner present in a room

Authored path: `Rooms.PresentOwner`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 63.

```view
the owner present in a room — inputs (room); outputs (participant); bindings () — answers at most one (participant)
  where
    Sessioning._presentSubjects (reusable: true, scope: room) has (subject: participant)
    RoomJoining._participant (participant) has (owner: true, room)
```

### a live watch whose owner is absent

Authored path: `Rooms.OwnerlessWatch`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 64.

```view
a live watch whose owner is absent — inputs (room); outputs (stream); bindings (snapshot) — answers at most one (stream)
  where
    no view "the owner present in a room" with (room)
    Streaming._stream (scope: room) has (snapshot, stream)
    (live: true) is watchLive (snapshot)
```

### a session's membership in a room

Authored path: `Rooms.RoomAccess`.
- Covered by [Discussion](../design/compositions/Discussion.md), line 4.
- Covered by [Rooms](../design/compositions/Rooms.md), line 49.
- Covered by [Watch](../design/compositions/Watch.md), line 4.
- Covered by [Watch](../design/compositions/Watch.md), line 12.

```view
a session's membership in a room — inputs (room, participant, subject); outputs (owner, name, canonical); bindings (identity) — answers at most one (owner, name, canonical)
  where
    identity is watchIdentity (subject)
    RoomJoining._participant (participant) has (canonical, identity, name, owner, room)
```

### a member's watch

Authored path: `Watch.WatchAccess`.
- Covered by [Watch](../design/compositions/Watch.md), line 13.

```view
a member's watch — inputs (room, participant, subject); outputs (stream, isOwner, live); bindings (snapshot) — answers at most one (stream, isOwner, live)
  where
    view "a session's membership in a room" with (participant, room, subject) has (owner: isOwner)
    Streaming._stream (scope: room) has (snapshot, stream)
    (live) is watchLive (snapshot)
```

### a present account member eligible to own a room

Authored path: `Rooms.EligibleSuccessor`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 68.

```view
a present account member eligible to own a room — inputs (room, participant); outputs (identity); bindings () — answers at most one (identity)
  where
    RoomJoining._participant (participant) has (canonical: participant, identity, room)
    (signedIn: true) is isAccountIdentity (identity)
    Sessioning._presentSubjects (reusable: true, scope: room) has (subject: participant)
```

### a room member's video entry

Authored path: `Discussion.VideoAccess`.
- Covered by [Discussion](../design/compositions/Discussion.md), line 3.
- Covered by [Summaries](../design/compositions/Summaries.md), line 4.

```view
a room member's video entry — inputs (room, participant, subject, entry); outputs (name, live, source); bindings () — answers at most one (name, live, source)
  where
    view "a session's membership in a room" with (participant, room, subject) has (name)
    Streaming._discussionEntry (entry, scope: room) has (live, source)
```

### an entry's discussion mode for this player

Authored path: `Discussion.PostAccess`.
- Covered by [Discussion](../design/compositions/Discussion.md), line 23.

```view
an entry's discussion mode for this player — inputs (room, participant, subject, entry, connection); outputs (name, context, writable); bindings (entryLive, present) — answers at most one (name, context, writable)
  where
    view "a room member's video entry" with (entry, participant, room, subject) has (live: entryLive, name)
    Sessioning._connectionPresence (connection, scope: room, subject: participant) has (present)
    (context, writable) is discussionMode (connection, entryLive, present)
```

### a room member's reply target

Authored path: `Discussion.ReplyAccess`.
- Covered by [Discussion](../design/compositions/Discussion.md), line 21.

```view
a room member's reply target — inputs (room, participant, subject, parent, connection); outputs (name, context, writable); bindings (entry) — answers at most one (name, context, writable)
  where
    Discussing._topic (message: parent) has (topic: entry)
    view "an entry's discussion mode for this player" with (connection, entry, participant, room, subject) has (context, name, writable)
```

### a room's owner

Authored path: `Rooms.OwnerAccess`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 51.
- Covered by [Watch](../design/compositions/Watch.md), line 46.

```view
a room's owner — inputs (room, participant, subject); outputs (name); bindings () — answers at most one (name)
  where view "a session's membership in a room" with (participant, room, subject) has (name, owner: true)
```

### an owner's watch

Authored path: `Watch.OwnerWatchAccess`.
- Covered by [Watch](../design/compositions/Watch.md), line 14.

```view
an owner's watch — inputs (room, participant, subject); outputs (stream); bindings () — answers at most one (stream)
  where
    view "a room's owner" with (participant, room, subject)
    Streaming._stream (scope: room) has (stream)
```

## Formers

_Formers name result shapes evaluated when asked. The source former owns_
_the authored explanation; this section records the generated shape._

### saved rooms for an account

Authored path: `Rooms.SavedRooms`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 42.

```former
Former "saved rooms for an account" — inputs (account); bindings (room, lastActivityAt); promises exactly one record — forms:
  each RoomJoining._history (identity: account) has (lastActivityAt, room)
    form a record of
      lastActivityAt
      room
```

### shared state and viewers in a watch

Authored path: `Watch.WatchState`.
- Covered by [Watch](../design/compositions/Watch.md), line 16.

```former
Former "shared state and viewers in a watch" — inputs (room, stream, afterRevision); bindings (snapshot, entries, member, memberName, memberOwner, viewer, name, owner, candidate, candidateName, candidateIdentity, event, snapshotRevision); promises exactly one record — forms:
  a record of
    where Streaming._stream (scope: room) has (entries, snapshot, stream)
    where snapshotRevision is watchRevision (snapshot)
    controls: each Streaming._controlsAfter (afterRevision, stream, throughRevision: snapshotRevision) has (event, viewer)
      where RoomJoining._participant (participant: viewer) has (name, room)
      form a record of
        event
        name
        viewer
    entries
    ownershipCandidates: each RoomJoining._ownershipCandidates (room) has (identity: candidateIdentity, name: candidateName, participant: candidate)
      where view "a present account member eligible to own a room" with (participant: candidate, room)
      form a record of
        name: candidateName
        participant: candidate
    participants: each Sessioning._presentSubjects (reusable: true, scope: room) has (subject: member)
      where RoomJoining._participant (participant: member) has (name: memberName, owner: memberOwner, room)
      form a record of
        name: memberName
        owner: memberOwner
        participant: member
    snapshot
    viewers: each Sessioning._presentSubjects (scope: room) has (subject: viewer)
      where RoomJoining._participant (participant: viewer) has (name, owner, room)
      form a record of
        name
        owner
        viewer
```

### watch history for an account

Authored path: `Watch.SavedWatches`.
- Covered by [Watch](../design/compositions/Watch.md), line 80.

```former
Former "watch history for an account" — inputs (account); bindings (room, participant, lastActivityAt, lastJoinedAt, owner, watch); promises exactly one record — forms:
  each RoomJoining._history (identity: account) has (lastActivityAt, lastJoinedAt, owner, participant, room)
    where Streaming._historyWatch (scope: room) has (watch)
    form a record of
      lastActivityAt
      lastJoinedAt
      owner
      participant
      room
      watch
```

## Reactions

### Accounts.Me

Authored path: `Accounts.Me`.
- Covered by [Accounts](../design/compositions/Accounts.md), line 12.
- Covered by [Accounts](../design/compositions/Accounts.md), line 25.

```reaction
when RequestBoundary.request (path: "/auth/me", requestId, session)
then
  Sessioning.current (session)
```

### Accounts.Me:account#2

Authored path: `Accounts.Me`.
- Covered by [Accounts](../design/compositions/Accounts.md), line 12.
- Covered by [Accounts](../design/compositions/Accounts.md), line 25.

```reaction
when Sessioning.current (session, subject), asked by Accounts.Me
where
  (account, kind: "account") is identifySubject (subject)
  Authenticating._username (account) has (username)
  earlier, RequestBoundary.request (path: "/auth/me", requestId, session)
then
  RequestBoundary.respond (account, kind: "account", requestId, username)
```

### Accounts.Me:guest#2

Authored path: `Accounts.Me`.
- Covered by [Accounts](../design/compositions/Accounts.md), line 12.
- Covered by [Accounts](../design/compositions/Accounts.md), line 25.

```reaction
when Sessioning.current (session, subject), asked by Accounts.Me
where
  (account: null, kind: "guest") is identifySubject (subject)
  earlier, RequestBoundary.request (path: "/auth/me", requestId, session)
then
  RequestBoundary.respond (kind: "guest", requestId)
```

### Accounts.Register

Authored path: `Accounts.Register`.
- Covered by [Accounts](../design/compositions/Accounts.md), line 7.
- Covered by [Accounts](../design/compositions/Accounts.md), line 23.

```reaction
when RequestBoundary.request (password, path: "/auth/register", requestId, session, username)
then
  Authenticating.register (password, username)
```

### Accounts.Register:replace#2

Authored path: `Accounts.Register`.
- Covered by [Accounts](../design/compositions/Accounts.md), line 7.
- Covered by [Accounts](../design/compositions/Accounts.md), line 23.

```reaction
when Authenticating.register (password, username, account), asked by Accounts.Register
where
  subject is accountSubject (account)
  earlier, RequestBoundary.request (password, path: "/auth/register", requestId, session, username)
  Sessioning._active (session)
then
  Sessioning.replace (session, subject)
```

### Accounts.Register:replace#3

Authored path: `Accounts.Register`.
- Covered by [Accounts](../design/compositions/Accounts.md), line 7.
- Covered by [Accounts](../design/compositions/Accounts.md), line 23.

```reaction
when Sessioning.replace (session, subject, expiresAt, replacement: issuedSession), asked by Accounts.Register:replace#2
where
  earlier, Authenticating.register (password, username, account), asked by Accounts.Register
  earlier, RequestBoundary.request (password, path: "/auth/register", requestId, session, username)
then
  RequestBoundary.respond (account, expiresAt, issuedSession, requestId)
```

### Accounts.Register:start#2

Authored path: `Accounts.Register`.
- Covered by [Accounts](../design/compositions/Accounts.md), line 7.
- Covered by [Accounts](../design/compositions/Accounts.md), line 23.

```reaction
when Authenticating.register (password, username, account), asked by Accounts.Register
where
  subject is accountSubject (account)
  earlier, RequestBoundary.request (password, path: "/auth/register", requestId, session, username)
  no Sessioning._active (session)
then
  Sessioning.start (subject)
```

### Accounts.Register:start#3

Authored path: `Accounts.Register`.
- Covered by [Accounts](../design/compositions/Accounts.md), line 7.
- Covered by [Accounts](../design/compositions/Accounts.md), line 23.

```reaction
when Sessioning.start (subject, expiresAt, session: issuedSession), asked by Accounts.Register:start#2
where
  earlier, Authenticating.register (password, username, account), asked by Accounts.Register
  earlier, RequestBoundary.request (password, path: "/auth/register", requestId, session, username)
then
  RequestBoundary.respond (account, expiresAt, issuedSession, requestId)
```

### Accounts.SignIn

Authored path: `Accounts.SignIn`.
- Covered by [Accounts](../design/compositions/Accounts.md), line 8.
- Covered by [Accounts](../design/compositions/Accounts.md), line 24.

```reaction
when RequestBoundary.request (password, path: "/auth/login", requestId, session, username)
then
  Authenticating.authenticate (password, username)
```

### Accounts.SignIn:replace#2

Authored path: `Accounts.SignIn`.
- Covered by [Accounts](../design/compositions/Accounts.md), line 8.
- Covered by [Accounts](../design/compositions/Accounts.md), line 24.

```reaction
when Authenticating.authenticate (password, username, account), asked by Accounts.SignIn
where
  subject is accountSubject (account)
  earlier, RequestBoundary.request (password, path: "/auth/login", requestId, session, username)
  Sessioning._active (session)
then
  Sessioning.replace (session, subject)
```

### Accounts.SignIn:replace#3

Authored path: `Accounts.SignIn`.
- Covered by [Accounts](../design/compositions/Accounts.md), line 8.
- Covered by [Accounts](../design/compositions/Accounts.md), line 24.

```reaction
when Sessioning.replace (session, subject, expiresAt, replacement: issuedSession), asked by Accounts.SignIn:replace#2
where
  earlier, Authenticating.authenticate (password, username, account), asked by Accounts.SignIn
  earlier, RequestBoundary.request (password, path: "/auth/login", requestId, session, username)
then
  RequestBoundary.respond (account, expiresAt, issuedSession, requestId)
```

### Accounts.SignIn:start#2

Authored path: `Accounts.SignIn`.
- Covered by [Accounts](../design/compositions/Accounts.md), line 8.
- Covered by [Accounts](../design/compositions/Accounts.md), line 24.

```reaction
when Authenticating.authenticate (password, username, account), asked by Accounts.SignIn
where
  subject is accountSubject (account)
  earlier, RequestBoundary.request (password, path: "/auth/login", requestId, session, username)
  no Sessioning._active (session)
then
  Sessioning.start (subject)
```

### Accounts.SignIn:start#3

Authored path: `Accounts.SignIn`.
- Covered by [Accounts](../design/compositions/Accounts.md), line 8.
- Covered by [Accounts](../design/compositions/Accounts.md), line 24.

```reaction
when Sessioning.start (subject, expiresAt, session: issuedSession), asked by Accounts.SignIn:start#2
where
  earlier, Authenticating.authenticate (password, username, account), asked by Accounts.SignIn
  earlier, RequestBoundary.request (password, path: "/auth/login", requestId, session, username)
then
  RequestBoundary.respond (account, expiresAt, issuedSession, requestId)
```

### Accounts.SignOut

Authored path: `Accounts.SignOut`.
- Covered by [Accounts](../design/compositions/Accounts.md), line 14.
- Covered by [Accounts](../design/compositions/Accounts.md), line 26.

```reaction
when RequestBoundary.request (path: "/auth/logout", requestId, session)
then
  Sessioning.end (session)
```

### Accounts.SignOut#2

Authored path: `Accounts.SignOut`.
- Covered by [Accounts](../design/compositions/Accounts.md), line 14.
- Covered by [Accounts](../design/compositions/Accounts.md), line 26.

```reaction
when Sessioning.end (session), asked by Accounts.SignOut
where
  earlier, RequestBoundary.request (path: "/auth/logout", requestId, session)
then
  RequestBoundary.respond (requestId)
```

### Accounts.StartGuest:existing

Authored path: `Accounts.StartGuest`.
- Covered by [Accounts](../design/compositions/Accounts.md), line 3.
- Covered by [Accounts](../design/compositions/Accounts.md), line 22.

```reaction
when RequestBoundary.request (path: "/auth/guest", requestId, session)
where
  Sessioning._active (session) has (expiresAt)
then
  RequestBoundary.respond (expiresAt, issuedSession: session, requestId)
```

### Accounts.StartGuest:fresh

Authored path: `Accounts.StartGuest`.
- Covered by [Accounts](../design/compositions/Accounts.md), line 3.
- Covered by [Accounts](../design/compositions/Accounts.md), line 22.

```reaction
when RequestBoundary.request (path: "/auth/guest", requestId, session)
where
  no Sessioning._active (session)
  subject is guestSubject
then
  Sessioning.start (subject)
```

### Accounts.StartGuest:fresh#2

Authored path: `Accounts.StartGuest`.
- Covered by [Accounts](../design/compositions/Accounts.md), line 3.
- Covered by [Accounts](../design/compositions/Accounts.md), line 22.

```reaction
when Sessioning.start (subject, expiresAt, session: issuedSession), asked by Accounts.StartGuest:fresh
where
  earlier, RequestBoundary.request (path: "/auth/guest", requestId, session)
then
  RequestBoundary.respond (expiresAt, issuedSession, requestId)
```

### DeliverFaultToAsker

```reaction
when any action is faulted, not asked by DeliverFaultToAsker
where
  earlier, RequestBoundary.request (requestId)
then
  RequestBoundary.respondFramework (error: "INTERNAL_ERROR", requestId)
```

### DeliverRefusalToAsker

```reaction
when any action is refused (message), except RequestBoundary
where
  earlier, RequestBoundary.request (requestId)
then
  RequestBoundary.respond (error: message, requestId)
```

### Discussion.Read

Authored path: `Discussion.Read`.
- Covered by [Discussion](../design/compositions/Discussion.md), line 8.
- Covered by [Discussion](../design/compositions/Discussion.md), line 15.

```reaction
when RequestBoundary.request (entry, participant, path: "/discussion/read", requestId, room, session)
then
  Sessioning.current (session)
```

### Discussion.Read:allowed#2

Authored path: `Discussion.Read`.
- Covered by [Discussion](../design/compositions/Discussion.md), line 8.
- Covered by [Discussion](../design/compositions/Discussion.md), line 15.

```reaction
when Sessioning.current (session, subject), asked by Discussion.Read
where
  earlier, RequestBoundary.request (entry, participant, path: "/discussion/read", requestId, room, session)
  view "a room member's video entry" with (entry, participant, room, subject)
  Discussing._discussion (topic: entry) has (discussion)
then
  RequestBoundary.respond (discussion, requestId)
```

### Discussion.Read:denied#2

Authored path: `Discussion.Read`.
- Covered by [Discussion](../design/compositions/Discussion.md), line 8.
- Covered by [Discussion](../design/compositions/Discussion.md), line 15.

```reaction
when Sessioning.current (session, subject), asked by Discussion.Read
where
  earlier, RequestBoundary.request (entry, participant, path: "/discussion/read", requestId, room, session)
  no view "a room member's video entry" with (entry, participant, room, subject)
then
  RequestBoundary.respond (error: "FORBIDDEN", requestId)
```

### Discussion.Reply

Authored path: `Discussion.Reply`.
- Covered by [Discussion](../design/compositions/Discussion.md), line 20.
- Covered by [Discussion](../design/compositions/Discussion.md), line 34.

```reaction
when RequestBoundary.request (connection, parent, participant, path: "/discussion/reply", requestId, room, session, text)
then
  Sessioning.current (session)
```

### Discussion.Reply:allowed#2

Authored path: `Discussion.Reply`.
- Covered by [Discussion](../design/compositions/Discussion.md), line 20.
- Covered by [Discussion](../design/compositions/Discussion.md), line 34.

```reaction
when Sessioning.current (session, subject), asked by Discussion.Reply
where
  earlier, RequestBoundary.request (connection, parent, participant, path: "/discussion/reply", requestId, room, session, text)
  view "a room member's reply target" with (connection, parent, participant, room, subject) has (context, name, writable: true)
then
  Discussing.reply (author: participant, context, name, parent, text)
```

### Discussion.Reply:allowed#3

Authored path: `Discussion.Reply`.
- Covered by [Discussion](../design/compositions/Discussion.md), line 20.
- Covered by [Discussion](../design/compositions/Discussion.md), line 34.

```reaction
when Discussing.reply (author: participant, context, name, parent, text, message, revision), asked by Discussion.Reply:allowed#2
where
  earlier, RequestBoundary.request (connection, parent, participant, path: "/discussion/reply", requestId, room, session, text)
then
  RequestBoundary.respond (context, message, requestId, revision)
```

### Discussion.Reply:denied#2

Authored path: `Discussion.Reply`.
- Covered by [Discussion](../design/compositions/Discussion.md), line 20.
- Covered by [Discussion](../design/compositions/Discussion.md), line 34.

```reaction
when Sessioning.current (session, subject), asked by Discussion.Reply
where
  earlier, RequestBoundary.request (connection, parent, participant, path: "/discussion/reply", requestId, room, session, text)
  no view "a room member's reply target" with (connection, parent, participant, room, subject)
then
  RequestBoundary.respond (error: "FORBIDDEN", requestId)
```

### Discussion.Reply:stale#2

Authored path: `Discussion.Reply`.
- Covered by [Discussion](../design/compositions/Discussion.md), line 20.
- Covered by [Discussion](../design/compositions/Discussion.md), line 34.

```reaction
when Sessioning.current (session, subject), asked by Discussion.Reply
where
  earlier, RequestBoundary.request (connection, parent, participant, path: "/discussion/reply", requestId, room, session, text)
  view "a room member's reply target" with (connection, parent, participant, room, subject) has (writable: false)
then
  RequestBoundary.respond (error: "DISCUSSION_ENTRY_CHANGED", requestId)
```

### Discussion.SaveReplyActivity

Authored path: `Discussion.SaveReplyActivity`.
- Covered by [Discussion](../design/compositions/Discussion.md), line 29.

```reaction
when Discussing.reply (author)
where
  RoomJoining._participant (participant: author) has (identity, room)
  (signedIn: true) is isAccountIdentity (identity)
  RoomJoining._savedVisit (identity, room)
then
  RoomJoining.recordActivity (identity, room)
```

### Discussion.SaveThreadActivity

Authored path: `Discussion.SaveThreadActivity`.
- Covered by [Discussion](../design/compositions/Discussion.md), line 28.

```reaction
when Discussing.startThread (author)
where
  RoomJoining._participant (participant: author) has (identity, room)
  (signedIn: true) is isAccountIdentity (identity)
  RoomJoining._savedVisit (identity, room)
then
  RoomJoining.recordActivity (identity, room)
```

### Discussion.StartThread

Authored path: `Discussion.StartThread`.
- Covered by [Discussion](../design/compositions/Discussion.md), line 18.
- Covered by [Discussion](../design/compositions/Discussion.md), line 33.

```reaction
when RequestBoundary.request (connection, entry, participant, path: "/discussion/start-thread", position, requestId, room, session, text)
then
  Sessioning.current (session)
```

### Discussion.StartThread:allowed#2

Authored path: `Discussion.StartThread`.
- Covered by [Discussion](../design/compositions/Discussion.md), line 18.
- Covered by [Discussion](../design/compositions/Discussion.md), line 33.

```reaction
when Sessioning.current (session, subject), asked by Discussion.StartThread
where
  earlier, RequestBoundary.request (connection, entry, participant, path: "/discussion/start-thread", position, requestId, room, session, text)
  view "an entry's discussion mode for this player" with (connection, entry, participant, room, subject) has (context, name, writable: true)
then
  Discussing.startThread (anchor: position, author: participant, context, name, text, topic: entry)
```

### Discussion.StartThread:allowed#3

Authored path: `Discussion.StartThread`.
- Covered by [Discussion](../design/compositions/Discussion.md), line 18.
- Covered by [Discussion](../design/compositions/Discussion.md), line 33.

```reaction
when Discussing.startThread (anchor: position, author: participant, context, name, text, topic: entry, message, revision, thread), asked by Discussion.StartThread:allowed#2
where
  earlier, RequestBoundary.request (connection, entry, participant, path: "/discussion/start-thread", position, requestId, room, session, text)
then
  RequestBoundary.respond (context, message, requestId, revision, thread)
```

### Discussion.StartThread:denied#2

Authored path: `Discussion.StartThread`.
- Covered by [Discussion](../design/compositions/Discussion.md), line 18.
- Covered by [Discussion](../design/compositions/Discussion.md), line 33.

```reaction
when Sessioning.current (session, subject), asked by Discussion.StartThread
where
  earlier, RequestBoundary.request (connection, entry, participant, path: "/discussion/start-thread", position, requestId, room, session, text)
  no view "an entry's discussion mode for this player" with (connection, entry, participant, room, subject)
then
  RequestBoundary.respond (error: "FORBIDDEN", requestId)
```

### Discussion.StartThread:stale#2

Authored path: `Discussion.StartThread`.
- Covered by [Discussion](../design/compositions/Discussion.md), line 18.
- Covered by [Discussion](../design/compositions/Discussion.md), line 33.

```reaction
when Sessioning.current (session, subject), asked by Discussion.StartThread
where
  earlier, RequestBoundary.request (connection, entry, participant, path: "/discussion/start-thread", position, requestId, room, session, text)
  view "an entry's discussion mode for this player" with (connection, entry, participant, room, subject) has (writable: false)
then
  RequestBoundary.respond (error: "DISCUSSION_ENTRY_CHANGED", requestId)
```

### Rooms.Create

Authored path: `Rooms.Create`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 3.
- Covered by [Rooms](../design/compositions/Rooms.md), line 16.

```reaction
when RequestBoundary.request (name, path: "/rooms/create", requestId, session)
then
  Sessioning.current (session)
```

### Rooms.Create:account#2

Authored path: `Rooms.Create`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 3.
- Covered by [Rooms](../design/compositions/Rooms.md), line 16.

```reaction
when Sessioning.current (session, subject), asked by Rooms.Create
where
  (account, kind: "account", visitor: null) is roomSubject (subject)
  earlier, RequestBoundary.request (name, path: "/rooms/create", requestId, session)
then
  RoomJoining.create (identity: account, name)
```

### Rooms.Create:account#3

Authored path: `Rooms.Create`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 3.
- Covered by [Rooms](../design/compositions/Rooms.md), line 16.

```reaction
when RoomJoining.create (identity: account, name, code, participant, room), asked by Rooms.Create:account#2
where
  earlier, RequestBoundary.request (name, path: "/rooms/create", requestId, session)
then
  RequestBoundary.respond (code, participant, requestId, room)
```

### Rooms.Create:guest#2

Authored path: `Rooms.Create`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 3.
- Covered by [Rooms](../design/compositions/Rooms.md), line 16.

```reaction
when Sessioning.current (session, subject), asked by Rooms.Create
where
  (account: null, kind: "guest", visitor) is roomSubject (subject)
  earlier, RequestBoundary.request (name, path: "/rooms/create", requestId, session)
then
  RequestBoundary.respond (error: "FORBIDDEN", requestId)
```

### Rooms.EndOwnerAbsence

Authored path: `Rooms.EndOwnerAbsence`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 60.

```reaction
when Sessioning.keepPresent (reusable: true, scope)
where
  view "a live watch whose owner is absent" with (room: scope) has (stream)
then
  Streaming.end (stream)
```

### Rooms.EndOwnerAbsence#2

Authored path: `Rooms.EndOwnerAbsence`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 60.

```reaction
when Streaming.end (stream), asked by Rooms.EndOwnerAbsence
where
  earlier, Sessioning.keepPresent (reusable: true, scope)
then
  Sessioning.close (scope)
```

### Rooms.EndOwnerDeparture

Authored path: `Rooms.EndOwnerDeparture`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 58.

```reaction
when Sessioning.leave (reusable: true, scope, subject)
where
  RoomJoining._participant (participant: subject) has (owner: true, room: scope)
  view "a live watch whose owner is absent" with (room: scope) has (stream)
then
  Streaming.end (stream)
```

### Rooms.EndOwnerDeparture#2

Authored path: `Rooms.EndOwnerDeparture`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 58.

```reaction
when Streaming.end (stream), asked by Rooms.EndOwnerDeparture
where
  earlier, Sessioning.leave (reusable: true, scope, subject)
then
  Sessioning.close (scope)
```

### Rooms.History

Authored path: `Rooms.History`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 41.
- Covered by [Rooms](../design/compositions/Rooms.md), line 46.

```reaction
when RequestBoundary.request (path: "/rooms/history", requestId, session)
then
  Sessioning.current (session)
```

### Rooms.History:account#2

Authored path: `Rooms.History`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 41.
- Covered by [Rooms](../design/compositions/Rooms.md), line 46.

```reaction
when Sessioning.current (session, subject), asked by Rooms.History
where
  (account, kind: "account", visitor: null) is roomSubject (subject)
  earlier, RequestBoundary.request (path: "/rooms/history", requestId, session)
then
  RequestBoundary.respond (requestId, rooms: former "saved rooms for an account" with (account))
```

### Rooms.History:guest#2

Authored path: `Rooms.History`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 41.
- Covered by [Rooms](../design/compositions/Rooms.md), line 46.

```reaction
when Sessioning.current (session, subject), asked by Rooms.History
where
  (account: null, kind: "guest", visitor) is roomSubject (subject)
  earlier, RequestBoundary.request (path: "/rooms/history", requestId, session)
then
  RequestBoundary.respond (error: "FORBIDDEN", requestId)
```

### Rooms.Join

Authored path: `Rooms.Join`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 7.
- Covered by [Rooms](../design/compositions/Rooms.md), line 17.

```reaction
when RequestBoundary.request (code, name, path: "/rooms/join", requestId, session)
then
  Sessioning.current (session)
```

### Rooms.Join#2

Authored path: `Rooms.Join`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 7.
- Covered by [Rooms](../design/compositions/Rooms.md), line 17.

```reaction
when Sessioning.current (session, subject), asked by Rooms.Join
where
  identity is watchIdentity (subject)
  (signedIn: saveVisit) is isAccountIdentity (identity)
  earlier, RequestBoundary.request (code, name, path: "/rooms/join", requestId, session)
then
  RoomJoining.join (code, identity, name, saveVisit)
```

### Rooms.Join#3

Authored path: `Rooms.Join`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 7.
- Covered by [Rooms](../design/compositions/Rooms.md), line 17.

```reaction
when RoomJoining.join (code, identity, name, saveVisit, participant, room), asked by Rooms.Join#2
where
  earlier, RequestBoundary.request (code, name, path: "/rooms/join", requestId, session)
then
  RequestBoundary.respond (participant, requestId, room)
```

### Rooms.KeepPresent

Authored path: `Rooms.KeepPresent`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 52.
- Covered by [Rooms](../design/compositions/Rooms.md), line 72.

```reaction
when RequestBoundary.request (connection, participant, path: "/rooms/presence", requestId, room, session)
then
  Sessioning.current (session)
```

### Rooms.KeepPresent:allowed#2

Authored path: `Rooms.KeepPresent`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 52.
- Covered by [Rooms](../design/compositions/Rooms.md), line 72.

```reaction
when Sessioning.current (session, subject), asked by Rooms.KeepPresent
where
  earlier, RequestBoundary.request (connection, participant, path: "/rooms/presence", requestId, room, session)
  view "a session's membership in a room" with (participant, room, subject) has (canonical)
then
  Sessioning.keepPresent (connection, reusable: true, scope: room, subject: canonical)
```

### Rooms.KeepPresent:allowed#3

Authored path: `Rooms.KeepPresent`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 52.
- Covered by [Rooms](../design/compositions/Rooms.md), line 72.

```reaction
when Sessioning.keepPresent (connection, reusable: true, scope: room, subject: canonical), asked by Rooms.KeepPresent:allowed#2
where
  earlier, RequestBoundary.request (connection, participant, path: "/rooms/presence", requestId, room, session)
then
  RequestBoundary.respond (requestId)
```

### Rooms.KeepPresent:denied#2

Authored path: `Rooms.KeepPresent`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 52.
- Covered by [Rooms](../design/compositions/Rooms.md), line 72.

```reaction
when Sessioning.current (session, subject), asked by Rooms.KeepPresent
where
  earlier, RequestBoundary.request (connection, participant, path: "/rooms/presence", requestId, room, session)
  no view "a session's membership in a room" with (participant, room, subject)
then
  RequestBoundary.respond (error: "FORBIDDEN", requestId)
```

### Rooms.Leave

Authored path: `Rooms.Leave`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 53.
- Covered by [Rooms](../design/compositions/Rooms.md), line 73.

```reaction
when RequestBoundary.request (connection, participant, path: "/rooms/leave", requestId, room, session)
then
  Sessioning.current (session)
```

### Rooms.Leave:allowed#2

Authored path: `Rooms.Leave`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 53.
- Covered by [Rooms](../design/compositions/Rooms.md), line 73.

```reaction
when Sessioning.current (session, subject), asked by Rooms.Leave
where
  earlier, RequestBoundary.request (connection, participant, path: "/rooms/leave", requestId, room, session)
  view "a session's membership in a room" with (participant, room, subject) has (canonical)
then
  Sessioning.leave (connection, reusable: true, scope: room, subject: canonical)
```

### Rooms.Leave:allowed#3

Authored path: `Rooms.Leave`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 53.
- Covered by [Rooms](../design/compositions/Rooms.md), line 73.

```reaction
when Sessioning.leave (connection, reusable: true, scope: room, subject: canonical, drained), asked by Rooms.Leave:allowed#2
where
  earlier, RequestBoundary.request (connection, participant, path: "/rooms/leave", requestId, room, session)
then
  RequestBoundary.respond (requestId)
```

### Rooms.Leave:denied#2

Authored path: `Rooms.Leave`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 53.
- Covered by [Rooms](../design/compositions/Rooms.md), line 73.

```reaction
when Sessioning.current (session, subject), asked by Rooms.Leave
where
  earlier, RequestBoundary.request (connection, participant, path: "/rooms/leave", requestId, room, session)
  no view "a session's membership in a room" with (participant, room, subject)
then
  RequestBoundary.respond (error: "FORBIDDEN", requestId)
```

### Rooms.RegisterAndClaim

Authored path: `Rooms.RegisterAndClaim`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 21.
- Covered by [Rooms](../design/compositions/Rooms.md), line 37.

```reaction
when RequestBoundary.request (participant, password, path: "/rooms/register-and-claim", requestId, session, username)
then
  Sessioning.current (session)
```

### Rooms.RegisterAndClaim:account#2

Authored path: `Rooms.RegisterAndClaim`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 21.
- Covered by [Rooms](../design/compositions/Rooms.md), line 37.

```reaction
when Sessioning.current (session, subject), asked by Rooms.RegisterAndClaim
where
  (account, kind: "account", visitor: null) is roomSubject (subject)
  earlier, RequestBoundary.request (participant, password, path: "/rooms/register-and-claim", requestId, session, username)
then
  RequestBoundary.respond (error: "FORBIDDEN", requestId)
```

### Rooms.RegisterAndClaim:claim#2

Authored path: `Rooms.RegisterAndClaim`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 21.
- Covered by [Rooms](../design/compositions/Rooms.md), line 37.

```reaction
when Sessioning.current (session, subject), asked by Rooms.RegisterAndClaim
where
  (account: null, kind: "guest", visitor) is roomSubject (subject)
  earlier, RequestBoundary.request (participant, password, path: "/rooms/register-and-claim", requestId, session, username)
  RoomJoining._participant (participant) has (identity: visitor)
then
  Authenticating.register (password, username)
```

### Rooms.RegisterAndClaim:claim#3

Authored path: `Rooms.RegisterAndClaim`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 21.
- Covered by [Rooms](../design/compositions/Rooms.md), line 37.

```reaction
when Authenticating.register (password, username, account), asked by Rooms.RegisterAndClaim:claim#2
where
  earlier, Sessioning.current (session, subject), asked by Rooms.RegisterAndClaim
  earlier, RequestBoundary.request (participant, password, path: "/rooms/register-and-claim", requestId, session, username)
then
  RoomJoining.claimVisit (identity: account, participant, previousIdentity: subject)
```

### Rooms.RegisterAndClaim:claim#4

Authored path: `Rooms.RegisterAndClaim`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 21.
- Covered by [Rooms](../design/compositions/Rooms.md), line 37.

```reaction
when RoomJoining.claimVisit (identity: account, participant, previousIdentity: subject, claimedParticipant, room), asked by Rooms.RegisterAndClaim:claim#3
where
  earlier, Sessioning.current (session, subject), asked by Rooms.RegisterAndClaim
then
  Sessioning.replace (session, subject: account)
```

### Rooms.RegisterAndClaim:claim#5

Authored path: `Rooms.RegisterAndClaim`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 21.
- Covered by [Rooms](../design/compositions/Rooms.md), line 37.

```reaction
when Sessioning.replace (session, subject: account, expiresAt, replacement: issuedSession), asked by Rooms.RegisterAndClaim:claim#4
where
  earlier, RoomJoining.claimVisit (identity: account, participant, previousIdentity: subject, claimedParticipant, room), asked by Rooms.RegisterAndClaim:claim#3
  earlier, RequestBoundary.request (participant, password, path: "/rooms/register-and-claim", requestId, session, username)
then
  RequestBoundary.respond (account, expiresAt, issuedSession, participant: claimedParticipant, requestId, room)
```

### Rooms.RegisterAndClaim:foreign-visit#2

Authored path: `Rooms.RegisterAndClaim`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 21.
- Covered by [Rooms](../design/compositions/Rooms.md), line 37.

```reaction
when Sessioning.current (session, subject), asked by Rooms.RegisterAndClaim
where
  (account: null, kind: "guest", visitor) is roomSubject (subject)
  earlier, RequestBoundary.request (participant, password, path: "/rooms/register-and-claim", requestId, session, username)
  no RoomJoining._participant (participant) has (identity: visitor)
then
  RequestBoundary.respond (error: "FORBIDDEN", requestId)
```

### Rooms.Reopen

Authored path: `Rooms.Reopen`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 12.
- Covered by [Rooms](../design/compositions/Rooms.md), line 18.

```reaction
when RequestBoundary.request (path: "/rooms/reopen", requestId, room, session)
then
  Sessioning.current (session)
```

### Rooms.Reopen:account#2

Authored path: `Rooms.Reopen`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 12.
- Covered by [Rooms](../design/compositions/Rooms.md), line 18.

```reaction
when Sessioning.current (session, subject), asked by Rooms.Reopen
where
  (account, kind: "account", visitor: null) is roomSubject (subject)
  earlier, RequestBoundary.request (path: "/rooms/reopen", requestId, room, session)
then
  RoomJoining.reopen (identity: account, room)
```

### Rooms.Reopen:account#3

Authored path: `Rooms.Reopen`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 12.
- Covered by [Rooms](../design/compositions/Rooms.md), line 18.

```reaction
when RoomJoining.reopen (identity: account, room, code, participant), asked by Rooms.Reopen:account#2
where
  earlier, RequestBoundary.request (path: "/rooms/reopen", requestId, room, session)
then
  RequestBoundary.respond (code, participant, requestId, room)
```

### Rooms.Reopen:guest#2

Authored path: `Rooms.Reopen`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 12.
- Covered by [Rooms](../design/compositions/Rooms.md), line 18.

```reaction
when Sessioning.current (session, subject), asked by Rooms.Reopen
where
  (account: null, kind: "guest", visitor) is roomSubject (subject)
  earlier, RequestBoundary.request (path: "/rooms/reopen", requestId, room, session)
then
  RequestBoundary.respond (error: "FORBIDDEN", requestId)
```

### Rooms.SignInAndClaim

Authored path: `Rooms.SignInAndClaim`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 22.
- Covered by [Rooms](../design/compositions/Rooms.md), line 38.

```reaction
when RequestBoundary.request (participant, password, path: "/rooms/sign-in-and-claim", requestId, session, username)
then
  Sessioning.current (session)
```

### Rooms.SignInAndClaim:account#2

Authored path: `Rooms.SignInAndClaim`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 22.
- Covered by [Rooms](../design/compositions/Rooms.md), line 38.

```reaction
when Sessioning.current (session, subject), asked by Rooms.SignInAndClaim
where
  (account, kind: "account", visitor: null) is roomSubject (subject)
  earlier, RequestBoundary.request (participant, password, path: "/rooms/sign-in-and-claim", requestId, session, username)
then
  RequestBoundary.respond (error: "FORBIDDEN", requestId)
```

### Rooms.SignInAndClaim:claim#2

Authored path: `Rooms.SignInAndClaim`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 22.
- Covered by [Rooms](../design/compositions/Rooms.md), line 38.

```reaction
when Sessioning.current (session, subject), asked by Rooms.SignInAndClaim
where
  (account: null, kind: "guest", visitor) is roomSubject (subject)
  earlier, RequestBoundary.request (participant, password, path: "/rooms/sign-in-and-claim", requestId, session, username)
then
  Authenticating.authenticate (password, username)
```

### Rooms.SignInAndClaim:claim#3

Authored path: `Rooms.SignInAndClaim`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 22.
- Covered by [Rooms](../design/compositions/Rooms.md), line 38.

```reaction
when Authenticating.authenticate (password, username, account), asked by Rooms.SignInAndClaim:claim#2
where
  earlier, Sessioning.current (session, subject), asked by Rooms.SignInAndClaim
  earlier, RequestBoundary.request (participant, password, path: "/rooms/sign-in-and-claim", requestId, session, username)
then
  RoomJoining.claimVisit (identity: account, participant, previousIdentity: subject)
```

### Rooms.SignInAndClaim:claim#4

Authored path: `Rooms.SignInAndClaim`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 22.
- Covered by [Rooms](../design/compositions/Rooms.md), line 38.

```reaction
when RoomJoining.claimVisit (identity: account, participant, previousIdentity: subject, claimedParticipant, room), asked by Rooms.SignInAndClaim:claim#3
where
  earlier, Sessioning.current (session, subject), asked by Rooms.SignInAndClaim
then
  Sessioning.replace (session, subject: account)
```

### Rooms.SignInAndClaim:claim#5

Authored path: `Rooms.SignInAndClaim`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 22.
- Covered by [Rooms](../design/compositions/Rooms.md), line 38.

```reaction
when Sessioning.replace (session, subject: account, expiresAt, replacement: issuedSession), asked by Rooms.SignInAndClaim:claim#4
where
  earlier, RoomJoining.claimVisit (identity: account, participant, previousIdentity: subject, claimedParticipant, room), asked by Rooms.SignInAndClaim:claim#3
  earlier, RequestBoundary.request (participant, password, path: "/rooms/sign-in-and-claim", requestId, session, username)
then
  RequestBoundary.respond (account, expiresAt, issuedSession, participant: claimedParticipant, requestId, room)
```

### Rooms.TransferOwnership

Authored path: `Rooms.TransferOwnership`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 67.
- Covered by [Rooms](../design/compositions/Rooms.md), line 74.

```reaction
when RequestBoundary.request (participant, path: "/rooms/transfer-ownership", requestId, room, session, successor)
then
  Sessioning.current (session)
```

### Rooms.TransferOwnership:allowed#2

Authored path: `Rooms.TransferOwnership`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 67.
- Covered by [Rooms](../design/compositions/Rooms.md), line 74.

```reaction
when Sessioning.current (session, subject), asked by Rooms.TransferOwnership
where
  earlier, RequestBoundary.request (participant, path: "/rooms/transfer-ownership", requestId, room, session, successor)
  view "a room's owner" with (participant, room, subject)
  view "a present account member eligible to own a room" with (participant: successor, room)
then
  RoomJoining.transferOwnership (actor: participant, room, successor)
```

### Rooms.TransferOwnership:allowed#3

Authored path: `Rooms.TransferOwnership`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 67.
- Covered by [Rooms](../design/compositions/Rooms.md), line 74.

```reaction
when RoomJoining.transferOwnership (actor: participant, room, successor), asked by Rooms.TransferOwnership:allowed#2
where
  earlier, RequestBoundary.request (participant, path: "/rooms/transfer-ownership", requestId, room, session, successor)
then
  RequestBoundary.respond (requestId)
```

### Rooms.TransferOwnership:denied#2

Authored path: `Rooms.TransferOwnership`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 67.
- Covered by [Rooms](../design/compositions/Rooms.md), line 74.

```reaction
when Sessioning.current (session, subject), asked by Rooms.TransferOwnership
where
  earlier, RequestBoundary.request (participant, path: "/rooms/transfer-ownership", requestId, room, session, successor)
  no view "a room's owner" with (participant, room, subject)
then
  RequestBoundary.respond (error: "FORBIDDEN", requestId)
```

### Rooms.TransferOwnership:ineligible#2

Authored path: `Rooms.TransferOwnership`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 67.
- Covered by [Rooms](../design/compositions/Rooms.md), line 74.

```reaction
when Sessioning.current (session, subject), asked by Rooms.TransferOwnership
where
  earlier, RequestBoundary.request (participant, path: "/rooms/transfer-ownership", requestId, room, session, successor)
  view "a room's owner" with (participant, room, subject)
  no view "a present account member eligible to own a room" with (participant: successor, room)
then
  RequestBoundary.respond (error: "FORBIDDEN", requestId)
```

### Summaries.Read

Authored path: `Summaries.Read`.
- Covered by [Summaries](../design/compositions/Summaries.md), line 16.
- Covered by [Summaries](../design/compositions/Summaries.md), line 22.

```reaction
when RequestBoundary.request (entry, participant, path: "/summaries/read", requestId, room, session)
then
  Sessioning.current (session)
```

### Summaries.Read:allowed#2

Authored path: `Summaries.Read`.
- Covered by [Summaries](../design/compositions/Summaries.md), line 16.
- Covered by [Summaries](../design/compositions/Summaries.md), line 22.

```reaction
when Sessioning.current (session, subject), asked by Summaries.Read
where
  earlier, RequestBoundary.request (entry, participant, path: "/summaries/read", requestId, room, session)
  view "a room member's video entry" with (entry, participant, room, subject)
  Discussing._discussion (topic: entry) has (discussion)
  currentRevision is discussionRevision (discussion)
  Summarizing._saved (topic: entry) has (summary)
then
  RequestBoundary.respond (currentRevision, requestId, summary)
```

### Summaries.Read:denied#2

Authored path: `Summaries.Read`.
- Covered by [Summaries](../design/compositions/Summaries.md), line 16.
- Covered by [Summaries](../design/compositions/Summaries.md), line 22.

```reaction
when Sessioning.current (session, subject), asked by Summaries.Read
where
  earlier, RequestBoundary.request (entry, participant, path: "/summaries/read", requestId, room, session)
  no view "a room member's video entry" with (entry, participant, room, subject)
then
  RequestBoundary.respond (error: "FORBIDDEN", requestId)
```

### Summaries.Summarize

Authored path: `Summaries.Summarize`.
- Covered by [Summaries](../design/compositions/Summaries.md), line 3.
- Covered by [Summaries](../design/compositions/Summaries.md), line 21.

```reaction
when RequestBoundary.request (entry, participant, path: "/summaries/summarize", requestId, room, session)
then
  Sessioning.current (session)
```

### Summaries.Summarize:allowed#2

Authored path: `Summaries.Summarize`.
- Covered by [Summaries](../design/compositions/Summaries.md), line 3.
- Covered by [Summaries](../design/compositions/Summaries.md), line 21.

```reaction
when Sessioning.current (session, subject), asked by Summaries.Summarize
where
  earlier, RequestBoundary.request (entry, participant, path: "/summaries/summarize", requestId, room, session)
  view "a room member's video entry" with (entry, participant, room, subject) has (source: media)
  Discussing._discussion (topic: entry) has (discussion)
  (source, sourceRevision) is summarySource (discussion, media)
then
  Summarizing.summarize (source, sourceRevision, topic: entry)
```

### Summaries.Summarize:allowed#3

Authored path: `Summaries.Summarize`.
- Covered by [Summaries](../design/compositions/Summaries.md), line 3.
- Covered by [Summaries](../design/compositions/Summaries.md), line 21.

```reaction
when Summarizing.summarize (source, sourceRevision, topic: entry, summary), asked by Summaries.Summarize:allowed#2
where
  earlier, RequestBoundary.request (entry, participant, path: "/summaries/summarize", requestId, room, session)
then
  RequestBoundary.respond (requestId, summary)
```

### Summaries.Summarize:denied#2

Authored path: `Summaries.Summarize`.
- Covered by [Summaries](../design/compositions/Summaries.md), line 3.
- Covered by [Summaries](../design/compositions/Summaries.md), line 21.

```reaction
when Sessioning.current (session, subject), asked by Summaries.Summarize
where
  earlier, RequestBoundary.request (entry, participant, path: "/summaries/summarize", requestId, room, session)
  no view "a room member's video entry" with (entry, participant, room, subject)
then
  RequestBoundary.respond (error: "FORBIDDEN", requestId)
```

### Watch.AddVideo

Authored path: `Watch.AddVideo`.
- Covered by [Watch](../design/compositions/Watch.md), line 45.
- Covered by [Watch](../design/compositions/Watch.md), line 60.

```reaction
when RequestBoundary.request (participant, path: "/watch/add-video", previewTitle, requestId, room, session, videoId)
then
  Sessioning.current (session)
```

### Watch.AddVideo:allowed#2

Authored path: `Watch.AddVideo`.
- Covered by [Watch](../design/compositions/Watch.md), line 45.
- Covered by [Watch](../design/compositions/Watch.md), line 60.

```reaction
when Sessioning.current (session, subject), asked by Watch.AddVideo
where
  earlier, RequestBoundary.request (participant, path: "/watch/add-video", previewTitle, requestId, room, session, videoId)
  view "an owner's watch" with (participant, room, subject) has (stream)
  source is youtubeSource (previewTitle, videoId)
then
  Streaming.addVideo (source, stream)
```

### Watch.AddVideo:allowed#3

Authored path: `Watch.AddVideo`.
- Covered by [Watch](../design/compositions/Watch.md), line 45.
- Covered by [Watch](../design/compositions/Watch.md), line 60.

```reaction
when Streaming.addVideo (source, stream, entry, revision), asked by Watch.AddVideo:allowed#2
where
  earlier, RequestBoundary.request (participant, path: "/watch/add-video", previewTitle, requestId, room, session, videoId)
then
  RequestBoundary.respond (entry, requestId, revision)
```

### Watch.AddVideo:denied#2

Authored path: `Watch.AddVideo`.
- Covered by [Watch](../design/compositions/Watch.md), line 45.
- Covered by [Watch](../design/compositions/Watch.md), line 60.

```reaction
when Sessioning.current (session, subject), asked by Watch.AddVideo
where
  earlier, RequestBoundary.request (participant, path: "/watch/add-video", previewTitle, requestId, room, session, videoId)
  no view "an owner's watch" with (participant, room, subject)
then
  RequestBoundary.respond (error: "FORBIDDEN", requestId)
```

### Watch.Control

Authored path: `Watch.Control`.
- Covered by [Watch](../design/compositions/Watch.md), line 66.
- Covered by [Watch](../design/compositions/Watch.md), line 76.

```reaction
when RequestBoundary.request (connection, entry, expectedRevision, offset, operation, participant, path: "/watch/control", position, requestId, room, session)
then
  Sessioning.current (session)
```

### Watch.Control:absent#2

Authored path: `Watch.Control`.
- Covered by [Watch](../design/compositions/Watch.md), line 66.
- Covered by [Watch](../design/compositions/Watch.md), line 76.

```reaction
when Sessioning.current (session, subject), asked by Watch.Control
where
  earlier, RequestBoundary.request (connection, entry, expectedRevision, offset, operation, participant, path: "/watch/control", position, requestId, room, session)
  view "a member's watch" with (participant, room, subject)
  no Sessioning._connectionPresence (connection, scope: room, subject: participant) has (present: true)
then
  RequestBoundary.respond (error: "CONTROL_UNAVAILABLE", requestId)
```

### Watch.Control:allowed#2

Authored path: `Watch.Control`.
- Covered by [Watch](../design/compositions/Watch.md), line 66.
- Covered by [Watch](../design/compositions/Watch.md), line 76.

```reaction
when Sessioning.current (session, subject), asked by Watch.Control
where
  earlier, RequestBoundary.request (connection, entry, expectedRevision, offset, operation, participant, path: "/watch/control", position, requestId, room, session)
  view "a member's watch" with (participant, room, subject) has (stream)
  Sessioning._connectionPresence (connection, scope: room, subject: participant) has (present: true)
  command is playbackCommand (entry, expectedRevision, offset, operation, position)
then
  Streaming.control (command, stream, viewer: participant)
```

### Watch.Control:allowed#3

Authored path: `Watch.Control`.
- Covered by [Watch](../design/compositions/Watch.md), line 66.
- Covered by [Watch](../design/compositions/Watch.md), line 76.

```reaction
when Streaming.control (command, stream, viewer: participant, changed, revision), asked by Watch.Control:allowed#2
where
  earlier, RequestBoundary.request (connection, entry, expectedRevision, offset, operation, participant, path: "/watch/control", position, requestId, room, session)
then
  RequestBoundary.respond (changed, requestId, revision)
```

### Watch.Control:denied#2

Authored path: `Watch.Control`.
- Covered by [Watch](../design/compositions/Watch.md), line 66.
- Covered by [Watch](../design/compositions/Watch.md), line 76.

```reaction
when Sessioning.current (session, subject), asked by Watch.Control
where
  earlier, RequestBoundary.request (connection, entry, expectedRevision, offset, operation, participant, path: "/watch/control", position, requestId, room, session)
  no view "a member's watch" with (participant, room, subject)
then
  RequestBoundary.respond (error: "FORBIDDEN", requestId)
```

### Watch.End

Authored path: `Watch.End`.
- Covered by [Watch](../design/compositions/Watch.md), line 52.
- Covered by [Watch](../design/compositions/Watch.md), line 63.

```reaction
when RequestBoundary.request (participant, path: "/watch/end", requestId, room, session)
then
  Sessioning.current (session)
```

### Watch.End:allowed#2

Authored path: `Watch.End`.
- Covered by [Watch](../design/compositions/Watch.md), line 52.
- Covered by [Watch](../design/compositions/Watch.md), line 63.

```reaction
when Sessioning.current (session, subject), asked by Watch.End
where
  earlier, RequestBoundary.request (participant, path: "/watch/end", requestId, room, session)
  view "an owner's watch" with (participant, room, subject) has (stream)
then
  Streaming.end (stream)
```

### Watch.End:allowed#3

Authored path: `Watch.End`.
- Covered by [Watch](../design/compositions/Watch.md), line 52.
- Covered by [Watch](../design/compositions/Watch.md), line 63.

```reaction
when Streaming.end (stream, ended), asked by Watch.End:allowed#2
where
  earlier, RequestBoundary.request (participant, path: "/watch/end", requestId, room, session)
then
  Sessioning.close (scope: room)
```

### Watch.End:allowed#4

Authored path: `Watch.End`.
- Covered by [Watch](../design/compositions/Watch.md), line 52.
- Covered by [Watch](../design/compositions/Watch.md), line 63.

```reaction
when Sessioning.close (scope: room), asked by Watch.End:allowed#3
where
  earlier, Streaming.end (stream, ended), asked by Watch.End:allowed#2
  earlier, RequestBoundary.request (participant, path: "/watch/end", requestId, room, session)
then
  RequestBoundary.respond (ended, requestId)
```

### Watch.End:denied#2

Authored path: `Watch.End`.
- Covered by [Watch](../design/compositions/Watch.md), line 52.
- Covered by [Watch](../design/compositions/Watch.md), line 63.

```reaction
when Sessioning.current (session, subject), asked by Watch.End
where
  earlier, RequestBoundary.request (participant, path: "/watch/end", requestId, room, session)
  no view "an owner's watch" with (participant, room, subject)
then
  RequestBoundary.respond (error: "FORBIDDEN", requestId)
```

### Watch.EndDrainedWatch

Authored path: `Watch.EndDrainedWatch`.
- Covered by [Watch](../design/compositions/Watch.md), line 35.

```reaction
when Sessioning.leave (scope, drained: true)
where
  Streaming._stream (scope) has (stream)
then
  Streaming.end (stream)
```

### Watch.EndDrainedWatch#2

Authored path: `Watch.EndDrainedWatch`.
- Covered by [Watch](../design/compositions/Watch.md), line 35.

```reaction
when Streaming.end (stream), asked by Watch.EndDrainedWatch
where
  earlier, Sessioning.leave (scope, drained: true)
then
  Sessioning.close (scope)
```

### Watch.History

Authored path: `Watch.History`.
- Covered by [Watch](../design/compositions/Watch.md), line 79.
- Covered by [Watch](../design/compositions/Watch.md), line 87.

```reaction
when RequestBoundary.request (path: "/watch/history", requestId, session)
then
  Sessioning.current (session)
```

### Watch.History:account#2

Authored path: `Watch.History`.
- Covered by [Watch](../design/compositions/Watch.md), line 79.
- Covered by [Watch](../design/compositions/Watch.md), line 87.

```reaction
when Sessioning.current (session, subject), asked by Watch.History
where
  (account, kind: "account", visitor: null) is roomSubject (subject)
  earlier, RequestBoundary.request (path: "/watch/history", requestId, session)
then
  RequestBoundary.respond (requestId, rooms: former "watch history for an account" with (account))
```

### Watch.History:guest#2

Authored path: `Watch.History`.
- Covered by [Watch](../design/compositions/Watch.md), line 79.
- Covered by [Watch](../design/compositions/Watch.md), line 87.

```reaction
when Sessioning.current (session, subject), asked by Watch.History
where
  (account: null, kind: "guest", visitor) is roomSubject (subject)
  earlier, RequestBoundary.request (path: "/watch/history", requestId, session)
then
  RequestBoundary.respond (error: "FORBIDDEN", requestId)
```

### Watch.KeepPresent

Authored path: `Watch.KeepPresent`.
- Covered by [Watch](../design/compositions/Watch.md), line 30.
- Covered by [Watch](../design/compositions/Watch.md), line 41.

```reaction
when RequestBoundary.request (connection, participant, path: "/watch/presence", requestId, room, session)
then
  Sessioning.current (session)
```

### Watch.KeepPresent:allowed#2

Authored path: `Watch.KeepPresent`.
- Covered by [Watch](../design/compositions/Watch.md), line 30.
- Covered by [Watch](../design/compositions/Watch.md), line 41.

```reaction
when Sessioning.current (session, subject), asked by Watch.KeepPresent
where
  earlier, RequestBoundary.request (connection, participant, path: "/watch/presence", requestId, room, session)
  view "a member's watch" with (participant, room, subject) has (live: true)
then
  Sessioning.keepPresent (connection, scope: room, subject: participant)
```

### Watch.KeepPresent:allowed#3

Authored path: `Watch.KeepPresent`.
- Covered by [Watch](../design/compositions/Watch.md), line 30.
- Covered by [Watch](../design/compositions/Watch.md), line 41.

```reaction
when Sessioning.keepPresent (connection, scope: room, subject: participant), asked by Watch.KeepPresent:allowed#2
where
  earlier, RequestBoundary.request (connection, participant, path: "/watch/presence", requestId, room, session)
then
  RequestBoundary.respond (requestId)
```

### Watch.KeepPresent:denied#2

Authored path: `Watch.KeepPresent`.
- Covered by [Watch](../design/compositions/Watch.md), line 30.
- Covered by [Watch](../design/compositions/Watch.md), line 41.

```reaction
when Sessioning.current (session, subject), asked by Watch.KeepPresent
where
  earlier, RequestBoundary.request (connection, participant, path: "/watch/presence", requestId, room, session)
  no view "a member's watch" with (participant, room, subject)
then
  RequestBoundary.respond (error: "FORBIDDEN", requestId)
```

### Watch.KeepPresent:ended#2

Authored path: `Watch.KeepPresent`.
- Covered by [Watch](../design/compositions/Watch.md), line 30.
- Covered by [Watch](../design/compositions/Watch.md), line 41.

```reaction
when Sessioning.current (session, subject), asked by Watch.KeepPresent
where
  earlier, RequestBoundary.request (connection, participant, path: "/watch/presence", requestId, room, session)
  view "a member's watch" with (participant, room, subject) has (live: false)
then
  RequestBoundary.respond (error: "PRESENCE_UNAVAILABLE", requestId)
```

### Watch.Leave

Authored path: `Watch.Leave`.
- Covered by [Watch](../design/compositions/Watch.md), line 33.
- Covered by [Watch](../design/compositions/Watch.md), line 42.

```reaction
when RequestBoundary.request (connection, participant, path: "/watch/leave", requestId, room, session)
then
  Sessioning.current (session)
```

### Watch.Leave:allowed#2

Authored path: `Watch.Leave`.
- Covered by [Watch](../design/compositions/Watch.md), line 33.
- Covered by [Watch](../design/compositions/Watch.md), line 42.

```reaction
when Sessioning.current (session, subject), asked by Watch.Leave
where
  earlier, RequestBoundary.request (connection, participant, path: "/watch/leave", requestId, room, session)
  view "a member's watch" with (participant, room, subject)
then
  Sessioning.leave (connection, scope: room, subject: participant)
```

### Watch.Leave:allowed#3

Authored path: `Watch.Leave`.
- Covered by [Watch](../design/compositions/Watch.md), line 33.
- Covered by [Watch](../design/compositions/Watch.md), line 42.

```reaction
when Sessioning.leave (connection, scope: room, subject: participant, drained), asked by Watch.Leave:allowed#2
where
  earlier, RequestBoundary.request (connection, participant, path: "/watch/leave", requestId, room, session)
then
  RequestBoundary.respond (ended: drained, requestId)
```

### Watch.Leave:denied#2

Authored path: `Watch.Leave`.
- Covered by [Watch](../design/compositions/Watch.md), line 33.
- Covered by [Watch](../design/compositions/Watch.md), line 42.

```reaction
when Sessioning.current (session, subject), asked by Watch.Leave
where
  earlier, RequestBoundary.request (connection, participant, path: "/watch/leave", requestId, room, session)
  no view "a member's watch" with (participant, room, subject)
then
  RequestBoundary.respond (error: "FORBIDDEN", requestId)
```

### Watch.Open

Authored path: `Watch.Open`.
- Covered by [Watch](../design/compositions/Watch.md), line 3.
- Covered by [Watch](../design/compositions/Watch.md), line 9.

```reaction
when RequestBoundary.request (participant, path: "/watch/open", requestId, room, session)
then
  Sessioning.current (session)
```

### Watch.Open:allowed#2

Authored path: `Watch.Open`.
- Covered by [Watch](../design/compositions/Watch.md), line 3.
- Covered by [Watch](../design/compositions/Watch.md), line 9.

```reaction
when Sessioning.current (session, subject), asked by Watch.Open
where
  earlier, RequestBoundary.request (participant, path: "/watch/open", requestId, room, session)
  view "a session's membership in a room" with (participant, room, subject)
then
  Streaming.open (scope: room)
```

### Watch.Open:allowed#3

Authored path: `Watch.Open`.
- Covered by [Watch](../design/compositions/Watch.md), line 3.
- Covered by [Watch](../design/compositions/Watch.md), line 9.

```reaction
when Streaming.open (scope: room, stream), asked by Watch.Open:allowed#2
where
  earlier, RequestBoundary.request (participant, path: "/watch/open", requestId, room, session)
then
  RequestBoundary.respond (requestId, stream)
```

### Watch.Open:denied#2

Authored path: `Watch.Open`.
- Covered by [Watch](../design/compositions/Watch.md), line 3.
- Covered by [Watch](../design/compositions/Watch.md), line 9.

```reaction
when Sessioning.current (session, subject), asked by Watch.Open
where
  earlier, RequestBoundary.request (participant, path: "/watch/open", requestId, room, session)
  no view "a session's membership in a room" with (participant, room, subject)
then
  RequestBoundary.respond (error: "FORBIDDEN", requestId)
```

### Watch.Read

Authored path: `Watch.Read`.
- Covered by [Watch](../design/compositions/Watch.md), line 12.
- Covered by [Watch](../design/compositions/Watch.md), line 27.

```reaction
when RequestBoundary.request (afterRevision, participant, path: "/watch/read", requestId, room, session)
then
  Sessioning.current (session)
```

### Watch.Read:allowed#2

Authored path: `Watch.Read`.
- Covered by [Watch](../design/compositions/Watch.md), line 12.
- Covered by [Watch](../design/compositions/Watch.md), line 27.

```reaction
when Sessioning.current (session, subject), asked by Watch.Read
where
  earlier, RequestBoundary.request (afterRevision, participant, path: "/watch/read", requestId, room, session)
  view "a member's watch" with (participant, room, subject) has (isOwner, stream)
then
  RequestBoundary.respond (isOwner, requestId, watch: former "shared state and viewers in a watch" with (afterRevision, room, stream))
```

### Watch.Read:denied#2

Authored path: `Watch.Read`.
- Covered by [Watch](../design/compositions/Watch.md), line 12.
- Covered by [Watch](../design/compositions/Watch.md), line 27.

```reaction
when Sessioning.current (session, subject), asked by Watch.Read
where
  earlier, RequestBoundary.request (afterRevision, participant, path: "/watch/read", requestId, room, session)
  no view "a member's watch" with (participant, room, subject)
then
  RequestBoundary.respond (error: "FORBIDDEN", requestId)
```

### Watch.Start

Authored path: `Watch.Start`.
- Covered by [Watch](../design/compositions/Watch.md), line 50.
- Covered by [Watch](../design/compositions/Watch.md), line 61.

```reaction
when RequestBoundary.request (entry, participant, path: "/watch/start", requestId, room, session)
then
  Sessioning.current (session)
```

### Watch.Start:allowed#2

Authored path: `Watch.Start`.
- Covered by [Watch](../design/compositions/Watch.md), line 50.
- Covered by [Watch](../design/compositions/Watch.md), line 61.

```reaction
when Sessioning.current (session, subject), asked by Watch.Start
where
  earlier, RequestBoundary.request (entry, participant, path: "/watch/start", requestId, room, session)
  view "an owner's watch" with (participant, room, subject) has (stream)
then
  Streaming.start (entry, stream)
```

### Watch.Start:allowed#3

Authored path: `Watch.Start`.
- Covered by [Watch](../design/compositions/Watch.md), line 50.
- Covered by [Watch](../design/compositions/Watch.md), line 61.

```reaction
when Streaming.start (entry, stream, revision), asked by Watch.Start:allowed#2
where
  earlier, RequestBoundary.request (entry, participant, path: "/watch/start", requestId, room, session)
then
  RequestBoundary.respond (requestId, revision)
```

### Watch.Start:denied#2

Authored path: `Watch.Start`.
- Covered by [Watch](../design/compositions/Watch.md), line 50.
- Covered by [Watch](../design/compositions/Watch.md), line 61.

```reaction
when Sessioning.current (session, subject), asked by Watch.Start
where
  earlier, RequestBoundary.request (entry, participant, path: "/watch/start", requestId, room, session)
  no view "an owner's watch" with (participant, room, subject)
then
  RequestBoundary.respond (error: "FORBIDDEN", requestId)
```

### Watch.SwitchVideo

Authored path: `Watch.SwitchVideo`.
- Covered by [Watch](../design/compositions/Watch.md), line 51.
- Covered by [Watch](../design/compositions/Watch.md), line 62.

```reaction
when RequestBoundary.request (entry, participant, path: "/watch/switch-video", requestId, room, session)
then
  Sessioning.current (session)
```

### Watch.SwitchVideo:allowed#2

Authored path: `Watch.SwitchVideo`.
- Covered by [Watch](../design/compositions/Watch.md), line 51.
- Covered by [Watch](../design/compositions/Watch.md), line 62.

```reaction
when Sessioning.current (session, subject), asked by Watch.SwitchVideo
where
  earlier, RequestBoundary.request (entry, participant, path: "/watch/switch-video", requestId, room, session)
  view "an owner's watch" with (participant, room, subject) has (stream)
then
  Streaming.switchVideo (entry, stream)
```

### Watch.SwitchVideo:allowed#3

Authored path: `Watch.SwitchVideo`.
- Covered by [Watch](../design/compositions/Watch.md), line 51.
- Covered by [Watch](../design/compositions/Watch.md), line 62.

```reaction
when Streaming.switchVideo (entry, stream, revision), asked by Watch.SwitchVideo:allowed#2
where
  earlier, RequestBoundary.request (entry, participant, path: "/watch/switch-video", requestId, room, session)
then
  RequestBoundary.respond (requestId, revision)
```

### Watch.SwitchVideo:denied#2

Authored path: `Watch.SwitchVideo`.
- Covered by [Watch](../design/compositions/Watch.md), line 51.
- Covered by [Watch](../design/compositions/Watch.md), line 62.

```reaction
when Sessioning.current (session, subject), asked by Watch.SwitchVideo
where
  earlier, RequestBoundary.request (entry, participant, path: "/watch/switch-video", requestId, room, session)
  no view "an owner's watch" with (participant, room, subject)
then
  RequestBoundary.respond (error: "FORBIDDEN", requestId)
```

## Endpoint input contracts

Before recording an action ask, the boundary rejects a body that is not an
object or lacks a required key. The response uses `INVALID_INPUT` and names
the path or missing key. A declared default fills an absent key. Endpoints
not listed here have no explicit input contract.

- `/auth/guest` — requires `session`
- `/auth/login` — requires `password`, `session`, `username`
- `/auth/logout` — requires `session`
- `/auth/me` — requires `session`
- `/auth/register` — requires `password`, `session`, `username`
- `/discussion/read` — requires `entry`, `participant`, `room`, `session`
- `/discussion/reply` — requires `session`, `room`, `participant`, `parent`, `text`; fills `connection` with null when absent
- `/discussion/start-thread` — requires `session`, `room`, `participant`, `entry`, `position`, `text`; fills `connection` with null when absent
- `/rooms/create` — requires `name`, `session`
- `/rooms/history` — requires `session`
- `/rooms/join` — requires `session`, `code`; fills `name` with "" when absent
- `/rooms/leave` — requires `connection`, `participant`, `room`, `session`
- `/rooms/presence` — requires `connection`, `participant`, `room`, `session`
- `/rooms/register-and-claim` — requires `participant`, `password`, `session`, `username`
- `/rooms/reopen` — requires `room`, `session`
- `/rooms/sign-in-and-claim` — requires `participant`, `password`, `session`, `username`
- `/rooms/transfer-ownership` — requires `participant`, `room`, `session`, `successor`
- `/summaries/read` — requires `entry`, `participant`, `room`, `session`
- `/summaries/summarize` — requires `entry`, `participant`, `room`, `session`
- `/watch/add-video` — requires `session`, `room`, `participant`, `videoId`; fills `previewTitle` with null when absent
- `/watch/control` — requires `session`, `room`, `participant`, `entry`, `expectedRevision`, `connection`, `operation`; fills `offset` with null when absent; fills `position` with null when absent
- `/watch/end` — requires `participant`, `room`, `session`
- `/watch/history` — requires `session`
- `/watch/leave` — requires `connection`, `participant`, `room`, `session`
- `/watch/open` — requires `participant`, `room`, `session`
- `/watch/presence` — requires `connection`, `participant`, `room`, `session`
- `/watch/read` — requires `afterRevision`, `participant`, `room`, `session`
- `/watch/start` — requires `entry`, `participant`, `room`, `session`
- `/watch/switch-video` — requires `entry`, `participant`, `room`, `session`
