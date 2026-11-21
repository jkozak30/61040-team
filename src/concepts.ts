import { conceptSet, registerConcept } from "@mit-sdg/sync-engine/assembly";
import authenticatingSpec from "@design/concepts/Authenticating.md" with { type: "text" };
import sessioningSpec from "@design/concepts/Sessioning.md" with { type: "text" };
import presenceSpec from "@design/concepts/Presence.md" with { type: "text" };
import watchingSpec from "@design/concepts/Watching.md" with { type: "text" };
import discussingSpec from "@design/concepts/Discussing.md" with { type: "text" };
import summarizingSpec from "@design/concepts/Summarizing.md" with { type: "text" };
import { DiscussingConcept, InvalidMessage, ThreadUnavailable } from "./concepts/Discussing.ts";
import { SummarizingConcept, SummaryUnavailable } from "./concepts/Summarizing.ts";
import { youtubeSource, type MediaSource } from "./media-source.ts";
import type { PlaybackCommand, Snapshot, VideoEntry } from "./concepts/Watching.ts";
import roomJoiningSpec from "@design/concepts/RoomJoining.md" with { type: "text" };
import {
  type Account,
  AuthenticatingConcept,
  InvalidCredentials,
  InvalidPassword,
  InvalidUsername,
  UsernameTaken,
} from "./concepts/Authenticating.ts";
import {
  EndNotSignedIn,
  ReplaceNotSignedIn,
  SessioningConcept,
  CurrentNotSignedIn,
} from "./concepts/Sessioning.ts";
import { LeaveNotOwner, PresenceConcept, PresenceUnavailable } from "./concepts/Presence.ts";

import {
  InvalidOwnerName, InvalidJoinName, InvalidRoomCode,
  type Participant, type Room,
  NoSavedVisit, OwnershipTransferUnavailable, RoomJoiningConcept, VisitNotClaimable,
} from "./concepts/RoomJoining.ts";

import {
  AddVideoUnavailable, ControlUnavailable, InvalidSeek,
  StalePlayback, WatchingConcept, UnknownStream,
  VideoUnavailable,
} from "./concepts/Watching.ts";


type PlayerConnection = string & { readonly __brand: "PlayerConnection" };

type VisitorId = `guest:${string}`;
export type SessionSubject = VisitorId | `account:${Account}` | Account;
type SessionIdentity =
  | { kind: "guest"; account: null }
  | { kind: "account"; account: Account };

export class Sessioning extends SessioningConcept<SessionSubject> {}

export const authenticating = registerConcept({
  class: AuthenticatingConcept,
  spec: authenticatingSpec,
  refusals: {
    INVALID_USERNAME: InvalidUsername,
    INVALID_PASSWORD: InvalidPassword,
    USERNAME_TAKEN: UsernameTaken,
    INVALID_CREDENTIALS: InvalidCredentials,
  },
});

export const sessioning = registerConcept({
  class: Sessioning,
  spec: sessioningSpec,
  refusals: {
    CURRENT_NOT_SIGNED_IN: CurrentNotSignedIn,
    REPLACE_NOT_SIGNED_IN: ReplaceNotSignedIn,
    END_NOT_SIGNED_IN: EndNotSignedIn,
  },
});

export class Presence extends PresenceConcept<Room, Participant, PlayerConnection> {}

const presence = registerConcept({
  class: Presence,
  spec: presenceSpec,
  refusals: {
    PRESENCE_UNAVAILABLE: PresenceUnavailable,
    LEAVE_NOT_OWNER: LeaveNotOwner,
  },
});

export class RoomJoining extends RoomJoiningConcept<SessionSubject> {}

const roomJoining = registerConcept({
  class: RoomJoining,
  spec: roomJoiningSpec,
  refusals: {
    INVALID_OWNER_NAME: InvalidOwnerName,
    INVALID_ROOM_CODE: InvalidRoomCode,
    INVALID_JOIN_NAME: InvalidJoinName,
    VISIT_NOT_CLAIMABLE: VisitNotClaimable,
    OWNERSHIP_TRANSFER_UNAVAILABLE: OwnershipTransferUnavailable,
    NO_SAVED_VISIT: NoSavedVisit,
  },
});

