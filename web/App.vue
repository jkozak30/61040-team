<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { createHttpClient } from "@mit-sdg/sync-engine-http/client";
import type { WatchPartyWireHttp } from "../generated/wire.ts";
import signOutIcon from "./assets/sign-out.svg";
import { closeDialog } from "./dialog-motion.ts";
import AddVideoDialog from "./components/AddVideoDialog.vue";
import Lobby from "./components/Lobby.vue";
import Login from "./components/Login.vue";
import Watch from "./components/Watch.vue";

const api = createHttpClient<WatchPartyWireHttp>({ baseUrl: "/api" });
type Identity = WatchPartyWireHttp["/auth/me"]["output"];
type Membership = WatchPartyWireHttp["/rooms/join"]["output"] & { code?: string };
type SavedRooms = WatchPartyWireHttp["/watch/history"]["output"]["rooms"];
type VideoEntry = SavedRooms[number]["watch"]["entries"][number]["entry"];
type Connection = WatchPartyWireHttp["/watch/presence"]["input"]["connection"];
type RoomPage = {
  account: string | null;
  room: Membership;
  archive?: { entry: VideoEntry }; // Previous saved page format.
  localEntry?: VideoEntry;
  shared?: boolean;
  connection?: Connection;
};
const roomPageKey = "watchparty.room-page";

const identity = ref<Identity | null>(null);
const checked = ref(false);
const busy = ref(false);
const error = ref("");
const room = ref<Membership | null>(null);
const localEntry = ref<VideoEntry>();
const shared = ref(false);
const connection = ref<Connection>();
const savedRooms = ref<SavedRooms>([]);
const roomPresenceError = ref("");
let stopRoomPresence: (() => Promise<void>) | undefined;
const invite = ref(new URLSearchParams(window.location.search).get("invite") ?? "");
const inviteName = ref("");
const guestJoining = ref(false);
const guestRoomCode = ref("");
const guestDisplayName = ref("");
const page = ref<"home" | "history">("home");
const shellPageKey = "watchparty.shell-page";

watch(page, (value) => {
  try {
    sessionStorage.setItem(shellPageKey, value);
  } catch {
    // The page still works when browser storage is unavailable.
  }
});
const showSignIn = ref(false);

const addingVideo = ref<SavedRooms[number]>();

async function addHistoryVideo(videoId: string, previewTitle?: string) {
  const saved = addingVideo.value;
  if (!saved?.owner) throw new Error("Room owner required.");
  const membership = { room: saved.room, participant: saved.participant };
  const opened = await api.watch.open(membership);
  if ("error" in opened) throw new Error(opened.error);
  const added = await api.watch["add-video"]({ ...membership, videoId, previewTitle });
  if ("error" in added) throw new Error(added.error);
  void run(loadSavedRooms);
}

function clearInvite() {
  invite.value = "";
  const url = new URL(window.location.href);
  url.searchParams.delete("invite");
  window.history.replaceState(null, "", url);
}

function openPage(target: "home" | "history") {
  return run(async () => {
    if (room.value) {
      if (!(await confirmRoomDeparture())) return;
      await leaveRoomPresence();
      room.value = null;
      resetWatch();
    }
    page.value = target;
    showSignIn.value = false;
    if (target === "history") await loadSavedRooms();
  });
}

watch(room, (membership, _previous, onCleanup) => {
  roomPresenceError.value = "";
  if (!membership) return;
  const request = {
    room: membership.room,
    participant: membership.participant,
    connection: crypto.randomUUID() as Connection,
  };
  let stopped = false;
  let pending: Promise<void> | undefined;
  function renew() {
    if (stopped || pending) return;
    pending = api.rooms.presence(request).then((result) => {
      if (!stopped) roomPresenceError.value = "error" in result ? "Could not renew room presence. Retrying..." : "";
    }).catch(() => {
      if (!stopped) roomPresenceError.value = "Could not renew room presence. Retrying...";
    }).finally(() => { pending = undefined; });
  }
  renew();
  const timer = window.setInterval(renew, 5000);
  async function leave() {
    if (stopped) return;
    stopped = true;
    window.clearInterval(timer);
    await pending;
    try {
      await api.rooms.leave(request);
    } catch {
      // The server's grace period expires an abandoned connection.
    }
  }
  stopRoomPresence = leave;
  onCleanup(() => {
    if (stopRoomPresence === leave) stopRoomPresence = undefined;
    void leave();
  });
});

