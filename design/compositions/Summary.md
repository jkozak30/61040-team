# Summary

A room member [reads the saved AI overview](reaction:Summary.Read) for a
listed video entry. The [discussion access view](view:Discussion.DiscussionAccess)
checks the session, room membership, and that this video entry belongs to the room.
An unknown overview returns no saved summary.

A member [requests a new AI overview](reaction:Summary.Request) for a listed
video entry. The composition retrieves the saved discussion threads directly from
Discussing and passes those source messages to Summarizing. The service sends only
discussion text to Gemini, not the media audio or video itself. Generated content
retains links to original thread identities. A failed generation preserves the
last successful summary. An empty discussion yields a refusal.

```endpoints
Summary.Read at /summary/read
Summary.Request at /summary/request
```
