<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { closeDialog } from "../dialog-motion.ts";
import { participantColor, participantColors } from "../participant-color.ts";
import { formatPlaybackTime } from "../../src/playback-time.ts";
import { createHttpClient } from "@mit-sdg/sync-engine-http/client";
import { loadYouTube, type YouTubePlayer } from "../youtube-player.ts";
import AddVideoDialog from "./AddVideoDialog.vue";
import Discussion from "./Discussion.vue";
import DiscussionSummary from "./DiscussionSummary.vue";
import type { WatchPartyWireHttp } from "../../generated/wire.ts";

const api = createHttpClient<WatchPartyWireHttp>({ baseUrl: "/api" });
type WatchRead = WatchPartyWireHttp["/watch/read"]["output"];
type WatchInput = WatchPartyWireHttp["/watch/read"]["input"];
type Entries = WatchRead["watch"]["entries"];
type VideoEntry = Entries[number]["entry"];
type Control = WatchPartyWireHttp["/watch/control"]["input"]["operation"];

const props = defineProps<{
  room: WatchInput["room"];
  participant: WatchInput["participant"];
  inviteCode?: string;
  connection?: WatchPartyWireHttp["/watch/presence"]["input"]["connection"];
  initialEntry?: VideoEntry;
  initialShared: boolean;
  account: boolean;
}>();
const emit = defineEmits<{ "leave-room": []; history: []; "sign-out": []; "sign-in": []; connection: [NonNullable<typeof props.connection>]; shared: [boolean]; "local-entry": [VideoEntry | undefined] }>();

const membership = { room: props.room, participant: props.participant };
const connection = props.connection ?? crypto.randomUUID() as NonNullable<typeof props.connection>;
const state = ref<WatchRead>();
const localEntry = ref<VideoEntry | undefined>(props.initialEntry);
const addingVideo = ref(false);
const seekDraft = ref<number>();
const draggingSeek = ref(false);
const currentTime = ref(0);
const localPosition = ref<number>();
const duration = ref(0);
const localPlaying = ref(false);
const optimisticPosition = ref<number>();
const seekPosition = computed(() => Math.min(seekDraft.value ?? optimisticPosition.value ?? currentTime.value, duration.value));
const seekPercent = computed(() => duration.value > 0 ? (seekPosition.value / duration.value) * 100 : 0);
const hoverSeek = ref<number>();

const previewTime = computed(() =>
  draggingSeek.value || seekDraft.value !== undefined
    ? seekPosition.value
    : hoverSeek.value
);

function previewSeekAtPointer(event: PointerEvent) {
  if (duration.value <= 0) return;
  const { left, width } = (event.currentTarget as HTMLInputElement).getBoundingClientRect();
  const thumbRadius = 6; // Half of the 12px seek thumb.
  const fraction = (event.clientX - left - thumbRadius) / Math.max(1, width - 2 * thumbRadius);
  hoverSeek.value = Math.max(0, Math.min(1, fraction)) * duration.value;
}
const playerHost = ref<HTMLElement>();
const playerReady = ref(false);
const playerError = ref("");
const autoplayBlocked = ref(false);
const error = ref("");
const networkError = ref("");
const busy = ref(false);
const endWatchDialog = ref<HTMLDialogElement>();
const connected = ref(false);
const notification = ref<{ viewer: string; text: string }>();
let pendingSeekNotice: {
  viewer: string;
  text: string;
  expiresAt: number;
} | undefined;

function clearPlaybackNotice() {
  window.clearTimeout(noticeTimer);
  notification.value = undefined;
  pendingSeekNotice = undefined;
}

function showPlaybackNotice(viewer: string, text: string) {
  clearPlaybackNotice();
  notification.value = { viewer, text };
  noticeTimer = window.setTimeout(() => {
    notification.value = undefined;
  }, 3000);
}
const playerAttempt = ref(0);

let player: YouTubePlayer | undefined;
let timer: number | undefined;
let progressTimer: number | undefined;
let noticeTimer: number | undefined;
let playerGeneration = 0;
let lastHeartbeat = 0;
let ignorePlayerEventsUntil = 0;
let appliedRevision = -1;
let controlRevision = 0;
let appliedPlaying = false;
let pendingNativePlay = false;
let playStartingUntil = 0;
let hasPlayed = false;
let cuedPosition: number | undefined;
let stopped = false;
let polling: Promise<void> | undefined;

const snapshot = computed(() => state.value?.watch.snapshot);
const shared = ref(props.initialShared);
const watchEnded = computed(() => !!snapshot.value?.endedAt);
const live = computed(() => !!snapshot.value?.activeEntry && !watchEnded.value);
const localPlayback = computed(() => !shared.value || !live.value);
const choosingOwner = ref(false);
const ownerSuccessor = ref("");
watch(shared, (value) => emit("shared", value));
watch(localEntry, (value) => emit("local-entry", value));
const entries = computed(() => state.value?.watch.entries ?? []);
const playing = computed(() => localPlayback.value ? localPlaying.value : snapshot.value?.playback === "PLAYING");
const activeEntry = computed(() => localPlayback.value
  ? localEntry.value ?? snapshot.value?.activeEntry ?? entries.value[0]?.entry
  : snapshot.value?.activeEntry);
const entryTitles = computed(() => new Map(entries.value.map((item) => [item.entry, item.source.title || item.source.id])));
const videoId = computed(() => entries.value.find((entry) => entry.entry === activeEntry.value)?.source.id);
const inviteLink = computed(() => {
  if (!props.inviteCode) return "";
  const url = new URL(window.location.pathname, window.location.origin);
  url.searchParams.set("invite", props.inviteCode);
  return url.href;
});

