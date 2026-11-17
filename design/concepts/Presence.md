# Presence

## Purpose

Track who is still connected to a shared activity.

## Principle

Each connection reports when it was last seen. A subject is present while
any of its connections are active. A group can be reusable or drain when its
last connection leaves or expires.

## Types

```types
external Scope
  The shared activity's location.

external PresenceSubject
  The external identity whose connections are tracked.

external Connection
  An identity for one connection.

Status is OPEN or DRAINED or CLOSED
  Whether a group accepts connections, has drained, or has been closed.
```

## State

```state
a set of Groups with
  a scope Scope
  a reusable Flag
  a status Status
  unique scope and reusable

a set of Presences with
  a group Group
  a subject PresenceSubject
  a connection Connection
  a lastSeen DateTime
  unique group and connection

Rule: A presence is active for 60 seconds after lastSeen.
Rule: A drained or closed group accepts no new presence.
Rule: Omitting reusable selects the non-reusable group. Reusable groups stay open when empty.
```

## Actions

```actions
keepPresent(scope: Scope, subject: PresenceSubject, connection: Connection, reusable?: Flag) : returns ()
  where the group is drained or closed, the connection belongs to another subject, or a non-reusable group has recorded presences and all have expired
  then
    refuses PRESENCE_UNAVAILABLE "This connection cannot join the presence group."
  where no group exists or the open group can accept this connection
  then
    create an open group if necessary
    for a reusable group, remove expired connections
    add the connection or advance its lastSeen to the current time if later
    returns

leave(scope: Scope, subject: PresenceSubject, connection: Connection, reusable?: Flag) : returns (drained: Flag)
  where the connection belongs to a different subject
  then
    refuses LEAVE_NOT_OWNER "This connection belongs to another subject."
  where the connection is absent or belongs to subject
  then
    remove the connection and expired presences from the open group if present
    mark a previously occupied non-reusable group drained if no presences remain
    set drained to whether this action drained the group
    returns drained

expirePresence(scope: Scope) : returns (drained: Flag)
  where true
  then
    in the non-reusable group, remove expired presences from the open group if present
    mark a previously occupied non-reusable group drained if no presences remain
    set drained to whether the group is now drained
    returns drained

close(scope: Scope) : returns ()
  where true
  then
    create or mark the non-reusable group closed and remove its presences
    returns
```

## Queries

```queries
_presentSubjects(scope: Scope, reusable?: Flag) : many (subject: PresenceSubject)
  Answers one row per subject with an active connection in the selected group, in first active connection order. Answers no rows otherwise.

_connectionPresence(scope: Scope, subject: PresenceSubject, connection?: Connection) : one (present: Flag)
  Answers whether that exact subject connection is present in the non-reusable group. An omitted connection is absent.

_due() : many (scope: Scope)
  Answers up to 100 non-reusable groups that are drained or have expired connections, in scope order. Answers no rows if none are due.
```