function restoreRoomPage() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(roomPageKey) ?? "null") as RoomPage | null;
    if (invite.value || !saved || !identity.value || saved.account !== currentAccount()) return;
    room.value = saved.room;
    localEntry.value = saved.localEntry ?? saved.archive?.entry;
    shared.value = saved.shared ?? (!!saved.connection && !saved.archive);
    if ((performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined)?.type === "reload") {
      connection.value = saved.connection;
    }
  } catch {
    // The app can still run if browser storage is unavailable.
  }
}

function currentAccount() {
  return identity.value?.kind === "account" ? identity.value.account : null;
}

watch([checked, identity, room, localEntry, shared, connection], () => {
  if (!checked.value) return;
  try {
    if (!identity.value || !room.value) {
      sessionStorage.removeItem(roomPageKey);
      return;
    }
    sessionStorage.setItem(roomPageKey, JSON.stringify({
      account: currentAccount(), room: room.value,
      localEntry: localEntry.value, shared: shared.value, connection: connection.value,
    } satisfies RoomPage));
  } catch {
    // The app can still run if browser storage is unavailable.
  }
});

async function refreshIdentity() {
  const result = await api.auth.me();
  if ("error" in result) {
    if (result.error !== "UNAUTHORIZED") {
      error.value = "Could not check your session. Try again.";
      return;
    }
    identity.value = null;
    room.value = null;
    resetWatch();
  } else {
    identity.value = result;
    if (!checked.value) {
    restoreRoomPage();

    if (!room.value && !invite.value && result.kind === "account") {
      try {
        if (sessionStorage.getItem(shellPageKey) === "history") {
          page.value = "history";
        }
      } catch {
        // Default to Home when browser storage is unavailable.
      }

      if (page.value === "history") {
        try {
          await loadSavedRooms();
        } catch {
          error.value = "Could not load your saved rooms. Open Your Streams again to retry.";
        }
      }
    }
  }
  }
  checked.value = true;
}

async function loadSavedRooms() {
  if (identity.value?.kind !== "account") {
    savedRooms.value = [];
    return;
  }
  const result = await api.watch.history();
  if ("error" in result) {
    error.value = "Could not load your saved rooms. Try again.";
    return;
  }
  savedRooms.value = result.rooms;
  return result.rooms;
}

async function run(action: () => Promise<unknown>) {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    await action();
  } catch {
    error.value = "Could not reach WatchParty. Try again.";
  } finally {
    busy.value = false;
  }
}

function submit(credentials: { username: string; password: string }, creating: boolean) {
  return run(async () => {
    const participant = identity.value?.kind === "guest" ? room.value?.participant : undefined;
    const result = participant
      ? creating
        ? await api.rooms["register-and-claim"]({ ...credentials, participant })
        : await api.rooms["sign-in-and-claim"]({ ...credentials, participant })
      : creating
        ? await api.auth.register(credentials)
        : await api.auth.login(credentials);
    if ("error" in result) {
      switch (result.error) {
        case "FORBIDDEN":
          error.value = participant
            ? "Could not save this visit. Check your credentials and guest session."
            : "The username or password is incorrect.";
          break;
        case "CONFLICT":
          error.value = "That username is taken.";
          break;
        case "INVALID_REQUEST":
          error.value = "Check your username and password and try again.";
          break;
        default:
          error.value = "Could not sign in. Try again.";
      }
      return;
    }
    if (participant && room.value && "room" in result && "participant" in result) {
      if (room.value.participant !== result.participant) {
        shared.value = false;
        connection.value = undefined;
      }
      room.value = { ...room.value, room: result.room, participant: result.participant };
    }
    await refreshIdentity();
    showSignIn.value = false;
  });
}