const videoList = ref<HTMLElement>();
const menuOpen = ref(false);
const menuTrigger = ref<HTMLButtonElement>();
const copyFeedback = ref<{ target: "code" | "link"; text: string }>();
let copyTimer: number | undefined;
let copyAttempt = 0;
const discussionRevision = ref<number>();
const roster = computed(() => (state.value?.watch.participants ?? []).map((member) => ({
  ...member, watching: state.value?.watch.viewers.some(({ viewer }) => viewer === member.participant),
})));

const roomColors = computed(() => participantColors(roster.value.map(({ participant }) => participant), props.room));

watch(() => state.value?.isOwner, (isOwner) => {
  if (!isOwner) cancelReassign();
});
watch(() => state.value?.watch.ownershipCandidates, (candidates) => {
  if (!candidates?.some(({ participant }) => participant === ownerSuccessor.value)) ownerSuccessor.value = "";
});

function cancelReassign() {
  choosingOwner.value = false;
  ownerSuccessor.value = "";
}

function chooseOwner(participant: string) {
  if (busy.value) return;
  if (ownerSuccessor.value === participant) return transferOwnership();
  ownerSuccessor.value = participant;
}

watch([activeEntry, videoList], ([entry, list]) => {
  const current = [...(list?.children ?? [])].find((row) => (row as HTMLElement).dataset.entry === entry);
  if (list && current) {
    const top = current.getBoundingClientRect().top - list.getBoundingClientRect().top;
    list.scrollTop += top - (list.clientHeight - current.clientHeight) / 2;
  }
}, { flush: "post" });

async function copyInvite(target: "code" | "link") {
  const value = target === "code" ? props.inviteCode : inviteLink.value;
  if (!value) return;
  const attempt = ++copyAttempt;
  let text = "Copied";
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    text = "Copy failed";
  }
  if (stopped || attempt !== copyAttempt) return;
  copyFeedback.value = { target, text };
  window.clearTimeout(copyTimer);
  copyTimer = window.setTimeout(() => { copyFeedback.value = undefined; }, 2200);
}

function sharedPosition() {
  const value = snapshot.value;
  if (!value) return 0;
  const elapsed = value.playback === "PLAYING"
    ? Math.max(0, Date.now() - Date.parse(value.positionAt)) / 1000
    : 0;
  const seconds = value.position + elapsed;
  const duration = player?.getDuration() ?? 0;
  return duration > 0 ? Math.min(seconds, duration) : seconds;
}

function applyToPlayer(action: () => void) {
  ignorePlayerEventsUntil = Date.now() + 750;
  action();
}

function syncPlayer(force = false) {
  const value = snapshot.value;
  if (!player || !playerReady.value || !value || localPlayback.value || playerError.value) return;
  if (!force && appliedRevision === value.revision && Date.now() < ignorePlayerEventsUntil) return;
  appliedRevision = value.revision;

  const target = player;
  const status = target.getPlayerState();
  const position = sharedPosition();
  const length = target.getDuration();
  const shouldPlay = value.playback === "PLAYING" && !(length > 0 && position >= length);
  const playerPosition = (status === -1 || status === 5) ? cuedPosition ?? target.getCurrentTime() : target.getCurrentTime();
  const drift = Math.abs(playerPosition - position);
  const wasPlaying = appliedPlaying;
  appliedPlaying = shouldPlay;
  if (shouldPlay) {
    if (autoplayBlocked.value || status === 3 || Date.now() < playStartingUntil) return;
    if (status !== 1) {
      startPlayer(target, position);
    } else if (drift > 1.5) {
      applyToPlayer(() => target.seekTo(position, true));
    }
  } else {
    autoplayBlocked.value = false;
    // The embedded Play button can buffer before YouTube reports PLAYING.
    if (pendingNativePlay) return;
    if (status === 1 || (status === 3 && wasPlaying) || playStartingUntil > 0) {
      playStartingUntil = 0;
      applyToPlayer(() => target.pauseVideo());
    }
    if (drift > 0.5 && status !== 3) {
      const id = videoId.value;
      if ((status === -1 || status === 5) && id) {
        // A cued player can report zero until it plays. Re-cue only when the target changes.
        if (cuedPosition !== position) {
          cuedPosition = position;
          target.cueVideoById({ videoId: id, startSeconds: position });
        }
      } else {
        applyToPlayer(() => {
          target.seekTo(position, true);
          target.pauseVideo();
        });
      }
    }
  }
}

function playerStateChanged(status: number) {
  localPlaying.value = status === 1 || (status === 3 && localPlaying.value);
  if (status === 2 || status === 0) pendingNativePlay = false;
  const starting = Date.now() < playStartingUntil;
  const catchUp = status === 1 && ((!hasPlayed && !starting) || autoplayBlocked.value);
  if (status === 1) {
    playStartingUntil = 0;
    hasPlayed = true;
    cuedPosition = undefined;
    autoplayBlocked.value = false;
  }
  const current = snapshot.value;
  if (catchUp && current?.playback === "PLAYING" && !localPlayback.value && player) {
    const target = player;
    const position = sharedPosition();
    if (Math.abs(target.getCurrentTime() - position) > 1.5) {
      applyToPlayer(() => target.seekTo(position, true));
    }
    return;
  }
  if (
    stopped || !current || localPlayback.value ||
    starting || Date.now() < ignorePlayerEventsUntil
  ) return;

  if (status === 1 && current.playback === "PAUSED") {
    if (busy.value || !connected.value || !playerReady.value) {
      pendingNativePlay = true;
      return;
    }
    void sendControl("PLAY", undefined, true);
  } else if (status === 2 && current.playback === "PLAYING" && !busy.value && playerReady.value && !autoplayBlocked.value) {
    const duration = player?.getDuration() ?? 0;
    if (duration > 0 && sharedPosition() >= duration) return;
    void sendControl("PAUSE", undefined, true);
  }
}

