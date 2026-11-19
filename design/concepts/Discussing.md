# Discussing

## Purpose

Let a group ask questions about specific parts of a video and return to the answers later.

## Principle

Bob starts a thread at the point where a lecture explains model pruning.
Alice replies while they watch together. The next day, Bob opens the same
video entry at that point and reads their exchange again. A later reply joins
the existing thread.

## Types

```types
external Topic
  The item under discussion. WatchParty uses a saved video entry.

external Author
  The participant responsible for a message.

external Anchor
  A location within the topic. WatchParty uses seconds from the start of a video.

external Context
  Whether a message was posted during a shared watch or independent review.

opaque MessageList
  The opening message and replies, with each message's identity, parent, author, saved name, text, context, and posting time.
```

## State

```state
a set of Threads with
  a topic Topic
  an anchor Anchor

a set of Messages with
  a thread Thread
  an optional parent Message
  an author Author
  a name String
  a text String
  a context Context
  a postedAt DateTime

Rule: Each thread has exactly one message without a parent. It is the opening message.
Rule: A reply's parent is an earlier message in the same thread.
Rule: The topic and anchor of a thread do not change when a reply is added.
Rule: Text is trimmed, nonempty, and at most 2000 UTF-16 code units. The saved name is nonempty.
Rule: Messages keep their original author and saved name if a participant later claims a guest visit.
```

## Actions

```actions
startThread(topic: Topic, author: Author, name: String, anchor: Anchor, text: String, context: Context) : returns (thread: Thread, message: Message)
  where the trimmed text is empty or exceeds 2000 UTF-16 code units, or name is empty
  then
    refuses INVALID_MESSAGE "Write a comment of 1 to 2000 characters."
  where the text and name are valid
  then
    create a thread with topic and anchor
    create its opening message with no parent, author, name, trimmed text, context, and current server time
    returns thread, message

reply(parent: Message, author: Author, name: String, text: String, context: Context) : returns (message: Message)
  where parent is unknown
  then
    refuses THREAD_UNAVAILABLE "This discussion is no longer available."
  where parent exists and the trimmed text is empty or exceeds 2000 UTF-16 code units, or name is empty
  then
    refuses INVALID_MESSAGE "Write a reply of 1 to 2000 characters."
  where parent exists and the text and name are valid
  then
    create a message in the parent's thread with that parent, author, name, trimmed text, context, and current server time
    returns message
```

## Queries

```queries
_thread(thread: Thread) : optional (topic: Topic, anchor: Anchor, messages: MessageList)
  Answers the opening message and replies by posting time and message identity, with each message's parent identity. Answers no row for an unknown thread.

_message(message: Message) : optional (thread: Thread, topic: Topic, anchor: Anchor)
  Answers the parent message's thread, topic, and anchor for an authorized reply composition. Answers no row for an unknown message.

_topicThreads(topic: Topic) : many (thread: Thread, anchor: Anchor, messages: MessageList)
  Answers every thread for the topic, ordered by anchor, opening time, and thread identity. Each thread includes its opening message and replies by posting time and message identity.
```
