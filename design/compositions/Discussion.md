# Discussion

The [video access view](view:Discussion.VideoAccess) uses
[room access](view:Rooms.RoomAccess) and checks that the selected entry
belongs to that room's stream. Both live and local
viewers share the same discussion for that entry.

The [discussion read](reaction:Discussion.Read) returns the selected
entry's threads and reply data at a captured revision. The browser
sorts thread anchors by video position.
The player highlights threads near its own position and can expand
them without moving playback. Reads do not update account history.

```endpoints
Discussion.Read at /discussion/read
```

A viewer [starts a thread](reaction:Discussion.StartThread) with the
entry and the local player's position. Validate the position as
nonnegative video seconds before passing it as the thread anchor. A viewer [replies](reaction:Discussion.Reply)
with a parent message. The [reply access view](view:Discussion.ReplyAccess)
resolves the entry from the parent before checking video access. Both requests use the authorized
participant and display name. The [post access view](view:Discussion.PostAccess) derives the label
from the submitted connection and the entry's shared selection.
Posts with no live connection are historical. A supplied connection
must be active for that viewer and the entry must be live. Stale live
submissions return a conflict. Update an account's saved room activity after a
[thread](reaction:Discussion.SaveThreadActivity) or
[reply](reaction:Discussion.SaveReplyActivity) succeeds. Guests can post
without a saved visit.

```endpoints
Discussion.StartThread at /discussion/start-thread
Discussion.Reply at /discussion/reply
```


```computations
discussionMode(entryLive: Flag, connection?: PlayerConnection, present: Flag) : (context: DiscussionContext, writable: Flag)
  Classifies local review as historical and an active shared connection on the selected entry as live.
```