watch([busy, connected, playerReady], ([isBusy, isConnected, isReady]) => {
  if (!pendingNativePlay || isBusy || !isConnected || !isReady) return;
  pendingNativePlay = false;
  if (player?.getPlayerState() === 1 && !localPlayback.value && snapshot.value?.playback === "PAUSED") {
    void sendControl("PLAY", undefined, true);
  }
});

function startPlayer(target: YouTubePlayer, position?: number) {
  // The iframe reports PLAYING asynchronously. Give it time before seeking or retrying.
  playStartingUntil = Date.now() + 2000;
  const id = videoId.value;
  if (id && position !== undefined && Math.abs(target.getCurrentTime() - position) > 1.5) {
    if (target.getPlayerState() === 2) {
      // Keep the loaded video on resume. Only seek when catch-up is needed.
      applyToPlayer(() => {
        target.seekTo(position, true);
        target.playVideo();
      });
      return;
    }
    applyToPlayer(() => target.loadVideoById({ videoId: id, startSeconds: position }));
  } else {
    applyToPlayer(() => target.playVideo());
  }
}

function enablePlayback(catchUp = false) {
  autoplayBlocked.value = false;
  if (!player || !playerReady.value) return;
  startPlayer(player, catchUp && !localPlayback.value ? sharedPosition() : undefined);
  localPlaying.value = true;
}

watch([activeEntry, playerAttempt, playerHost], async () => {
  const generation = ++playerGeneration;
  player?.destroy();
  player = undefined;
  playerReady.value = false;
  ignorePlayerEventsUntil = 0;
  playStartingUntil = 0;
  hasPlayed = false;
  cuedPosition = undefined;
  playerError.value = "";
  autoplayBlocked.value = false;
  appliedRevision = -1;
  appliedPlaying = false;
  pendingNativePlay = false;
  seekDraft.value = undefined;
  draggingSeek.value = false;
  optimisticPosition.value = undefined;
  clearPlaybackNotice();
  currentTime.value = 0;
  localPosition.value = undefined;
  duration.value = 0;
  localPlaying.value = false;
  const id = videoId.value;
  if (!id || !playerHost.value) return;

  try {
    const youtube = await loadYouTube();
    if (stopped || generation !== playerGeneration || !playerHost.value) return;
    const element = document.createElement("iframe");
    element.title = "YouTube video player";
    element.referrerPolicy = "strict-origin-when-cross-origin";
    element.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
    element.allowFullscreen = true;

    const embedUrl = new URL(`https://www.youtube.com/embed/${encodeURIComponent(id)}`);
    embedUrl.search = new URLSearchParams({
      enablejsapi: "1",
      controls: "0",
      disablekb: "1",
      playsinline: "1",
      origin: window.location.origin,
      ...(!localPlayback.value && snapshot.value
        ? { start: String(Math.floor(sharedPosition())) }
        : {}),
    }).toString();
    element.src = embedUrl.href;

    playerHost.value.replaceChildren(element);
    player = new youtube.Player(element, {
      events: {
        onReady: ({ target }) => {
          if (stopped || generation !== playerGeneration) return;
          player = target;
          playerReady.value = true;
          syncPlayer();
        },
        onError: ({ data }) => {
          if (generation !== playerGeneration) return;
          playerError.value = [100, 101, 150].includes(data)
            ? "This video is unavailable or cannot be embedded. Ask the owner to choose another video."
            : "YouTube could not load this video.";
        },
        onStateChange: ({ data }) => {
          if (generation === playerGeneration) playerStateChanged(data);
        },
        onAutoplayBlocked: () => {
          if (generation !== playerGeneration) return;
          playStartingUntil = 0;
          autoplayBlocked.value = true;
          localPlaying.value = false;
        },
      },
    });
  } catch {
    if (!stopped && generation === playerGeneration) playerError.value = "Could not load the YouTube player.";
  }
}, { flush: "post" });

async function refresh(syncDuringAction = false, forcePlayback = false) {
  const previous = state.value?.watch.snapshot;
  const result = await api.watch.read({ ...membership, afterRevision: controlRevision });
  if (stopped) return;
  if ("error" in result) {
    networkError.value = "Could not read the watch. Retrying...";
    return;
  }
  if (result.watch.snapshot.revision < (snapshot.value?.revision ?? 0)) return;
  const afterRevision = controlRevision;
  controlRevision = Math.max(controlRevision, result.watch.snapshot.revision);
  state.value = result;
  if (!shared.value && !localEntry.value) localEntry.value = result.watch.entries[0]?.entry;
  networkError.value = "";
  if (result.watch.snapshot.endedAt && shared.value) {
    localEntry.value = result.watch.snapshot.activeEntry;
    shared.value = false;
    connected.value = false;
    player?.pauseVideo();
    autoplayBlocked.value = false;
  }
  if (previous && shared.value) {
    const latest = result.watch.controls.filter((event) => event.event.revision > afterRevision && event.viewer !== props.participant && event.event.entry === result.watch.snapshot.activeEntry).at(-1);
    if (latest) {
      const { operation, offset, position } = latest.event;
      const action = operation === "SEEK"
        ? offset ? `${offset > 0 ? "+" : ""}${offset}s` : `jumped to ${formatPlaybackTime(position)}`
        : operation === "PLAY" ? "played" : "paused";
      if (operation === "SEEK") {
        clearPlaybackNotice();
        pendingSeekNotice = {
          viewer: latest.viewer,
          text: `${latest.name} ${action}`,
          expiresAt: Date.now() + 4000,
        };
      } else {
        showPlaybackNotice(latest.viewer, `${latest.name} ${action}`);
      }
    }
  }
  // A new entry is applied by the player watcher, after it replaces the old iframe.
  if ((!busy.value || syncDuringAction) && previous?.activeEntry === result.watch.snapshot.activeEntry) syncPlayer(forcePlayback);
}

