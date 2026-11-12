# Watch

An authorized viewer [opens the watch](reaction:Watch.Open) when they
enter the watch page. Use [room access](view:Rooms.RoomAccess), then call
Streaming.open for the room. This returns the existing watch when one
is already present, including an ended watch.

```endpoints
Watch.Open at /watch/open
```

The [watch read](reaction:Watch.Read) requires [room access](view:Rooms.RoomAccess).
The [member watch view](view:Watch.WatchAccess) resolves a stream after
checking room membership. The [owner watch view](view:Watch.OwnerWatchAccess)
requires the owner before resolving the stream.
The [watch former](former:Watch.WatchState) returns the ordered video
entries, current entry, shared playback snapshot, end status, and control
events after the client's last revision through the snapshot revision,
and the present viewers with display names and owner markers. Each control
event includes the
actor identity and display name for the browser's colored notification.
The response includes ownership, the participant roster, eligible transfer candidates based on room presence, and the
shared viewer list based on live-watch presence.
This read does not renew presence or update saved history.

```endpoints
Watch.Read at /watch/read
```

An authorized viewer [keeps a player present](reaction:Watch.KeepPresent)
while following the live watch. Sessioning records lastSeen separately
from the sign-in session. Use a distinct connection identity per
player. The [leave endpoint](reaction:Watch.Leave) removes only that
viewer's connection and leaves the room visit and sign-in intact.
The [drained-watch reaction](reaction:Watch.EndDrainedWatch) ends playback
when the last connection leaves. A server sweep checks expired player
sessions every five seconds and ends watches whose groups have drained.
A drained group refuses new connections while the watch is being ended.

```endpoints
Watch.KeepPresent at /watch/presence
Watch.Leave at /watch/leave
```

The owner can [add a YouTube video](reaction:Watch.AddVideo) at any time
using [owner access](view:Rooms.OwnerAccess). Preview playback must succeed
before the browser submits it. Build the media source from the validated
YouTube ID and optional title. Adding leaves the shared selection alone.

The owner can [start one live watch](reaction:Watch.Start) on a listed
video, [switch the shared video](reaction:Watch.SwitchVideo), or
[end shared playback](reaction:Watch.End). Ending is terminal. Viewers
can open any listed video locally and explicitly join the live watch.
Starting or switching live playback leaves local players alone. The watch
page uses the video selector for the viewer's current mode. The owner can
change the shared selection, and an independent viewer changes only their
own video.

```endpoints
Watch.AddVideo at /watch/add-video
Watch.Start at /watch/start
Watch.SwitchVideo at /watch/switch-video
Watch.End at /watch/end
```

A [playback command](reaction:Watch.Control) uses room access and
passes the authorized viewer and a playback command to
Streaming only if Sessioning reports that exact viewer connection present.
Streaming then checks the selected entry and revision. The browser reports
accepted changes from other viewers and reads the latest snapshot after
a stale command. A read with no prior
revision sends zero. A watch must be opened before its other controls
are available.

```endpoints
Watch.Control at /watch/control
```

A signed-in account [lists its past streams](reaction:Watch.History).
The [watch history former](former:Watch.SavedWatches) reads saved
rooms with the account’s participant, ownership, and last join time. Owners can add a video from history without entering the room. It adds watch status, end time,
and the selected video and ordered entries when available. A room without a stream still appears as a saved room.
A saved video shortcut opens that video locally. The room offers a
separate action to join shared playback while live.

```endpoints
Watch.History at /watch/history
```


```computations
youtubeSource(videoId: String, previewTitle?: String) : MediaSource
  Builds a YouTube media source from the validated ID and optional preview title.

watchLive(snapshot: Streaming.WatchSnapshot) : (live: Flag)
  Determines whether shared playback has started and has not ended.

watchRevision(snapshot: Streaming.WatchSnapshot) : Number
  Reads the revision that bounds the control feed.

playbackCommand(entry: Streaming.VideoEntry, expectedRevision: Number, operation: String, position?: Number, offset?: Number) : Streaming.PlaybackCommand
  Builds a command from the HTTP fields. A seek without one valid target is refused by Streaming.
```