function startGuest() {
  return run(async () => {
    const result = await api.auth.guest();
    if ("error" in result) {
      error.value = "Could not start a guest session. Try again.";
      return;
    }
    await refreshIdentity();
    if (identity.value?.kind === "guest" && !invite.value) {
      guestJoining.value = true;
    }
  });
}

const leaveDialog = ref<HTMLDialogElement>();
const leaveWarning = ref("");
const departureTitle = ref("Leave the live watch?");
let resolveDeparture: ((confirmed: boolean) => void) | undefined;

function promptDeparture(message: string, title = "Leave the live watch?") {
  const dialog = leaveDialog.value;
  if (!dialog) return false;
  leaveWarning.value = message;
  departureTitle.value = title;
  return new Promise<boolean>((resolve) => {
    resolveDeparture = resolve;
    dialog.showModal();
  });
}

async function answerDeparture(confirmed: boolean) {
  const resolve = resolveDeparture;
  resolveDeparture = undefined;
  await closeDialog(leaveDialog.value);
  resolve?.(confirmed);
}

async function confirmRoomDeparture() {
  const membership = room.value;
  if (!membership) return true;
  const result = await api.watch.read({
    room: membership.room, participant: membership.participant, afterRevision: 0,
  });
  if (!("error" in result)) {
    const snapshot = result.watch.snapshot;
    if (!snapshot.activeEntry || snapshot.endedAt) return true;
    if (result.isOwner) {
      return promptDeparture("Leaving your last room tab will end the live watch. You can cancel and reassign ownership in Participants first.");
    }
  }
  return !shared.value || promptDeparture("You’ll leave shared playback in this room.");
}

async function leaveRoomPresence() {
  await stopRoomPresence?.();
  if (room.value && shared.value && connection.value) {
    const { room: roomId, participant } = room.value;
    await api.watch.leave({ room: roomId, participant, connection: connection.value }).catch(() => {
      // Presence expires if the leave request cannot reach the server.
    });
  }
}

function signOut() {
  return run(async () => {
    const confirmed = room.value
      ? await confirmRoomDeparture()
      : await promptDeparture("", "Are you sure you want to sign out?");
    if (!confirmed) return;
    await leaveRoomPresence();
    try {
      const result = await api.auth.logout();
      if ("error" in result && result.error !== "UNAUTHORIZED") {
        error.value = "Could not sign out. Try again.";
        return;
      }
      identity.value = null;
      room.value = null;
      resetWatch();
      savedRooms.value = [];
      page.value = "home";
    } finally {
      if (room.value) room.value = { ...room.value };
    }
  });
}

function createRoom(name: string) {
  return run(async () => {
    const result = await api.rooms.create({ name });
    if ("error" in result) {
      error.value = result.error === "INVALID_REQUEST"
        ? "Use a display name of 1 to 32 characters."
        : "Could not create the room. Make sure you are signed in.";
      return;
    }
    room.value = result;
  });
}

function joinRoom(code: string, name?: string) {
  return run(async () => {
    if (!identity.value) {
      const guest = await api.auth.guest();
      if ("error" in guest) {
        error.value = "Could not start a guest session. Try again.";
        return;
      }
      await refreshIdentity();
      if (!identity.value) return;
    }
    const result = await api.rooms.join({ code, name });
    if ("error" in result) {
      error.value = result.error === "NOT_FOUND"
        ? "That room code was not found."
        : "Could not join the room. Check your display name and session.";
      return;
    }
    room.value = { ...result, code: code.trim().toUpperCase() };
    guestJoining.value = false;
    if (invite.value) clearInvite();
  });
}

