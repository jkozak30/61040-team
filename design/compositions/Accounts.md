# Accounts

A browser [starts a guest session](reaction:Accounts.StartGuest) when it
needs to join and has no active session. The server assigns a fresh
visitor identity. An existing session keeps its subject.

[Registration](reaction:Accounts.Register) creates a password account.
[Sign-in](reaction:Accounts.SignIn) verifies an existing account's
password. Either starts an account session or replaces the active
session with a fresh account session.

The [current identity endpoint](reaction:Accounts.Me) identifies the
browser as a guest or returns its account and username.
[Sign-out](reaction:Accounts.SignOut) revokes the current session
and clears its cookie. Other sessions stay active.

Use ConceptBox's password-only cookie flow. Issue or replace the
HttpOnly session cookie at the HTTP boundary. Passwords, verifiers,
and session tokens stay out of response bodies and logs.

```endpoints
Accounts.StartGuest at /auth/guest
Accounts.Register at /auth/register
Accounts.SignIn at /auth/login
Accounts.Me at /auth/me
Accounts.SignOut at /auth/logout
```

```computations
guestSubject() : SessionSubject
  Supplies a fresh guest identity when no active session is present.

accountSubject(account: Account) : SessionSubject
  Encodes a verified account as a session subject.

identifySubject(subject: SessionSubject) : SessionIdentity
  Reads the identity kind and account identity from the stored subject.
```

Incorrect credentials return a forbidden response and preserve the
current cookie. A refused session token returns unauthorized and can
clear that cookie.