async function heartbeat() {
  const result = await api.watch.presence({ ...membership, connection });
  if (stopped) return false;
  if ("error" in result) {
    connected.value = false;
    networkError.value = "Could not renew your live connection. Retrying...";
    return false;
  }
  connected.value = true;
  lastHeartbeat = Date.now();
  return true;
}

function tick() {
  if (polling || busy.value || stopped) return;
  polling = (async () => {
    await refresh();
    if (!stopped && snapshot.value?.activeEntry && !localPlayback.value && Date.now() - lastHeartbeat >= 5000) {
      await heartbeat();
    }
  })().catch(() => {
    if (!stopped) networkError.value = "Could not reach the watch. Retrying...";
  }).finally(() => { polling = undefined; });
}

async function run(action: () => Promise<void>) {
  if (busy.value || stopped) return;
  busy.value = true;
  error.value = "";
  try {
    await polling;
    if (!stopped) await action();
  } catch {
    if (!stopped) error.value = "Could not reach WatchParty. Try again.";
  } finally {
    busy.value = false;
  }
}

function enter() {
  return run(async () => {
    const result = await api.watch.open(membership);
    if (stopped) return;
    if ("error" in result) {
      error.value = "Could not open this watch. Check your room access and try again.";
      return;
    }
    await refresh(true);
    if (!stopped && shared.value && !live.value) shared.value = false;
    if (!stopped && !localPlayback.value) {
      await heartbeat();
      await refresh(true);
    }
    if (!stopped && timer === undefined) timer = window.setInterval(tick, 1000);
  });
}

function sendControl(operation: Control, position?: number, fromPlayer = false, offset?: number) {
  if (busy.value) return;
  if (!fromPlayer) clearPlaybackNotice();
  if (localPlayback.value) {
    if (!player || !playerReady.value) return;
    if (operation === "PLAY") enablePlayback();
    if (operation === "PAUSE") {
      player.pauseVideo();
      localPlaying.value = false;
      autoplayBlocked.value = false;
    }
    if (operation === "SEEK") {
      const target = position ?? player.getCurrentTime() + (offset ?? 0);
      const seconds = Math.max(0, Math.min(duration.value || Infinity, target));
      player.seekTo(seconds, true);
      currentTime.value = seconds;
    }
    return;
  }
  const current = snapshot.value;
  if (!connected.value || !current?.activeEntry) return;
  const entry = current.activeEntry;
  if (player && playerReady.value && !playerError.value && !fromPlayer) {
    const target = player;
    if (operation === "PLAY") enablePlayback(true);
    if (operation === "PAUSE") {
      playStartingUntil = 0;
      optimisticPosition.value = target.getCurrentTime();
      applyToPlayer(() => target.pauseVideo());
    }
    if (operation === "SEEK") {
      const seconds = Math.max(0, Math.min(duration.value || Infinity, position ?? sharedPosition() + (offset ?? 0)));
      optimisticPosition.value = seconds;
      const status = target.getPlayerState();
      const id = videoId.value;
      if (current.playback === "PAUSED" && (status === -1 || status === 5) && id) {
        cuedPosition = seconds;
        applyToPlayer(() => target.cueVideoById({ videoId: id, startSeconds: seconds }));
      } else {
        applyToPlayer(() => {
          target.seekTo(seconds, true);
          if (current.playback === "PAUSED" && status !== 2) target.pauseVideo();
        });
      }
    }
  }
  return run(async () => {
    const result = await api.watch.control({
      ...membership, entry, connection, expectedRevision: current.revision,
      operation, ...(position === undefined ? {} : { position }),
      ...(offset === undefined ? {} : { offset }),
    });
    const rejected = "error" in result;
    if (rejected) {
      playStartingUntil = 0;
      error.value = result.error === "CONFLICT"
        ? "Playback or presence changed. Try again from the current watch."
        : "Could not send that playback command.";
    }
    await refresh(true, rejected);
  }).finally(() => {
    // Commit the server position before releasing the optimistic thumb.
    if (!localPlayback.value) currentTime.value = sharedPosition();
    optimisticPosition.value = undefined;
  });
}

function discussionPosition() {
  const position = playerReady.value && !playerError.value ? player?.getCurrentTime() : undefined;
  return position !== undefined && Number.isFinite(position) && position >= 0 ? position : undefined;
}

function updateProgress() {
  if (!playerReady.value || !player) return;
  duration.value = player.getDuration() || 0;
  localPosition.value = discussionPosition();
  currentTime.value = localPlayback.value ? player.getCurrentTime() : sharedPosition();
  const notice = pendingSeekNotice;
  if (!notice) return;

  if (localPlayback.value || Date.now() >= notice.expiresAt) {
    pendingSeekNotice = undefined;
    return;
  }

  const status = player.getPlayerState();
  const appliedPosition = status === -1 || status === 5
    ? cuedPosition ?? player.getCurrentTime()
    : player.getCurrentTime();

  if (status !== 3 && Math.abs(appliedPosition - currentTime.value) <= 0.75) {
    showPlaybackNotice(notice.viewer, notice.text);
  }
}

function readSeek(event: Event) {
  return Number((event.target as HTMLInputElement).value);
}

function seek(event: Event) {
  const position = readSeek(event);
  const request = sendControl("SEEK", position);
  seekDraft.value = undefined;
  return request;
}

function togglePlayback() {
  if (autoplayBlocked.value) return enablePlayback(true);
  return sendControl(playing.value ? "PAUSE" : "PLAY");
}

