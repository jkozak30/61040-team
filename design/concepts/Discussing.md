# Discussing

## Purpose

Keep threads and replies attached to relevant places in a topic.

## Principle

An author starts a thread at an anchor in a topic. Others reply to the
opening message or another reply. Each message retains the context
assigned when it was posted.

## Types

```types
external Topic
  The subject discussed in a thread.

external Author
  The identity responsible for a message.

external Anchor
  A location within the topic, supplied by the caller.

external Context
  A classification of each message, supplied by the caller.

opaque DiscussionSnapshot
  The revision, threads, and messages read together.
```

## State

```state
a set of Discussions with
  a unique topic Topic
  a revision Number

a set of Threads with
  a discussion Discussion
  an anchor Anchor

a set of Messages with
  a thread Thread
  an optional parent Message
  an author Author
  a name String
  a text String
  a context Context
  a postedAt DateTime
  a revision Number

Rule: Each thread has one opening message with no parent.
Rule: A reply's parent belongs to the same thread and was posted earlier.
Rule: Each accepted message advances its discussion's revision by one.
```

## Actions

```actions
startThread(topic: Topic, author: Author, name: String, anchor: Anchor, text: String, context: Context) : returns (thread: Thread, message: Message, revision: Number)
  where the trimmed text is empty
  then
    refuses INVALID_THREAD "Enter an opening message."
  where the trimmed text is nonempty
  then
    find or create the discussion for topic with initial revision zero
    create thread in that discussion at anchor
    advance the discussion revision
    create message in thread with no parent, author, name, trimmed text, context, the current server time, and the new revision
    returns thread, message, revision

reply(parent: Message, author: Author, name: String, text: String, context: Context) : returns (message: Message, revision: Number)
  where parent is unknown
  then
    refuses UNKNOWN_PARENT "This message is unavailable."
  where parent exists and the trimmed text is empty
  then
    refuses EMPTY_REPLY "Enter a reply."
  where parent exists and the trimmed text is nonempty
  then
    resolve the thread and discussion from parent
    advance the discussion revision
    create message in the same thread with parent, author, name, trimmed text, context, the current server time, and the new revision
    returns message, revision
```

## Queries

```queries
_topic(message: Message) : optional (topic: Topic)
  Answers the topic of the message's thread, or no row if the message is unknown.

_discussion(topic: Topic) : one (discussion: DiscussionSnapshot)
  Answers one consistent snapshot of the revision, threads in creation order, and messages in revision order. Answers revision zero and empty lists if no discussion exists.
```
