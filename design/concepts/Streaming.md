# Streaming

## Purpose

Keep viewers together in a shared watch and let them revisit its videos independently.

## Principle

A group starts with a paused video. A participant plays, pauses, or seeks
and the others receive that change. Switching videos changes the shared
player. When the watch ends, its videos remain available for independent viewing.

## Types

```types
external Scope
  The place where one shared watch occurs.

external Viewer
  The participant responsible for a control or presence update.

external Media
  The source of a playable item, supplied by the caller.

opaque WatchSnapshot
  The playback anchor, selected entry, end time, and revision.

opaque VideoList
  The ordered list of entries and their media sources.

opaque WatchHistory
  The watch status and selected entry when present.

Playback is PLAYING or PAUSED
  The shared player's mode.

Control is PLAY or PAUSE or SEEK
  The requested operation.

opaque PlaybackCommand
  The selected entry, expected revision, and operation. Seek carries an absolute position or relative jump.

opaque ControlEvent
  The accepted entry, operation, resulting position, offset, and revision.
```

## State

```state
a set of Streams with
  a unique scope Scope
  an optional activeEntry VideoEntry
  an optional endedAt DateTime
  a playback Playback
  a position Number
  a positionAt DateTime
  a revision Number

a set of VideoEntries with
  a stream Stream
  a source Media
  an order Number
  unique stream and order

a set of ControlEvents with
  a stream Stream
  an entry VideoEntry
  a viewer Viewer
  an operation Control
  a position Number
  an offset Number
  a revision Number
  unique stream and revision

Rule: Keep the latest 128 control events per stream. The playback snapshot is authoritative.

Rule: A stream without an active entry has not started. A stream with endedAt cannot restart.
Rule: A stream's active entry belongs to that stream.
Rule: Position is a finite nonnegative number of seconds at positionAt.
Rule: An ended stream retains its entries and accepts no further shared controls.
Rule: Ending a stream captures its current position, pauses it, records the server time in endedAt, advances the revision.
```

## Actions

```actions
open(scope: Scope) : returns (stream: Stream)
  where a stream already exists for scope
  then
    set stream to the existing stream
    returns stream
  where no stream exists for scope
  then
    create stream with no active entry, playback PAUSED, position zero, current server time, and revision zero
    returns stream

addVideo(stream: Stream, source: Media) : returns (entry: VideoEntry, revision: Number)
  where stream is unknown
  then
    refuses ADD_VIDEO_UNAVAILABLE "This room cannot accept another video."
  where stream exists
  then
    append a new entry with source without changing playback
    increment and return the stream revision
    returns entry, revision

start(stream: Stream, entry: VideoEntry) : returns (revision: Number)
  where stream exists, has never been live, and entry belongs to stream
  then
    make entry active and set playback to PAUSED and position to zero at the current server time
    increment the revision
    returns revision
  where stream is unknown, has already started or ended, or entry does not belong to stream
  then
    refuses VIDEO_UNAVAILABLE "This room cannot start another live watch."

switchVideo(stream: Stream, entry: VideoEntry) : returns (revision: Number)
  where stream is unknown, has not started, has ended, or entry does not belong to stream
  then
    refuses VIDEO_UNAVAILABLE "This video cannot be selected for the live watch."
  where stream is live and entry is already active
  then
    set revision to the current revision
    returns revision
  where stream is live and entry belongs to stream but is not active
  then
    make entry active and set playback to PAUSED and position to zero at the current server time
    increment and return the stream revision
    returns revision

control(stream: Stream, viewer: Viewer, command: PlaybackCommand) : returns (revision: Number, changed: Flag)
  where stream is unknown or ended or entry is not active
  then
    refuses CONTROL_UNAVAILABLE "This player cannot control the live watch."
  where entry is active in a live stream and the operation is SEEK but neither a valid absolute position nor a valid relative offset is supplied exclusively
  then
    refuses INVALID_SEEK "Choose a valid playback position."
  where entry is active in a live stream and the valid operation is PLAY while playing or PAUSE while paused
  then
    set revision to the current revision and changed to false
    returns revision, changed
  where entry is active in a live stream and the valid operation would change playback but expectedRevision differs from the current revision
  then
    refuses STALE_PLAYBACK "Playback changed. Try again from the current position."
  where entry is active in a live stream and the valid operation would change playback and expectedRevision matches
  then
    for SEEK, set the requested absolute position or apply a 10-second offset to the current position, stopping at zero, and retain the playback mode
    for PLAY or PAUSE, capture the current position and set the requested mode
    set positionAt to the current server time and increment the revision
    record the accepted control with stream, entry, viewer, operation, resulting position, requested offset or zero, and the new revision
    set changed to true
    returns revision, changed

end(stream: Stream) : returns (ended: Flag)
  where stream is unknown
  then
    refuses UNKNOWN_STREAM "This watch does not exist."
  where stream exists and has not started
  then
    refuses VIDEO_UNAVAILABLE "There is no live watch to end."
  where stream already ended
  then
    set ended to false
    returns ended
  where stream is live
  then
    capture its current position and set playback to PAUSED
    set endedAt to the current server time and increment its revision
    set ended to true
    returns ended
```

## Queries

```queries
_stream(scope: Scope) : optional (stream: Stream, snapshot: WatchSnapshot, entries: VideoList)
  Answers the stored playback anchor and ordered video entries, or no row if scope has no stream.

_discussionEntry(scope: Scope, entry: VideoEntry) : optional (live: Flag, source: Media)
  Answers no row if entry is outside the scope. Includes the media source. An entry is live only while active in an ongoing watch.

_historyWatch(scope: Scope) : one (watch: WatchHistory)
  Answers the status, end time when present, ordered media entries, and the selected entry when present. Answers NOT_STARTED with an empty list if scope has no stream.

_controlsAfter(stream: Stream, afterRevision: Number, throughRevision: Number) : many (viewer: Viewer, event: ControlEvent)
  Answers retained control events after afterRevision and through throughRevision, in revision order.
```