function reopenRoom(savedRoom: Membership["room"], entry?: VideoEntry, joinLive = false) {
  return run(async () => {
    const result = await api.rooms.reopen({ room: savedRoom });
    if ("error" in result) {
      error.value = "Could not reopen that room. Make sure you are signed in to the right account.";
      return;
    }
    room.value = result;
    localEntry.value = entry;
    shared.value = joinLive;
  });
}

function resetWatch() {
  localEntry.value = undefined;
  shared.value = false;
  connection.value = undefined;
}

function backToRooms() {
  return openPage("home");
}

onMounted(() => void run(refreshIdentity));
</script>

<template>
  <main :class="{ 'watch-page': room }">
    <section v-if="!checked" class="session-check" aria-busy="true">
      <p v-if="busy" role="status">Checking your session…</p>
      <template v-else>
        <p v-if="error" role="alert">{{ error }}</p>
        <button type="button" @click="run(refreshIdentity)">Retry</button>
      </template>
    </section>

    <section v-else-if="guestJoining && identity?.kind === 'guest' && !room && !invite" class="auth-page">
      <div class="auth-card">
        <h1>WatchParty</h1>
        <form class="home-card guest-join-card"
          @submit.prevent="joinRoom(guestRoomCode, guestDisplayName.trim() || undefined)">
          <h2 id="guest-join-heading" class="home-strip">Join a room</h2>
          <fieldset class="home-box guest-join-form" :disabled="busy" aria-labelledby="guest-join-heading">
            <p v-if="error" role="alert">{{ error }}</p>
            <label>
              Room code
              <input v-model.trim="guestRoomCode" required autocapitalize="characters" spellcheck="false" />
            </label>
            <label>
              Your display name
              <input v-model="guestDisplayName" maxlength="32" />
            </label>
            <small>Required the first time you join this room.</small>
            <button type="submit">Join room</button>
            <button type="button" @click="guestJoining = false; page = 'home'; error = ''">Go to Home</button>
          </fieldset>
        </form>
      </div>
    </section>

    <section v-else-if="invite || !identity" class="auth-page">
      <div class="auth-card">
        <h1>WatchParty</h1>
        <p v-if="error" role="alert">{{ error }}</p>
        <template v-if="!checked">
          <p v-if="busy" role="status">Checking your session...</p>
          <button v-else type="button" @click="run(refreshIdentity)">Retry</button>
        </template>
        <template v-else>
          <h2 v-if="invite">Join a room</h2>
          <p v-if="invite">Room code <strong class="room-code">{{ invite }}</strong></p>
          <template v-if="!identity">
            <Login :busy="busy" :saving-visit="false" @submit="submit" @clear-error="error = ''">
              <button class="guest-button" type="button" :disabled="busy" @click="startGuest">
                or <span>continue as guest</span>
              </button>
            </Login>
            <!-- <button type="button" :disabled="busy" @click="startGuest">Continue as guest</button> -->
          </template>
          <form v-else @submit.prevent="joinRoom(invite, inviteName.trim() || (identity.kind === 'account' ? identity.username : undefined))">
            <label>Your display name
              <input v-model="inviteName" :placeholder="identity.kind === 'account' ? identity.username : undefined"
                maxlength="32" />
            </label>
            <small v-if="identity.kind === 'guest'">Required the first time you join this room.</small>
            <button type="submit" :disabled="busy">Join room</button>
          </form>
          <button v-if="invite" type="button" :disabled="busy" @click="clearInvite">Back to WatchParty</button>
        </template>
      </div>
    </section>

    <template v-else-if="room">
      <p v-if="error" class="app-status" role="alert">{{ error }}</p>
      <p v-if="roomPresenceError" class="app-status" role="status">{{ roomPresenceError }}</p>
      <Watch
        :key="room.participant"
        :room="room.room"
        :participant="room.participant"
        :invite-code="room.code"
        :initial-entry="localEntry"
        :initial-shared="shared"
        :account="identity.kind === 'account'"
        :connection="connection"
        @local-entry="localEntry = $event"
        @shared="shared = $event"
        @connection="connection = $event"
        @leave-room="backToRooms"
        @history="openPage('history')"
        @sign-out="signOut"
        @sign-in="showSignIn = !showSignIn"
      >
        <Login v-if="showSignIn && identity.kind === 'guest'" :busy="busy" :saving-visit="true" @submit="submit" @clear-error="error = ''" />
      </Watch>
    </template>

    <div v-else class="app-shell">
      <nav aria-label="WatchParty">
        <div v-if="identity.kind === 'account'" class="sidebar-profile">
          <strong>{{ identity.username }}</strong>
          <button class="sidebar-sign-out" type="button" aria-label="Sign out" title="Sign out"
            @click="signOut">
            <img :src="signOutIcon" width="18" height="18" alt="" />
          </button>
        </div>
        <button type="button" :disabled="busy" :aria-current="page === 'home' ? 'page' : undefined"
          @click="openPage('home')">Home</button>
        <button v-if="identity.kind === 'account'" type="button" :disabled="busy"
          :aria-current="page === 'history' ? 'page' : undefined" @click="openPage('history')">Your Streams</button>
      </nav>
      <section class="app-content">
        <h1>WatchParty</h1>
        <p v-if="error" role="alert">{{ error }}</p>
        <p v-if="roomPresenceError" role="status">{{ roomPresenceError }}</p>
        <div class="shell-panels">
          <Transition v-for="panel in (['home', 'history'] as const)" :key="panel" name="shell-fade">
            <div v-show="page === panel" class="shell-panel" :inert="page !== panel">
                <section v-if="panel === 'home'" class="home-card" aria-labelledby="profile-heading">
                  <h2 id="profile-heading" class="home-strip">Profile</h2>
                  <div class="home-box">
                    <div class="profile-row">
                      <p role="status">{{ identity.kind === "account" ? `Signed in as ${identity.username}.` : "You're continuing as a guest." }}</p>
                      <button v-if="identity.kind === 'guest'" type="button"
                        :aria-expanded="showSignIn" @click="showSignIn = !showSignIn">
                        Sign in
                      </button>
                      <button type="button" :disabled="busy" @click="signOut">Sign out</button>
                    </div>
                    <Transition name="profile-expand">
                      <div v-if="showSignIn && identity.kind === 'guest'" class="profile-sign-in">
                        <div class="profile-sign-in-inner">
                          <Login :busy="busy" :saving-visit="!!room"
                            @submit="submit" @clear-error="error = ''" />
                        </div>
                      </div>
                    </Transition>
                  </div>
                </section>
                <Lobby
                  :username="identity.kind === 'account' ? identity.username : undefined"
                  :busy="busy"
                  :page="panel"
                  :saved-rooms="savedRooms"
                  @create="createRoom"
                  @join="joinRoom"
                  @reopen="reopenRoom"
                  @add-video="addingVideo = $event"
                />
            </div>
          </Transition>
        </div>
      </section>
    </div>
    <AddVideoDialog v-if="addingVideo" :save="addHistoryVideo" @close="addingVideo = undefined" />
    <dialog ref="leaveDialog" class="leave-dialog watch-dialog" aria-labelledby="leave-heading" :aria-describedby="leaveWarning ? 'leave-warning' : undefined"
      @cancel.prevent="answerDeparture(false)">
      <h2 id="leave-heading" class="watch-dialog-title">{{ departureTitle }}</h2>
      <div class="watch-dialog-body">
        <p v-if="leaveWarning" id="leave-warning">{{ leaveWarning }}</p>
        <div class="watch-dialog-actions">
          <button class="departure-cancel" type="button" autofocus @click="answerDeparture(false)">Cancel</button>
          <button class="gradient-button" type="button" @click="answerDeparture(true)">Confirm</button>
        </div>
      </div>
    </dialog>
  </main>
