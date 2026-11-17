# Application types

Accounts create rooms. A session identifies an account or a guest.
Guests can join a room and save their visit after signing in.

```types
concrete PlayerConnection
  An opaque identifier for one connection in a room or shared watch.

concrete MediaSource
  The provider, ID, and optional title of a playable media item.

concrete SessionSubject
  An Authenticating.Account identity or an opaque server-issued guest identity.
```

```instances
instantiate Authenticating

instantiate Sessioning with
  Subject is SessionSubject

instantiate Presence with
  Scope is RoomJoining.Room
  PresenceSubject is RoomJoining.Participant
  Connection is PlayerConnection

instantiate RoomJoining with
  Identity is SessionSubject

instantiate Watching with
  Scope is RoomJoining.Room
  Viewer is RoomJoining.Participant
  Media is MediaSource
```
