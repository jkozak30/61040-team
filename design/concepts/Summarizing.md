# Summarizing

## Purpose

Help students revisit a video discussion and optionally understand it using video evidence, without replacing original messages.

## Principle

Bob generates a recap of the group's discussion, then enhances it with a separately styled video overview and suggested answers linked to threads and video timestamps. A new comment makes discussion-derived content stale. Bob regenerates it; the video overview can be reused. Failed generation never replaces a valid result.

## Types

```types
external Topic
  A saved video entry.

opaque SummaryItems
  Verified discussion threads, anchors, and original messages in stable order.

opaque VideoOverview
  Video-only text, video identity, and generation time.

opaque VideoSource
  A verified saved video source, including its provider and video identifier.

opaque SummaryResult
  A discussion recap with baseline identity, source snapshot fingerprint and version, recap format, thread references, and generation time; optionally separate video-derived additions.

opaque SummaryView
  A current result or a stale marker with a discussion-change or format-update reason, enhancement preference, and optional cached video overview. Stale views contain no discussion text or suggested answers.
```

## State

```state
a set of Summaries with
  a topic Topic
  a version Number
  a generation Number
  an optional result SummaryResult
  a hadSummary Flag
  an enhanced Flag
  an optional videoOverview VideoOverview

Rule: A generation saves only for its captured version and generation claim; a later request supersedes an earlier request.
Rule: Enhancement saves only for the exact baseline identity, source fingerprint and version it enhanced.
Rule: Reading compares current source items with the saved fingerprint, so changed discussion is never returned as current.
Rule: Invalidating advances the version and removes all discussion-derived text and answers. The video-only overview and enhancement preference remain.
Rule: Existing results without source metadata or with an older recap format are stale until regenerated; cached video-only context remains available.
```

## Actions

```actions
request(topic: Topic, items: SummaryItems, expectedVersion: Number) : returns (summary: SummaryView)
  where there are no valid discussion items, too many items, generation fails, or the version or generation claim changes
  then
    refuses SUMMARY_UNAVAILABLE "Could not generate a current discussion overview."
  where verified items are supplied and generation succeeds for the current claim and version
  then
    save a new discussion recap with original thread references, fingerprint, unique baseline identity and time; retain the video-only overview and enhancement preference
    returns summary

enhance(topic: Topic, items: SummaryItems, source: VideoSource, expectedBaseline: String) : returns (summary: SummaryView)
  where the baseline is absent or stale, the source is unsupported, evidence or references are invalid, generation fails, or the baseline or version changes
  then
    refuses SUMMARY_UNAVAILABLE "Could not enhance this overview."
  where the exact current baseline is supplied and video analysis succeeds
  then
    retain the discussion recap unchanged; attach a separate video overview and evidence-based suggested answers with thread identities and video timestamps; reuse an existing overview for the same video; remember that enhancement was enabled
    returns summary

invalidate(topic: Topic) : returns ()
  where true
  then
    remove the discussion recap and suggested answers and advance the version, preserving video-only context and enhancement preference
    returns
```

## Queries

```queries
_version(topic: Topic) : optional (version: Number)
  Answers the current version, or zero before the first invalidation or generation.

_summary(topic: Topic, items: SummaryItems) : optional (summary: SummaryView)
  Answers the current overview or a stale marker with video-only context; never returns stale recap text or suggested answers.
```