</template>

<style>
:root {
  --paper: #f5eee3;
  --ink: #191619;
  --accent: #9f2a3e;
  --display: "Manrope", system-ui, -apple-system, "Segoe UI", sans-serif;
  --surface: var(--paper);
  --raised: #fff8ed;
  --text: var(--ink);
  --line: #b7a69d;
  --outline: #89746c;
  --focus: #245bae;
  --modal-scrim: rgb(0 0 0 / 72%);
  color-scheme: light;
  --participant-font: "IBM Plex Mono", ui-monospace, monospace;
  font-family: var(--display);
  background: var(--surface);
  color: var(--text);
}
.watch-page {
  --surface: #171417;
  --raised: #251f25;
  --text: var(--paper);
  --line: #51444d;
  --outline: #796873;
  --focus: #8ed9fa;
  color-scheme: dark;
  background: var(--surface);
  color: var(--text);
  min-height: 100dvh;
}
* { box-sizing: border-box; }
body { margin: 0; }
h1, h2, h3 { line-height: 1.1; letter-spacing: -0.045em; }
h1 { font-family: var(--display); font-weight: 700; letter-spacing: -0.065em; font-size: clamp(3rem, 9vw, 7rem); margin: 0 0 1rem; }
button, input, textarea, select { font: inherit; }
button {
  color: inherit;
  background: var(--raised);
  border: 1px solid var(--outline);
  border-radius: 0.4rem;
  padding: 0.45rem 0.75rem;
  cursor: pointer;
}
button {
  transition: box-shadow 160ms ease, border-color 160ms ease,
    color 160ms ease, background-color 160ms ease, opacity 160ms ease;
}
@media (hover: hover) {
  button:not(:disabled):hover {
    border-color: transparent;
    box-shadow: -3px 0 8px #00a9d180, 3px 0 8px #ed428380, 0 2px 7px #ff823e66, 0 -2px 7px #4852be80;
  }
}
@media (prefers-reduced-motion: reduce) {
  button { transition: none; }
}
button:disabled { cursor: default; opacity: 0.55; }
input:not([type="range"]), textarea {
  border: 1px solid var(--outline);
  border-radius: 0.25rem;
  padding: 0.5rem;
  background: var(--raised);
  color: var(--text);
  max-width: 100%;
}
input[type="range"] { accent-color: var(--accent); }
.live-tag {
  display: inline-block;
  border-radius: 0.25rem;
  padding: 0.1rem 0.3rem;
  background: var(--accent);
  color: white;
  font: 700 0.68rem/1.3 var(--display);
  white-space: nowrap;
}
time, .room-code { font-variant-numeric: tabular-nums; }
form button[type="submit"]:not(:disabled) { background: var(--accent); color: white; border-color: var(--accent); }
.watch-page button:not(.gradient-button),
.watch-dialog button:not(.gradient-button) {
  border-color: transparent;
  box-shadow: 0 0 2px #ffffff52, 0 0 6px #ffffff24;
}
button.gradient-button,
form button.gradient-button[type="submit"]:not(:disabled) {
  background: linear-gradient(110deg, #1b414b, #3b2a58 38%, #552c40 70%, #503522);
  border-color: #fff;
  color: #fff;
  font-weight: 800;
}
@media (hover: hover) {
  .watch-page button:not(:disabled):hover,
  .watch-dialog button:not(:disabled):hover {
    border-color: transparent;
    color: #fff0f6;
    box-shadow: -2px 0 6px #42c8e46b, 2px 0 6px #ec6dac73, 0 -1px 5px #8472ed60, 0 1px 5px #ffa06a55;
  }
  .watch-page button.gradient-button:not(:disabled):hover,
  .watch-dialog button.gradient-button:not(:disabled):hover {
    border-color: #fff;
    color: #fff;
    box-shadow: -2px 0 6px #42c8e46b, 2px 0 6px #ec6dac73, 0 -1px 5px #8472ed60, 0 1px 5px #ffa06a55;
  }
}
fieldset { min-width: 0; }
:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
.watch-page :is(input, textarea):focus-visible { outline-color: #dc6076; }
.auth-page { min-height: 100dvh; display: grid; place-items: center; padding: 1.5rem; }
.auth-card { width: min(100%, 30rem); }
.auth-card h1 { font-size: clamp(2.7rem, 11vw, 5.6rem); }
.auth-card form { display: grid; gap: 0.75rem; margin-block: 1rem; }
.session-check {
  min-height: 100dvh;
  display: grid;
  place-content: center;
  gap: 0.5rem;
}
.auth-card label { display: grid; gap: 0.25rem; }
.room-code { font-family: monospace; letter-spacing: 0.08em; }
.app-shell { display: grid; grid-template-columns: 12rem minmax(0, 1fr); min-height: 100dvh; }
.app-shell nav { display: flex; flex-direction: column; gap: 0.5rem; padding: 1.25rem; background: var(--ink); color: var(--paper); }
.app-shell nav button { background: transparent; text-align: left; }
.app-shell nav button[aria-current] { background: var(--accent); border-color: #c06b7b; }
.app-content {
  --content-gutter: clamp(1.25rem, 4vw, 3rem);
  min-width: 0;
  padding: var(--content-gutter);
}
.shell-panels { display: grid; }
.shell-panel { grid-area: 1 / 1; min-width: 0; }
.shell-fade-enter-active, .shell-fade-leave-active { transition: opacity 160ms ease; }
.shell-fade-leave-active { pointer-events: none; }
.shell-fade-enter-from, .shell-fade-leave-to { opacity: 0; }
@media (prefers-reduced-motion: reduce) {
  .shell-fade-enter-active, .shell-fade-leave-active { transition: none; }
}
.home-card {
  --home-card-inset: clamp(0rem, calc(8vw - 2rem), 3.25rem);
  width: min(calc(100% - var(--home-card-inset)), 32rem);
  margin-block: 2.25rem 0;
  margin-inline-start: var(--home-card-inset);
  border: 1px solid var(--line);
  border-radius: 0.6rem;
  background: var(--raised);
}
.home-strip {
  margin: 0;
  padding: 0.15rem 0.4rem 0.2rem;
  border-radius: calc(0.6rem - 1px) calc(0.6rem - 1px) 0 0;
  background: linear-gradient(110deg, #5a6263, #635e6b 38%, #6c5e65 68%, #706155);
  color: var(--surface);
  font: 700 clamp(1.65rem, 3vw, 2.45rem)/1 Arial, sans-serif;
  letter-spacing: -0.065em;
}
.home-box { min-inline-size: 0; margin: 0; padding: 0.9rem 1rem; border: 0; }
.sidebar-profile { display: flex; align-items: center; gap: 0.4rem; padding-bottom: 0.6rem; border-bottom: 1px solid #51444d; }
.sidebar-profile strong { flex: 1; min-width: 0; font-family: var(--participant-font); overflow-wrap: anywhere; }
.sidebar-profile .sidebar-sign-out { flex: none; display: grid; place-items: center; padding: 0.35rem; }
.profile-row { display: flex; align-items: center; flex-wrap: wrap; gap: 0.45rem 0.85rem; }
.profile-row > p { margin: 0; overflow-wrap: anywhere; }
.watch-dialog {
  padding: 0; width: min(28rem, calc(100vw - 2rem)); max-height: calc(100dvh - 2rem);
  border: 1px solid var(--outline); border-radius: 0.6rem; background: var(--surface); color: var(--text);
}
main:not(.watch-page) .leave-dialog {
  width: max-content;
  max-width: calc(100vw - 2rem);
}
.watch-dialog[open], .watch-dialog[open]::backdrop { animation: watch-dialog-in 160ms ease both; }
.watch-dialog::backdrop { background: var(--modal-scrim); }
.watch-dialog[open][data-closing], .watch-dialog[open][data-closing]::backdrop { animation: watch-dialog-out 160ms ease both; }
.watch-dialog[data-closing] { pointer-events: none; }
.watch-dialog-title {
  margin: 0; padding: 0.1rem 0.3rem; background: #6c626a; color: var(--surface);
  font: 700 clamp(1.6rem, 2.5vw, 2.25rem)/0.95 Arial, sans-serif; letter-spacing: -0.08em;
}
.watch-dialog-body { padding: 1rem; }
.watch-dialog-body p:first-child { margin-top: 0; }
.watch-dialog-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 0.4rem; }
.watch-dialog-actions button { padding: 0.3rem 0.55rem; font-size: 0.875rem; }
@keyframes watch-dialog-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes watch-dialog-out { from { opacity: 1; } to { opacity: 0; } }
@media (prefers-reduced-motion: reduce) {
  .watch-dialog[open], .watch-dialog[open]::backdrop,
  .watch-dialog[open][data-closing], .watch-dialog[open][data-closing]::backdrop { animation: none; }
}
main:not(.watch-page) .leave-dialog .departure-cancel:not(:disabled) {
  color: #171417;
  box-shadow: 0 0 2px #17141765, 0 0 6px #17141730;
}
@media (hover: hover) {
  main:not(.watch-page) .leave-dialog .departure-cancel:not(:disabled):hover {
    color: #171417;
    box-shadow: -2px 0 6px #42c8e480, 2px 0 6px #ec6dac85, 0 -1px 5px #8472ed65, 0 1px 5px #ffa06a65;
  }
}
.app-status { margin-inline: 1rem; }
@media (max-width: 620px) {
  .app-shell { grid-template-columns: 1fr; }
  .app-shell nav { flex-direction: row; flex-wrap: wrap; }
  .sidebar-profile { flex-basis: 100%; }
}
/* Full-width Watch section titles. */
.watch-page h3 {
  font: 700 clamp(2rem, 3.5vw, 3rem)/0.95 Arial, sans-serif;
  letter-spacing: -0.08em;
  margin: 0;
}
.watch-page .video-panel > h3,
.watch-page .discussion > header,
.watch-page #participants-heading {
  background: #6c626a;
  color: var(--surface);
  padding: 0 0.15rem;
  margin: -1rem -1rem 0.2rem;
}
.watch-page .video-panel > h3,
.watch-page #participants-heading {
  text-align: left;
  font-size: clamp(1.6rem, 2.5vw, 2.25rem);
  padding-inline-start: 0.3rem;
}
.watch-page .discussion > header > h3 {
  color: inherit;
}
.watch-page .video-panel > p { margin: 0.35rem 0 0; }
.watch-page .video-panel > .video-list { margin-block: 0.5rem; }
.guest-button {
  width: 100%;
  border-color: #fff;
  box-shadow: 0 0 0 1px #c5b7ad;
}

.guest-button span {
  color: var(--accent);
  font-weight: 700;
}
.auth-card .guest-join-card { display: block; width: 100%; margin: 0.9rem 0 0; }
.guest-join-form p { margin: 0; }
.guest-join-form,
.guest-join-form label {
  display: grid;
  gap: 0.4rem;
}

.guest-join-form {
  gap: 0.75rem;
}
.profile-sign-in {
  display: grid;
  grid-template-rows: 1fr;
}

.profile-sign-in-inner {
  min-height: 0;
}

.profile-sign-in .login-form {
  width: 100%;
  margin: 1.25rem 0 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  padding-top: 0.5rem;
}

.profile-sign-in .login-form > .home-strip {
  border-radius: 0.4rem;
}

.profile-sign-in .login-form > .home-box {
  padding: 0.75rem 0 0;
}

.profile-expand-enter-active,
.profile-expand-leave-active {
  transition: grid-template-rows 220ms ease, opacity 180ms ease;
}

.profile-expand-enter-active > .profile-sign-in-inner,
.profile-expand-leave-active > .profile-sign-in-inner {
  overflow: hidden;
}

.profile-expand-enter-from,
.profile-expand-leave-to {
  grid-template-rows: 0fr;
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .profile-expand-enter-active,
  .profile-expand-leave-active {
    transition: none;
  }
}
</style>
