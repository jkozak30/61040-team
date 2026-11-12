# Rooms

A signed-in account [creates a private room](reaction:Rooms.Create)
and becomes its owner. Return the room identity, participant, and invite
code. The browser puts the code in a shareable join link.

A guest or account [joins by code](reaction:Rooms.Join). Resolve the
identity from the session and save visits for signed-in accounts. A name is
required on the first join. Returning identities keep their existing names.
Return the room and participant. The invite
remains valid after shared playback ends. An account can
[reopen a saved room](reaction:Rooms.Reopen) without the code.
Record the account's return to its saved room and return its participant and room code.

```endpoints
Rooms.Create at /rooms/create
Rooms.Join at /rooms/join
Rooms.Reopen at /rooms/reopen
```

A guest in a room can [register and save the visit](reaction:Rooms.RegisterAndClaim)
or [sign in and save the visit](reaction:Rooms.SignInAndClaim).
Resolve the visitor from the active guest session. Check that the
participant belongs to that visitor before creating a new account.
Use the new or verified account to claim the visit. If the account already
has a participant in the room, return that participant and preserve its name.
Existing guest posts keep their original author and name. Otherwise, link the
guest participant to the account. Replace the guest session with an account
session and issue its cookie.

If the claim succeeds but session replacement fails, the guest can retry
through sign-in with the same account. A retry can claim a participant
already linked to that verified account. Ordinary sign-in stays available
for viewers who want to continue without saving a guest visit.

```endpoints
Rooms.RegisterAndClaim at /rooms/register-and-claim
Rooms.SignInAndClaim at /rooms/sign-in-and-claim
```

A signed-in account [lists its saved rooms](reaction:Rooms.History).
The [history former](former:Rooms.SavedRooms) returns one row per
saved room, most recent activity first.

```endpoints
Rooms.History at /rooms/history
```

The [room access view](view:Rooms.RoomAccess) matches the requested
participant to the room and the session identity. The
[owner access view](view:Rooms.OwnerAccess) also requires the owner account.
The browser [renews room presence](reaction:Rooms.KeepPresent) while it has
the room open, including during independent review. It [removes its room
connection](reaction:Rooms.Leave) when it leaves the room. If the browser
disconnects, its presence expires. Room presence uses a reusable group
separate from the live watch. Departing preserves the participant and room history.

[Leaving the room](reaction:Rooms.EndOwnerDeparture) ends a live watch if
the departing participant is still the owner and has no remaining room
connection. A [room heartbeat](reaction:Rooms.EndOwnerAbsence) also ends
a live watch if the owner's room presence has expired. Transferring
ownership to a present member before leaving keeps the watch running. Both
reactions use the [owner presence view](view:Rooms.PresentOwner) to find a
[live watch whose owner is absent](view:Rooms.OwnerlessWatch).


The owner can [transfer ownership](reaction:Rooms.TransferOwnership) to
a [present account member](view:Rooms.EligibleSuccessor). The watch page uses
that same view to list candidates. Saved visits remain attached to their accounts.

```endpoints
Rooms.KeepPresent at /rooms/presence
Rooms.Leave at /rooms/leave
Rooms.TransferOwnership at /rooms/transfer-ownership
```

```computations
watchIdentity(subject: SessionSubject) : SessionSubject
  Returns the stored account or guest identity used for room membership.

isAccountIdentity(identity: SessionSubject) : (signedIn: Flag)
  Answers whether the identity belongs to a signed-in account.

roomSubject(subject: SessionSubject) : RoomIdentity
  Reads the kind and the account or guest identity from the session subject.
```
