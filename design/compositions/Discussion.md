# Discussion

Instantiate Discussing with a Watching.VideoEntry as
Topic, a RoomJoining.Participant as Author, a finite nonnegative Number of
video seconds as Anchor, and LIVE or HISTORICAL as Context. The implementation
is selected by the application assembly.

The [discussion access view](view:Discussion.DiscussionAccess) verifies membership and entry ownership.

A room member [starts a thread](reaction:Discussion.StartThread) on a
listed video. Resolve the session through [room access](view:Rooms.RoomAccess),
then read the room's Stream and its video list to confirm that the entry is
listed there. The browser supplies a position in seconds from the video,
not a wall-clock time. Reject a position that is not finite and nonnegative.
Take the canonical author and saved display name from the verified
participant, not from the request.

A member [replies](reaction:Discussion.Reply) to an existing message.
Resolve the parent through Discussing's message lookup to find its thread and video entry,
then make the same room and entry checks before posting. The new message
uses the parent's thread. A client cannot choose another room, thread, or
author for that reply.

For a LIVE post, require the requested entry to be the Stream's selected
entry, the watch to be live, and the exact canonical participant connection
to be present in the live watch.
For a HISTORICAL post, require room access and a listed entry; the Stream
may be live, unstarted, or ended, because the student is using local
playback. The server passes LIVE or HISTORICAL to Discussing only after
these checks. A watch ending between a LIVE request and acceptance rejects
that request; the student can retry from local review.

```endpoints
Discussion.StartThread at /discussion/start-thread
Discussion.Reply at /discussion/reply
```

A member [lists threads](reaction:Discussion.ListThreads) for one video
entry or [opens a thread](reaction:Discussion.ReadThread) from a timestamp
or summary reference. Both reads check the session, room membership, and
entry ownership before returning messages. A thread link alone grants no
access. Return the saved display name, author, posting time, context, and
parent for each message so the browser can show replies in order. A thread
timestamp opens that video in local playback at the saved position; if the
student is following a live watch, opening the thread does not seek the
group's player.

The same guarded thread list supplies the original messages to
Summarizing. A summary should reference thread IDs and their anchors,
not copy a separate discussion history. The [topic threads former](former:Discussion.TopicThreads)
provides the ordered threads for display.
Two entries with the same YouTube URL have separate discussions, because
the saved entry, rather than the URL, is the thread topic.

```endpoints
Discussion.ListThreads at /discussion/threads
Discussion.ReadThread at /discussion/thread
```

An invalid or empty message leaves state unchanged. An unknown parent or
video returns an unavailable response; a request without room access is
forbidden.

A member can [edit](reaction:Discussion.EditMessage) or [delete](reaction:Discussion.DeleteMessage)
only their own comment. The [owned message view](view:Discussion.OwnedMessage)
resolves its video entry and author through Discussing, then checks room
membership and entry ownership. Editing
replaces the text; deleting clears it while keeping the message identity and
replies in place. Both changes remove the saved AI overview for that entry,
which may contain the old text. A member can generate a fresh overview later.

```endpoints
Discussion.EditMessage at /discussion/edit-message
Discussion.DeleteMessage at /discussion/delete-message
```

```computations
listedVideo(entries: Watching.VideoList, entry: Watching.VideoEntry) : (listed: Flag)
  Answers whether the room Stream's ordered video list contains the requested entry.

liveVideo(snapshot: Watching.WatchSnapshot, entry: Watching.VideoEntry) : (live: Flag)
  Answers whether this entry is selected in a started watch that has not ended.

isHistorical(mode: String) : (historical: Flag)
  Answers whether the request is from independent playback rather than live playback.
```

The [edit invalidation reaction](reaction:Discussion.InvalidateEditedOverview) invalidates the saved overview only when the accepted edit changes text. Saving identical trimmed text preserves the edit time and saved overview. Canceling an edit sends no request.

Deleting a reply-free message removes it. A deleted message with surviving replies is retained as an anonymous placeholder, and an empty deleted branch is pruned when its last reply is removed.