export class Watching extends WatchingConcept<Room, Participant, MediaSource> {}

const watching = registerConcept({
  class: Watching,
  spec: watchingSpec,
  refusals: {
    ADD_VIDEO_UNAVAILABLE: AddVideoUnavailable,
    VIDEO_UNAVAILABLE: VideoUnavailable,
    CONTROL_UNAVAILABLE: ControlUnavailable,
    INVALID_SEEK: InvalidSeek,
    STALE_PLAYBACK: StalePlayback,
    UNKNOWN_STREAM: UnknownStream,
  },
});

export class Discussing extends DiscussingConcept<VideoEntry, Participant> {}
const discussing = registerConcept({
  class: Discussing, spec: discussingSpec,
  refusals: { INVALID_MESSAGE: InvalidMessage, THREAD_UNAVAILABLE: ThreadUnavailable },
});
export class Summarizing extends SummarizingConcept<VideoEntry> {}
const summarizing = registerConcept({
  class: Summarizing, spec: summarizingSpec,
  refusals: { SUMMARY_UNAVAILABLE: SummaryUnavailable },
});

export const applicationConceptSet = conceptSet(
  { Authenticating: authenticating, Sessioning: sessioning, Presence: presence, RoomJoining: roomJoining, Watching: watching, Discussing: discussing, Summarizing: summarizing },
  {
    listedVideo: ({ entries, entry }: { entries: { entry: VideoEntry }[]; entry: VideoEntry }) =>
      ({ listed: entries.some(video => video.entry === entry) }),
    liveVideo: ({ snapshot, entry }: { snapshot: Snapshot; entry: VideoEntry }) =>
      ({ live: snapshot.activeEntry === entry && !snapshot.endedAt }),
    isHistorical: ({ mode }: { mode: "LIVE" | "HISTORICAL" }) =>
      ({ historical: mode === "HISTORICAL" }),
    youtubeSource: ({ videoId, previewTitle }: { videoId: string; previewTitle?: string | null }) => youtubeSource(videoId, previewTitle),
    watchLive: ({ snapshot }: { snapshot: Snapshot }) => ({ live: !!snapshot.activeEntry && !snapshot.endedAt }),
    watchRevision: ({ snapshot }: { snapshot: Snapshot }) => snapshot.revision,
    playbackCommand: ({ entry, expectedRevision, operation, position, offset }: {
      entry: VideoEntry; expectedRevision: number; operation: PlaybackCommand["operation"];
      position?: number | null; offset?: number | null;
    }): PlaybackCommand => {
      if (operation !== "SEEK") return { entry, expectedRevision, operation };
      const target: Extract<PlaybackCommand, { operation: "SEEK" }>["target"] = position != null && offset == null ? { position }
        : position == null && (offset === -10 || offset === 10) ? { offset } : null;
      return { entry, expectedRevision, operation, target };
    },
    watchIdentity: ({ subject }: { subject: SessionSubject }): SessionSubject =>
      subject.startsWith("account:") ? subject.slice(8) as Account : subject,
    isAccountIdentity: ({ identity }: { identity: SessionSubject }) => ({ signedIn: !identity.startsWith("guest:") }),
    guestSubject: (): SessionSubject => `guest:${crypto.randomUUID()}`,
    accountSubject: ({ account }: { account: Account }): SessionSubject => account,
    roomSubject: ({ subject }: { subject: SessionSubject }): {
      kind: "guest" | "account"; account?: Account | null; visitor?: VisitorId | null;
    } => subject.startsWith("guest:")
      ? { kind: "guest", account: null, visitor: subject as VisitorId }
      : { kind: "account", account: subject.replace(/^account:/, "") as Account, visitor: null },
    identifySubject: ({ subject }: { subject: SessionSubject }): SessionIdentity =>
      !subject.startsWith("guest:")
        ? { kind: "account", account: subject.replace(/^account:/, "") as Account }
        : { kind: "guest", account: null },
  },
);
export const { concepts, computations } = applicationConceptSet;
