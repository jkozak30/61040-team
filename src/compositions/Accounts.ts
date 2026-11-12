import { endpoint, receive, respond, type EndpointValidator } from "@mit-sdg/sync-engine/boundary";
import { compute, no, where } from "@mit-sdg/sync-engine/language";
import { computations, concepts } from "../concepts.ts";

const { Authenticating, Sessioning } = concepts;
const { accountSubject, guestSubject, identifySubject } = computations;

const textInput: EndpointValidator = (value) => {
  const ok = typeof value === "object" && value !== null && !Array.isArray(value)
    && Object.entries(value).every(([name, field]) =>
      typeof field === "string" || (name === "session" && field === null));
  return ok ? { ok: true } : { ok: false, detail: "Expected text fields." };
};
export const options = { validators: { input: textInput } };

const StartGuest = endpoint("/auth/guest", ({ session, subject, expiresAt, issuedSession }) =>
  receive({ session }).then(
    where(Sessioning._active({ session }).is({ expiresAt }))
      .then(respond({ issuedSession: session, expiresAt }))
      .named("existing"),
    where(no(Sessioning._active({ session })), compute(guestSubject, {}, subject))
      .then(Sessioning.start({ subject }).responds({ session: issuedSession, expiresAt }))
      .then(respond({ issuedSession, expiresAt }))
      .named("fresh"),
  ), options);

const Register = endpoint("/auth/register", ({ session, username, password, account, subject, issuedSession, expiresAt }) =>
  receive({ session, username, password })
    .then(Authenticating.register({ username, password }).responds({ account }))
    .then(
      where(Sessioning._active({ session }).is({}), compute(accountSubject, { account }, subject))
        .then(Sessioning.replace({ session, subject }).responds({ replacement: issuedSession, expiresAt }))
        .then(respond({ account, issuedSession, expiresAt }))
        .named("replace"),
      where(no(Sessioning._active({ session })), compute(accountSubject, { account }, subject))
        .then(Sessioning.start({ subject }).responds({ session: issuedSession, expiresAt }))
        .then(respond({ account, issuedSession, expiresAt }))
        .named("start"),
    ), options);

const SignIn = endpoint("/auth/login", ({ session, username, password, account, subject, issuedSession, expiresAt }) =>
  receive({ session, username, password })
    .then(Authenticating.authenticate({ username, password }).responds({ account }))
    .then(
      where(Sessioning._active({ session }).is({}), compute(accountSubject, { account }, subject))
        .then(Sessioning.replace({ session, subject }).responds({ replacement: issuedSession, expiresAt }))
        .then(respond({ account, issuedSession, expiresAt }))
        .named("replace"),
      where(no(Sessioning._active({ session })), compute(accountSubject, { account }, subject))
        .then(Sessioning.start({ subject }).responds({ session: issuedSession, expiresAt }))
        .then(respond({ account, issuedSession, expiresAt }))
        .named("start"),
    ), options);

const Me = endpoint("/auth/me", ({ session, subject, account, username }) =>
  receive({ session })
    .then(Sessioning.current({ session }).responds({ subject }))
    .then(
      where(compute(identifySubject, { subject }, { kind: "guest", account: null }))
        .then(respond({ kind: "guest" }))
        .named("guest"),
      where(
        compute(identifySubject, { subject }, { kind: "account", account }),
        Authenticating._username({ account }).is({ username }),
      )
        .then(respond({ kind: "account", account, username }))
        .named("account"),
    ), options);

const SignOut = endpoint("/auth/logout", ({ session }) =>
  receive({ session })
    .then(Sessioning.end({ session }).responds({}))
    .then(respond({})), options);

export const composition = { StartGuest, Register, SignIn, Me, SignOut };
