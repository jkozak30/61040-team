# Summarizing

## Purpose

Help students revisit the important points in a saved video discussion without replacing original messages.

## Principle

After discussing a recorded lecture, Bob requests an AI overview of questions and answers. The overview cites the original thread identifiers. The generated overview is saved and remains available when a later generation fails.

## Types

```types
external Topic
  A saved video entry.

opaque SummaryItems
  Verified discussion thread identifiers, anchors, and their original messages.

opaque SummaryResult
  Generated text, referenced thread identities, and generation time.
```

## State

```state
a set of Summaries with
  a topic Topic
  a version Number
  an optional result SummaryResult

Rule: Each topic has at most one saved summary, replaced only by a successful generation for its current version.
Rule: Invalidating a topic removes its saved result and advances its version, so an earlier generation cannot restore it.
```

## Actions

```actions
request(topic: Topic, items: SummaryItems, expectedVersion: Number) : returns (summary: SummaryResult)
  where there are no discussion items, too many items, text generation fails, or the topic's version differs from expectedVersion
  then
    refuses SUMMARY_UNAVAILABLE "Could not generate the overview. Try again after discussion."
  where valid discussion items are supplied and text generation succeeds
  then
    save the generated text with original thread references and current server time only if the topic still has expectedVersion;
    returns summary

invalidate(topic: Topic) : returns ()
  where true
  then
    remove any saved summary for the topic and advance its version
    returns
```

## Queries

```queries
_version(topic: Topic) : optional (version: Number)
  Answers the current version of the topic, or zero before its first summary.

_summary(topic: Topic) : optional (summary: SummaryResult)
  Answers the last successful generated overview for the entry, if any.
```