function keyboard(event: KeyboardEvent) {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
      addingVideo.value || !videoId.value || !playerReady.value) return;
  const target = event.target;
  if (target instanceof HTMLElement &&
      target.closest("input, textarea, select, button, summary, a, [contenteditable]")) return;

  if (event.code === "Space") {
    event.preventDefault();
    if (!event.repeat) void togglePlayback();
  } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    event.preventDefault();
    if (!event.repeat) void sendControl("SEEK", undefined, false, event.key === "ArrowLeft" ? -10 : 10);
  }
}

async function addVideo(videoId: string, previewTitle?: string) {
  const result = await api.watch["add-video"]({ ...membership, videoId, previewTitle });
  if ("error" in result) throw new Error(result.error);
  await refresh().catch(() => { networkError.value = "Could not refresh the video list. Retrying..."; });
}

async function joinShared() {
  if (!live.value || !await heartbeat()) return;
  shared.value = true;
  notification.value = undefined;
  await refresh(true);
  syncPlayer();
}

function startWatch() {
  const entry = activeEntry.value;
  if (!entry) return;
  return run(async () => {
    const result = await api.watch.start({ ...membership, entry });
    if ("error" in result) {
      error.value = "Could not start a live watch.";
      return;
    }
    await refresh(true);
    await joinShared();
  });
}

function transferOwnership() {
  const successor = state.value?.watch.ownershipCandidates.find(({ participant }) => participant === ownerSuccessor.value);
  if (!successor) return;
  return run(async () => {
    const result = await api.rooms["transfer-ownership"]({ ...membership, successor: successor.participant });
    if ("error" in result) error.value = "Could not transfer room ownership. Choose an account still in the room.";
    cancelReassign();
    await refresh(true);
  });
}

function switchVideo(entry: VideoEntry) {
  if (entry === activeEntry.value) return;
  return run(async () => {
    if (localPlayback.value) {
      localEntry.value = entry;
      autoplayBlocked.value = false;
      return;
    }
    if (!state.value?.isOwner) return;
    const result = await api.watch["switch-video"]({ ...membership, entry });
    if ("error" in result) error.value = "Could not switch videos.";
    await refresh(true);
  });
}

function endWatch() {
  if (!busy.value && !endWatchDialog.value?.open) endWatchDialog.value?.showModal();
}

async function answerEndWatch(confirmed: boolean) {
  if (!await closeDialog(endWatchDialog.value) || !confirmed || !live.value) return;
  await run(async () => {
    const result = await api.watch.end(membership);
    if ("error" in result) error.value = "Could not end the watch.";
    await refresh(true);
  });
}

onMounted(() => {
  window.addEventListener("keydown", keyboard);
  progressTimer = window.setInterval(updateProgress, 250);
  emit("connection", connection);
  void enter();
});
onBeforeUnmount(() => {
  stopped = true;
  playerGeneration++;
  window.clearInterval(timer);
  window.clearInterval(progressTimer);
  window.removeEventListener("keydown", keyboard);
  window.clearTimeout(noticeTimer);
  window.clearTimeout(copyTimer);
  player?.destroy();
  // Unannounced departures use the grace period, including during a page reload.
});
</script>

