# Application types

Accounts create rooms. A session identifies an account or a guest.
Guests can join a room and save their visit after signing in.

```types
concrete PlayerConnection
  An opaque identifier for one connection in a room or shared watch.

concrete MediaSource
  The provider, ID, and optional title of a playable media item.

concrete LectureSource
  Media and timestamped discussion used for a lecture recap.

concrete LectureSummary
  A lecture opener and plain-text takeaways.

concrete PlaybackSeconds
  A finite nonnegative position in a video.

concrete DiscussionContext
  LIVE or HISTORICAL, based on viewing mode when a message was accepted.

concrete SessionSubject
  An Authenticating.Account identity or an opaque server-issued guest identity.
```

```instances
instantiate Authenticating

instantiate Sessioning with
  Subject is SessionSubject
  Scope is RoomJoining.Room
  PresenceSubject is RoomJoining.Participant
  Connection is PlayerConnection

instantiate RoomJoining with
  Identity is SessionSubject

instantiate Streaming with
  Scope is RoomJoining.Room
  Viewer is RoomJoining.Participant
  Media is MediaSource

instantiate Discussing with
  Topic is Streaming.VideoEntry
  Author is RoomJoining.Participant
  Anchor is PlaybackSeconds
  Context is DiscussionContext

instantiate Summarizing with
  Topic is Streaming.VideoEntry
  Source is LectureSource
  Content is LectureSummary
```
