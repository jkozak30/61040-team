# Summarizing

## Purpose

Save a generated overview and record which revision of a source it covers.

## Principle

A caller summarizes a source snapshot at a particular revision.
A saved result can be reopened and refreshed when the source changes.

## Types

```types
external Topic
  The subject whose source is summarized.

external Source
  The snapshot supplied to the generator.

external Content
  The generated summary data.

opaque Summary
  The content, covered revision, generation time, and format.
```

## State

```state
a set of Summaries with
  a unique topic Topic
  a sourceRevision Number
  a content Content
  a generatedAt DateTime
  an optional format String

Rule: A saved summary never moves to an earlier source revision.
```

## Actions

```actions
summarize(topic: Topic, sourceRevision: Number, source: Source) : returns (summary: Summary)
  where sourceRevision is not a positive integer or source is empty
  then
    refuses EMPTY_SOURCE "There is no source material to summarize."
  where the source is valid and a saved summary covers a later revision or the same revision in the current format
  then
    set summary to the saved summary
    returns summary
  where generation is needed and fails
  then
    refuses SUMMARY_UNAVAILABLE "Could not generate a summary. Try again."
  where generation is needed and succeeds
  then
    save the content if it advances coverage or upgrades the same revision
    set summary to the newest saved summary
    returns summary
```

## Queries

```queries
_saved(topic: Topic) : one (summary: Summary)
  Answers the newest saved summary, or null if none exists.
```