<template>
  <section aria-label="Watch" class="watch-layout">
    <header class="watch-header">
      <div class="watch-menu" @keydown.esc.stop="menuOpen = false; menuTrigger?.focus()">
        <button ref="menuTrigger" class="watch-brand gradient-button" type="button" :aria-expanded="menuOpen"
          aria-controls="watch-navigation" @click="menuOpen = !menuOpen">
          <svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M3 5h14M3 10h14M3 15h14" />
          </svg>
          WatchParty
        </button>
        <Transition name="watch-menu">
          <nav v-show="menuOpen" id="watch-navigation" aria-label="WatchParty" @click="menuOpen = false">
            <button v-if="account" type="button" @click="emit('sign-out')">Sign out</button>
            <button v-else type="button" @click="emit('sign-in')">Sign in</button>
            <button type="button" @click="emit('leave-room')">Leave room</button>
            <button v-if="account" type="button" @click="emit('history')">Your Streams</button>
          </nav>
        </Transition>
      </div>
      <template v-if="inviteLink">
        <label class="invite-field code-field">Code
          <input :value="inviteCode" readonly @focus="($event.target as HTMLInputElement).select()" />
        </label>
        <span class="copy-control code-copy">
        <button class="copy-button" type="button" aria-label="Copy code" title="Copy code" @click="copyInvite('code')">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">
            <rect x="8" y="8" width="12" height="12" rx="1.5" /><path d="M16 5H5v11" />
          </svg>
        </button>
          <Transition name="copy-tip">
            <span v-if="copyFeedback?.target === 'code'" class="copy-tooltip" role="status">{{ copyFeedback.text }}</span>
          </Transition>
        </span>
        <label class="invite-field link-field">Invite link
          <input :value="inviteLink" readonly @focus="($event.target as HTMLInputElement).select()" />
        </label>
        <span class="copy-control link-copy">
        <button class="copy-button" type="button" aria-label="Copy link" title="Copy link" @click="copyInvite('link')">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">
            <rect x="8" y="8" width="12" height="12" rx="1.5" /><path d="M16 5H5v11" />
          </svg>
        </button>
          <Transition name="copy-tip">
            <span v-if="copyFeedback?.target === 'link'" class="copy-tooltip" role="status">{{ copyFeedback.text }}</span>
          </Transition>
        </span>
      </template>
      <strong v-if="state" class="watch-mode" :class="{ live: !localPlayback }">
        {{ localPlayback ? "Local playback" : "Live watch" }}
      </strong>
    </header>
    <div class="watch-main">
      <slot />
      <p v-if="error" role="alert">{{ error }}</p>
      <p v-if="networkError" role="status">{{ networkError }}</p>

      <template v-if="state">
        <p v-if="!videoId">
          {{ state?.isOwner ? "Add a YouTube video to the room." : "Waiting for the owner to add a video." }}
        </p>
        <div v-show="videoId" class="player-frame">
          <div ref="playerHost" class="player" />
        </div>
        <p v-if="playerError" role="alert">{{ playerError }}</p>
        <button v-if="playerError" type="button" @click="playerAttempt++">Retry player</button>
        <button v-if="autoplayBlocked" type="button" @click="enablePlayback(true)">Sync playback in this tab</button>

        <div v-if="videoId" class="controls">
          <fieldset :disabled="!playerReady || (!localPlayback && !connected)">
            <legend class="sr-only">Playback controls</legend>
            <div class="seek-track" :style="{
              '--progress': `${seekPercent}%`,
              '--thumb-color': !localPlayback && notification ? participantColor(notification.viewer, roomColors) : 'var(--accent)',
            }">
              <input
                aria-label="Seek"
                type="range"
                min="0"
                :max="duration || 1"
                step="0.1"
                :value="seekPosition"
                :disabled="!duration"
                @pointerdown="draggingSeek = true; clearPlaybackNotice()"
                @pointerup="draggingSeek = false"
                @pointercancel="draggingSeek = false; seekDraft = undefined"
                @pointermove="previewSeekAtPointer"
                @pointerleave="hoverSeek = undefined"
                @blur="draggingSeek = false; seekDraft = undefined"
                @input="seekDraft = readSeek($event)"
                @change="seek"
              />
              <div v-if="previewTime !== undefined && duration > 0"
                class="seek-notice-anchor"
                :style="{ '--progress': `${(previewTime / duration) * 100}%` }"
                aria-hidden="true">
                <div class="seek-preview">{{ formatPlaybackTime(previewTime) }}</div>
              </div>
              <div v-if="!localPlayback && notification" class="seek-notice-anchor">
                <div class="seek-notice" role="status">{{ notification.text }}</div>
              </div>
            </div>
            <div class="transport">
              <button class="play-toggle" type="button" :aria-label="playing ? 'Pause' : 'Play'" @click="togglePlayback">
                <span aria-hidden="true">{{ playing ? "❚❚" : "▶" }}</span>
                <span class="sr-only">{{ playing ? "Pause" : "Play" }}</span>
              </button>
              <button v-for="offset in [-10, 10]" :key="offset" type="button"
                :aria-label="offset < 0 ? 'Back 10 seconds' : 'Forward 10 seconds'"
                @click="sendControl('SEEK', undefined, false, offset)">
                <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                  <path d="M7 6a8 8 0 1 1-3 6M7 2v4H3" fill="none" stroke="currentColor" stroke-width="1.8"
                    :transform="offset > 0 ? 'translate(24 0) scale(-1 1)' : undefined" />
                  <text x="12" y="16" text-anchor="middle" font-size="8" fill="currentColor">10</text>
                </svg>
              </button>
              <span class="seek-time">{{ formatPlaybackTime(seekDraft ?? optimisticPosition ?? currentTime) }} / {{ formatPlaybackTime(duration) }}</span>
              <small class="playback-mode">{{ localPlayback ? "Local playback" : "Shared playback" }}</small>
            </div>
          </fieldset>
        </div>

        <div class="watch-actions">
          <span v-if="watchEnded">Live watch ended</span>
          <button v-if="live && localPlayback" type="button" @click="run(joinShared)">Join live watch</button>
          <button v-if="state.isOwner && !live && !watchEnded && activeEntry" class="start-live" type="button" @click="startWatch">
            Start live watch
          </button>
          <button v-if="state.isOwner && live" type="button" @click="endWatch">End live watch</button>
          <button type="button" @click="emit('leave-room')">Leave room</button>
        </div>

        <Discussion
          :room="room"
          :participant="participant"
          :entry="activeEntry"
          :titles="entryTitles"
          :participant-colors="roomColors"
          :position="localPosition"
          :get-position="discussionPosition"
          :connection="!localPlayback ? connection : undefined"
          @revision="discussionRevision = $event"
        />
      </template>
      <p v-else-if="busy" role="status">Opening watch...</p>
      <button v-else type="button" @click="enter">Retry watch</button>
    </div>

    <aside v-if="state" class="watch-sidebar" aria-label="Room details">
      <section class="video-panel" aria-labelledby="watched-videos-heading">
        <h3 id="watched-videos-heading">Room videos</h3>
        <p v-if="!entries.length">No videos have been added to this room.</p>
        <p v-else-if="!localPlayback && !state.isOwner">The room owner selects the shared video.</p>
        <ul v-if="entries.length" ref="videoList" class="video-list">
          <li v-for="(item, index) in entries" :key="item.entry" :data-entry="item.entry">
            <button type="button" :aria-current="activeEntry === item.entry ? 'true' : undefined"
              :disabled="!localPlayback && !state.isOwner" @click="switchVideo(item.entry)">
              {{ item.source.title || `Video ${index + 1} (${item.source.id})` }}
            </button>
          </li>
        </ul>
        <button v-if="state.isOwner" class="add-video gradient-button" type="button" @click="addingVideo = true">Add video +</button>
        <AddVideoDialog v-if="addingVideo" :save="addVideo" @close="addingVideo = false" />
      </section>
      <section aria-labelledby="participants-heading">
        <h3 id="participants-heading">Participants</h3>
        <ul class="participants">
          <li v-for="member in roster" :key="member.participant">
            <div class="participant-identity">
              <span class="participant-name" :style="{ color: participantColor(member.participant, roomColors) }">{{ member.name }}</span>
              <small v-if="member.participant === participant" class="participant-you">(you)</small>
              <small v-if="member.owner" class="participant-badge owner">Owner</small>
              <small v-if="member.watching" class="live-tag">Live</small>
            </div>
            <button v-if="state.isOwner && member.participant === participant && (choosingOwner || state.watch.ownershipCandidates.length)"
              type="button" :aria-expanded="choosingOwner"
              @click="!busy && (choosingOwner ? cancelReassign() : choosingOwner = true)">{{ choosingOwner ? "Cancel" : "Reassign" }}</button>
            <button v-else-if="state.isOwner && choosingOwner && state.watch.ownershipCandidates.some(({ participant }) => participant === member.participant)"
              type="button"
              :aria-label="`${ownerSuccessor === member.participant ? 'Confirm ownership for' : 'Choose'} ${member.name}`"
              @click="chooseOwner(member.participant)">{{ ownerSuccessor === member.participant ? "Confirm" : "Choose" }}</button>
          </li>
        </ul>
      </section>
      <section v-if="activeEntry" class="overview-panel" aria-label="AI overview">
        <DiscussionSummary
          :key="activeEntry"
          :room="room"
          :participant="participant"
          :entry="activeEntry"
          :discussion-revision="discussionRevision"
        />
      </section>
    </aside>
    <dialog ref="endWatchDialog" class="watch-dialog" aria-labelledby="end-watch-heading"
      aria-describedby="end-watch-warning" @cancel.prevent="answerEndWatch(false)">
      <h2 id="end-watch-heading" class="watch-dialog-title">End the live watch?</h2>
      <div class="watch-dialog-body">
        <p id="end-watch-warning">Shared playback cannot restart in this room.</p>
        <div class="watch-dialog-actions">
          <button type="button" autofocus @click="answerEndWatch(false)">Cancel</button>
          <button class="gradient-button" type="button" @click="answerEndWatch(true)">Confirm</button>
        </div>
      </div>
    </dialog>
  </section>
