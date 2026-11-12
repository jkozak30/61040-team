# RoomJoining

## Purpose

Let people gather privately for a shared activity and return to it later.

## Principle

A person creates a room and shares its code. Others join by code.
A participant can claim an unsaved visit under a new identity and
return later. The owner can transfer ownership to another member.

## Types

```types
external Identity
  The identity associated with a participant or saved visit.
opaque LastJoinTime
  The last recorded join time, or null for a saved visit that predates join tracking.
```

## State

```state
a set of Rooms with
  a unique code String
  an owner Identity

a set of Participants with
  a room Room
  an identity Identity
  a name String
  an optional lastActivityAt DateTime
  an optional lastJoinedAt DateTime
  unique room and identity

Rule: Names are trimmed, nonempty, and at most 32 UTF-16 code units.
Rule: A participant with lastActivityAt has a saved room visit. A participant keeps its display name when rejoining.
```

## Actions

```actions
create(identity: Identity, name: String) : returns (room: Room, participant: Participant, code: String)
  where the trimmed name is empty or exceeds 32 UTF-16 code units
  then
    refuses INVALID_OWNER_NAME "Enter a display name of 1 to 32 characters."
  where the trimmed name is valid
  then
    generate an unpredictable code unique among rooms
    create room with that code and identity as owner
    create participant for identity with the trimmed name
    save the identity's room visit and set lastJoinedAt to the current server time
    returns room, participant, code

join(code: String, name?: String, identity: Identity, saveVisit: Flag) : returns (room: Room, participant: Participant)
  where the code does not identify a room
  then
    refuses INVALID_ROOM_CODE "This room code is invalid."
  where the code identifies a room, identity has no participant there, and the trimmed name is missing or invalid
  then
    refuses INVALID_JOIN_NAME "Enter a display name of 1 to 32 characters."
  where the code identifies a room and identity already has a participant there or supplies a valid name
  then
    resolve room from code
    reuse the participant and its display name, or create one with the given name
    if saveVisit is true, save or update the visit for identity and record lastJoinedAt
    returns room, participant

claimVisit(participant: Participant, previousIdentity: Identity, identity: Identity) : returns (room: Room, claimedParticipant: Participant)
  where participant already has identity or has previousIdentity without a saved visit
  then
    resolve room from participant
    if identity already has a participant in room, use it as claimedParticipant
    otherwise associate the given participant with identity and use it as claimedParticipant
    update lastActivityAt and lastJoinedAt of claimedParticipant
    returns room, claimedParticipant
  where participant is missing or neither condition holds
  then
    refuses VISIT_NOT_CLAIMABLE "This visit cannot be claimed by that identity."

transferOwnership(room: Room, actor: Participant, successor: Participant) : returns ()
  where actor is the owner and successor is a member of room
  then
    set owner to the successor's identity and preserve saved visits
    returns
  where actor is not the owner or successor is not a member of room
  then
    refuses OWNERSHIP_TRANSFER_UNAVAILABLE "Only the owner can transfer to a room member."

reopen(room: Room, identity: Identity) : returns (participant: Participant, code: String)
  where identity has a saved visit to room
  then
    advance lastActivityAt and lastJoinedAt to the current server time if later
    set participant to the participant for identity and code to the room code
    returns participant, code
  where identity has no saved visit to room
  then
    refuses NO_SAVED_VISIT "This room is not saved for this identity."

recordActivity(room: Room, identity: Identity) : returns (participant: Participant)
  where identity has a saved visit to room
  then
    set participant to the participant for identity in room
    advance lastActivityAt to the current server time if later
    returns participant
  where identity has no saved visit to room
  then
    refuses NO_SAVED_VISIT "This room is not saved for this identity."
```

## Queries

```queries
_savedVisit(room: Room, identity: Identity) : optional (lastActivityAt: DateTime)
  Answers the identity's saved visit, or no row if none exists.

_participant(participant: Participant) : optional (room: Room, name: String, identity: Identity, owner: Flag, canonical: Participant)
  Answers the participant's room, name, identity, and whether that identity owns the room, and its canonical participant ID. Older participant IDs that were consolidated still resolve. Answers no row if unknown.

_ownershipCandidates(room: Room) : many (participant: Participant, name: String, identity: Identity)
  Answers the participant for each identity in the room other than the owner.

_history(identity: Identity) : many (room: Room, participant: Participant, lastActivityAt: DateTime, lastJoinedAt: LastJoinTime, owner: Flag)
  Answers saved rooms by most recent activity first, breaking ties by room identity. Includes the saved participant, ownership, and the last recorded join, when available. Answers no rows if none are saved.
```
