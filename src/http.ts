import { httpPolicy } from "@mit-sdg/sync-engine-http/policy";

export const policy = httpPolicy({
  publicOrigin: process.env.PUBLIC_ORIGIN ?? "http://127.0.0.1:8080",
  basePath: "/api",
  publicErrors: {
    ADD_VIDEO_UNAVAILABLE: "CONFLICT",
    VIDEO_UNAVAILABLE: "CONFLICT",
    PRESENCE_UNAVAILABLE: "CONFLICT",
    LEAVE_NOT_OWNER: "FORBIDDEN",
    CONTROL_UNAVAILABLE: "CONFLICT",
    INVALID_SEEK: "INVALID_REQUEST",
    STALE_PLAYBACK: "CONFLICT",
    UNKNOWN_STREAM: "NOT_FOUND",
    THREAD_UNAVAILABLE: "NOT_FOUND",
    INVALID_MESSAGE: "INVALID_REQUEST",
    SUMMARY_UNAVAILABLE: "CONFLICT",
    FORBIDDEN: "FORBIDDEN",
    INVALID_OWNER_NAME: "INVALID_REQUEST",
    INVALID_ROOM_CODE: "NOT_FOUND",
    INVALID_JOIN_NAME: "INVALID_REQUEST",
    VISIT_NOT_CLAIMABLE: "FORBIDDEN",
    OWNERSHIP_TRANSFER_UNAVAILABLE: "FORBIDDEN",
    NO_SAVED_VISIT: "FORBIDDEN",
    INVALID_USERNAME: "INVALID_REQUEST",
    INVALID_PASSWORD: "INVALID_REQUEST",
    USERNAME_TAKEN: "CONFLICT",
    INVALID_CREDENTIALS: "FORBIDDEN",
    CURRENT_NOT_SIGNED_IN: "UNAUTHORIZED",
    REPLACE_NOT_SIGNED_IN: "UNAUTHORIZED",
    END_NOT_SIGNED_IN: "UNAUTHORIZED",
  },
  cookies: {
    session: {
      name: "watchparty-session",
      input: "session",
      issue: [
        "/auth/guest", "/auth/register", "/auth/login",
        "/rooms/register-and-claim", "/rooms/sign-in-and-claim",
      ].map((path) => ({
        path,
        value: "issuedSession",
        expires: "expiresAt",
      })),
      clear: ["/auth/logout"],
    },
  },
});
