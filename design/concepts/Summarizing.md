# Summarizing

## Purpose

Help a group find earlier discussion by saving an overview with links to the original threads.

## Principle

Bob requests an overview of the discussion on a video. It points him to the
thread about pruning. When the group adds more replies, he can request a new
overview. If generation fails, the old one remains available.

## Types

```types
external Topic
  The item whose discussion is summarized. WatchParty uses a saved video entry.

external Item
  An original discussion thread that can be opened from the overview.

opaque SummaryInput
  A list of items with their identifiers and discussion text.

opaque SummaryRecord
  The overview text, referenced item identities, and generation time.
```

## State

```state
a set of Summaries with
  a unique topic Topic
  a content String
  a referencedItems set of Item
  a generatedAt DateTime

Rule: Every referenced item was in the input to the successful generation.
Rule: Failed generation leaves the previously saved summary unchanged.
```

## Actions

```actions
summarize(topic: Topic, items: SummaryInput) : returns (failed: Flag)
  where items are empty
  then
    refuses NO_DISCUSSION "There is no discussion to summarize yet."
  where items are nonempty and generation fails or returns a reference outside the input
  then
    set failed to true
    returns failed
  where items are nonempty and generation returns a valid overview
  then
    save the overview, its referenced items, and the current server time for topic
    set failed to false
    returns failed
```

## Queries

```queries
_summary(topic: Topic) : optional (summary: SummaryRecord)
  Answers the saved overview, or no row when none has been generated.
```
