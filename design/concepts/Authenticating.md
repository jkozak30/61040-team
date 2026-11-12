# Authenticating

## Purpose

Let people create an account and return to it by proving who they are with a password.

## Principle

A person registers a username and password and later authenticates with them.
A second registration of that username is refused. An unknown username
or incorrect password is refused with the same message.

## Types

```types
opaque Secret
  A password verifier derived with a random salt.
```

## State

```state
a set of Accounts with
  a unique username String
  a verifier Secret

Rule: Usernames are stored in lowercase and compared without regard to ASCII letter case.
Rule: Store the encoded Argon2id verifier with its salt and parameters. Never store the password.
```

## Actions

```actions
register(username: String, password: String) : returns (account: Account)
  where username is not 3 to 32 ASCII letters, digits, underscores, or hyphens
  then
    refuses INVALID_USERNAME "A username must have 3 to 32 letters, digits, underscores, or hyphens."
  where username is valid but password is not 10 to 128 characters
  then
    refuses INVALID_PASSWORD "A password must have 10 to 128 characters."
  where username and password are valid but the normalized username is taken
  then
    refuses USERNAME_TAKEN "That username is taken."
  where username and password are valid and the normalized username is available
  then
    derive a verifier from password with a fresh random salt
    create account with the normalized username and verifier together
    returns account

authenticate(username: String, password: String) : returns (account: Account)
  where username is unknown or password does not match its verifier
  then
    refuses INVALID_CREDENTIALS "The username or password is incorrect."
  where username identifies an account and password matches its verifier
  then
    set account to the matching account
    returns account
```

## Queries

```queries
_username(account: Account) : optional (username: String)
  Answers the account's username, or no row for an unknown account.
```
