# Application types

Accounts create rooms. A session identifies an account or a guest.
Guests can join a room and save their visit after signing in.

```types
concrete PlayerConnection
  An opaque identifier for one connection in a room or shared watch.

concrete MediaSource
  The provider, ID, and optional title of a playable media item.

concrete VideoSecond
  A finite nonnegative number of seconds from the start of a video.

concrete DiscussionContext
  LIVE for a message posted while connected to the shared watch, or HISTORICAL for independent review.

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

instantiate Discussing with
  Topic is Watching.VideoEntry
  Author is RoomJoining.Participant
  Anchor is VideoSecond
  Context is DiscussionContext
```