</template>

<style scoped>
.watch-layout { display: grid; grid-template-columns: minmax(0, 1fr) clamp(14rem, 23vw, 20rem); align-items: start; }
.watch-header {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: #100e10;
  color: var(--text);
  border-bottom: 1px solid var(--line);
}
.watch-mode { margin-inline-start: auto; padding: 0.35rem 0.65rem; border: 1px solid #ac9ca5; border-radius: 999px; }
.watch-mode.live { background: var(--accent); }
.watch-menu { position: relative; margin-inline-end: clamp(0.4rem, 1vw, 0.9rem); }
.watch-header .watch-brand {
  display: flex; align-items: center; gap: 0.45rem;
  padding: 0.2rem 0.45rem;
  font: 700 1.3rem var(--display); letter-spacing: -0.055em;
}
.invite-field { display: flex; align-items: center; gap: 0.4rem; white-space: nowrap; }
.invite-field input { min-width: 0; padding: 0.15rem 0.4rem; font: 500 0.82rem/1.3 var(--participant-font); }
.code-copy { margin-inline-end: clamp(0.35rem, 1vw, 0.85rem); }
.link-copy { margin-inline-end: clamp(0.65rem, 2vw, 1.8rem); }
.code-field input { width: 6rem; }
.link-field { flex: 1 1 13rem; min-width: 0; }
.link-field input { flex: 1; width: 0; }
.copy-button { display: inline-grid; place-items: center; padding: 0.3rem; background: transparent; border-color: transparent; }
.copy-button:not(:disabled):hover { color: #54d9f5; }
.copy-control { position: relative; display: inline-flex; }
.copy-tooltip { position: absolute; z-index: 5; top: calc(100% + 0.3rem); left: 50%; transform: translateX(-50%); white-space: nowrap; pointer-events: none; padding: 0.25rem 0.5rem; border: 1px solid var(--outline); border-radius: 0.35rem; background: var(--raised); font-size: 0.75rem; }
.copy-tip-enter-active, .copy-tip-leave-active { transition: opacity 140ms ease; }
.copy-tip-enter-from, .copy-tip-leave-to { opacity: 0; }
@media (prefers-reduced-motion: reduce) {
  .copy-tip-enter-active, .copy-tip-leave-active { transition: none; }
}
.watch-menu nav { position: absolute; z-index: 10; inset-block-start: calc(100% + 0.35rem); display: grid; gap: 0.35rem; background: var(--surface); padding: 0.5rem; min-width: 10rem; border: 1px solid var(--line); border-radius: 0.4rem; }
.watch-menu-enter-active, .watch-menu-leave-active { transition: opacity 150ms ease, transform 150ms ease; }
.watch-menu-enter-from, .watch-menu-leave-to { opacity: 0; transform: translateY(-0.35rem); }
@media (prefers-reduced-motion: reduce) {
  .watch-menu-enter-active, .watch-menu-leave-active { transition: none; }
}
.watch-main, .watch-sidebar { min-width: 0; }
.watch-main > :not(.player-frame, .controls, .discussion) { margin-inline: 1rem; }
.player-frame { margin: 0; }
.player {
  width: 100%;
  aspect-ratio: 16 / 9;
  min-height: 200px;
  background: #080c13;
  overflow: hidden;
}
.player :deep(iframe) { display: block; width: 100%; height: 100%; border: 0; }
.watch-sidebar { position: relative; background: var(--surface); border-inline-start: 1px solid var(--line); }
.watch-sidebar > section { min-width: 0; padding: 1rem; border-bottom: 1px solid var(--line); }
.watch-sidebar > .overview-panel { padding: 0; }
.video-panel { display: flex; flex-direction: column; }
.watch-main > :deep(.discussion) { margin-inline: 0; min-height: clamp(26rem, 68dvh, 44rem); border-top: 1px solid var(--line); }

.video-list, .participants { list-style: none; padding: 0; }
.video-list { max-height: 12rem; display: grid; gap: 0.35rem; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
.watch-page .video-list button:not(.gradient-button) { border-color: var(--outline); box-shadow: none; }
.video-list button { width: 100%; text-align: start; overflow-wrap: anywhere; }
.watch-page .video-list button[aria-current]:not(.gradient-button) { border-color: #d35b72; }
.video-list button[aria-current] { background: var(--accent); color: white; opacity: 1; }
.video-list button[aria-current]:disabled { background: #452730; color: #f1cbd3; box-shadow: none; }
.add-video {
  align-self: end; margin-block: 0.4rem 0.1rem; padding: 0.16rem 0.45rem;
  font-weight: 800; font-size: 0.82rem;
}
@media (hover: hover) {
  .watch-page .video-list button:not(:disabled):hover {
    color: #fff0f6;
    box-shadow: inset 2px 0 5px #42c8e485, inset -2px 0 5px #ec6dac85, inset 0 -1px 4px #ffa06a65;
  }
}
form, select { margin-block: 0.5rem; }
.watch-actions { display: flex; justify-content: flex-end; flex-wrap: wrap; align-items: center; gap: 0.5rem; padding-block: 0.75rem; }
.participants li { display: flex; align-items: center; gap: 0.5rem; margin-block: 0.35rem; }
.participant-identity { display: flex; flex: 1; flex-wrap: wrap; align-items: baseline; gap: 0.2rem 0.35rem; min-width: 0; }
.participant-name { font: 600 0.875rem var(--participant-font); min-width: 0; overflow-wrap: anywhere; }
.participant-you, .participant-badge { font-size: 0.68rem; line-height: 1.3; white-space: nowrap; }
.participant-you { color: #c8b9c4; }
.participant-badge { padding: 0.1rem 0.3rem; border-radius: 0.25rem; }
.participant-badge.owner { background: #48252b; color: #ffd1d8; font-weight: 800; }
.participants button { padding: 0.25rem 0.4rem; font-size: 0.75rem; }
.controls fieldset { border: 0; padding: 0; margin: 0; }
.seek-track { position: relative; z-index: 3; --thumb-size: 12px; padding-inline: 0.55rem; }
.seek-track input { display: block; appearance: none; width: 100%; height: 18px; margin: 0; background: transparent; }
.seek-track input::-webkit-slider-runnable-track { height: 3px; background: linear-gradient(to right, #ad5262 var(--progress), var(--line) var(--progress)); }
.seek-track input::-moz-range-track { height: 3px; background: linear-gradient(to right, #ad5262 var(--progress), var(--line) var(--progress)); }
.seek-track input::-webkit-slider-thumb { appearance: none; width: var(--thumb-size); height: var(--thumb-size); margin-top: -4.5px; border-radius: 50%; background: var(--thumb-color); }
.seek-track input::-moz-range-thumb { width: var(--thumb-size); height: var(--thumb-size); border: 0; border-radius: 50%; background: var(--thumb-color); }
.seek-notice-anchor { position: absolute; inset: 0 1rem; pointer-events: none; }
.seek-notice {
  position: absolute; z-index: 2; inset-block-start: 16px; left: clamp(5.5rem, var(--progress), calc(100% - 5.5rem));
  transform: translateX(-50%); width: max-content; max-width: 11rem; padding: 0.3rem 0.55rem;
  background: var(--raised); border: 1px solid var(--thumb-color); border-radius: 0.35rem;
  color: var(--text); font-size: 0.75rem; text-align: center; overflow-wrap: anywhere;
}
.seek-preview {
  position: absolute; z-index: 3; inset-block-end: calc(100% + 0.2rem);
  left: clamp(1.5rem, var(--progress), calc(100% - 1.5rem));
  transform: translateX(-50%); padding: 0.2rem 0.4rem; border-radius: 0.3rem;
  background: var(--raised); border: 1px solid var(--outline); color: var(--text);
  font-size: 0.75rem; font-variant-numeric: tabular-nums; white-space: nowrap;
}
.seek-preview-anchor {
  visibility: hidden;
}

.seek-track input:hover + .seek-preview-anchor,
.seek-preview-anchor.is-scrubbing {
  visibility: visible;
}
.transport { display: flex; align-items: center; flex-wrap: wrap; gap: 0.25rem; padding: 0 0.55rem 0.25rem; }
.transport button { display: grid; place-items: center; width: 2rem; height: 2rem; padding: 0.15rem; border-radius: 50%; border-color: transparent; background: transparent; }
.transport .play-toggle { font-size: 0.9rem; }
.seek-time { margin-inline-start: 0.35rem; white-space: nowrap; font-variant-numeric: tabular-nums; font-size: 0.8rem; }
.playback-mode { margin-inline-start: auto; color: #c8b9c4; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
@media (max-width: 760px) {
  .watch-layout { grid-template-columns: minmax(0, 1fr); }
  .watch-sidebar { border-inline-start: 0; border-top: 1px solid var(--line); }
}
.watch-page button.start-live:not(.gradient-button) {
  background: linear-gradient(110deg, #b0d9e2, #cbb9e5 38%, #e4b8ce 68%, #efc9a4);
  color: var(--surface);
  border-color: #171417;
  font-weight: 800;
  box-shadow: 0 0 2px #ffffff80, 0 0 6px #ffffff44;
}

@media (hover: hover) {
  .watch-page button.start-live:not(.gradient-button):not(:disabled):hover {
    color: var(--surface);
    border-color: #171417;
    box-shadow:
      -2px 0 7px #42c8e480,
       2px 0 7px #ec6dac85,
       0 -1px 6px #8472ed65,
       0 1px 6px #ffa06a65;
  }
}
</style>
