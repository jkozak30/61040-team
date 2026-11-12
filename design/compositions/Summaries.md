# Summaries

A viewer explicitly [summarizes a discussion](reaction:Summaries.Summarize).
Use [video access](view:Discussion.VideoAccess) and read the discussion
snapshot. Pass the revision and a source snapshot with media, thread timestamps,
reply relationships, and message text to Summarizing. The action returns the saved or newly
generated summary. Generation uses a server-side adapter with a timeout.
The WatchParty adapter generates and saves the lecture opener from the first minute on the first
successful overview call for that video entry. Use up to 60 seconds of
merged windows around thread timestamps for each discussion recap.
The recap presents plain-text takeaways across threads and omits filler. Older recap
formats can be refreshed at the same revision. A failure leaves the previous summary available.
Concurrent calls for the same revision share generation within one server
process.

A viewer [reads a saved summary](reaction:Summaries.Read) for an accessible
entry. Return the summary and the current discussion revision so the
browser can indicate staleness.

```endpoints
Summaries.Summarize at /summaries/summarize
Summaries.Read at /summaries/read
```

```computations
summarySource(discussion: Discussing.DiscussionSnapshot, media: MediaSource) : (sourceRevision: Number, source: LectureSource)
  Extracts the revision and timestamped message threads without participant names or identities.

discussionRevision(discussion: Discussing.DiscussionSnapshot) : Number
  Reads the current discussion revision.
```
