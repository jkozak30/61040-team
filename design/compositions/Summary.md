# Summary

A room member [reads the AI overview](reaction:Summary.Read) for a listed video entry.
The [discussion access view](view:Discussion.DiscussionAccess) verifies the session,
room membership, and listed entry. The composition supplies current discussion items
to Summarizing so reads check the exact source fingerprint. Unknown overviews return
null; previously generated but changed discussion returns a stale marker without
its old text or suggested answers. A cached video overview remains readable.

A member [generates a discussion recap](reaction:Summary.Request). The composition
reads the version before retrieving original discussion items. Summarizing retains
the three-section discussion-only recap (what the discussion covered, questions raised, still open). Version and generation-claim
checks reject outdated results, including concurrent regeneration requests.

A member [enhances the exact baseline](reaction:Summary.Enhance). The composition
retrieves the saved source from Watching, not from client-supplied URLs, along with
verified discussion items. Summarizing sends the public YouTube video as media input
for an overall video overview and evidence-based suggested answers. Additions are
stored separately; the original recap is unchanged. Answers cite supplied thread
identities and video timestamps. Unsupported evidence is omitted. Failed enhancement
preserves a valid baseline. Baseline identity and version checks reject late results.

Regenerate builds a fresh discussion recap. Enhancement is always a separate,
explicit user request for that exact new baseline; it never runs automatically. A
cached overview of the same video is reused verbatim; the video is still supplied
when producing new answers. Failed enhancement leaves the fresh baseline available. The UI shows only Generate/Regenerate for absent or stale recaps, only Enhance for a current unenhanced recap, and neither button for a current enhanced recap.

Every successful new thread, reply, actual edit, or deletion invalidates the
recap and suggested answers. The composition preserves video-only context.

```endpoints
Summary.Read at /summary/read
Summary.Request at /summary/request
Summary.Enhance at /summary/enhance
```

```computations
summaryVideoSource(entries: Watching.VideoList, entry: Watching.VideoEntry) : (source: MediaSource)
  Selects the source of the already verified listed entry. The caller cannot supply a different video URL.
```

The UI shows a cached video overview first, followed by the three discussion sections. Suggested answers remain blue additions inside Still open. Yellow timestamp citations open and hold the matching discussion thread without changing playback; blue video timestamps explicitly seek the video. Inline citations preserve the model's actual thread associations; any unplaced references appear in a compact row before the unverified-answer notice.

Enhancement uses one normal whole-video request, preserving the original overall-video prompt and cached overview. Suggested answers select exact question message identities, which are mapped back to their verified threads. Evidence kinds restrict transcription to wording questions, artist inspiration to explicit statements, and counts to visual counts or explicit statements. Answers for unrelated message IDs, incompatible evidence kinds, or nonlocal wording timestamps are omitted. No follow-up clip requests are made. One retry is permitted for transient provider failures within a shared 60-second deadline. Older answer formats are hidden so Enhance becomes available again, retaining the discussion recap and cached video overview.

Each recap bullet represents one coherent topic or tightly related question group. Closely related observations or follow-ups may be combined when they develop the same point or need the same explanation; independent topics are not merged merely because they concern the same video. A recap from an older prompt format returns a format-stale marker, enabling regeneration without changing discussion messages. Cached video-only context is retained.
