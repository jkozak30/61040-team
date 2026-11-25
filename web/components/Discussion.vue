<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { closeDialog } from "../dialog-motion.ts";
import { formatPlaybackTime } from "../../src/playback-time.ts";
import type { DiscussionFocus, DiscussionMessage as Message, DiscussionThread } from "../discussion-types.ts";
import ScrollCues from "./ScrollCues.vue";
import DiscussionMessage from "./DiscussionMessage.vue";

const props = withDefaults(defineProps<{
  room: string;
  participant: string;
  entry: string;
  connection: string;
  position?: number;
  live: boolean;
  participantColors: ReadonlyMap<string, string>;
  focusRequest?: DiscussionFocus;
  revision: number;
  activity: number;
  seekRevision: number;
  expanded?: boolean;
  contentVisible?: boolean;
}>(), { expanded: true });
const contentShown = computed(() => props.contentVisible ?? props.expanded);
const emit = defineEmits<{ seek: [number]; changed: []; toggle: [] }>();
const threads = ref<DiscussionThread[]>([]);
const busy = ref(false);
const error = ref("");
const threadList = ref<HTMLElement>();
const discussionRoot = ref<HTMLElement>();
let readingDiscussion = false;
const deleteDialog = ref<HTMLDialogElement>();
const deleting = ref<Message>();
const following = ref(true);
const openThreads = ref(new Set<string>());
const selectedThread = ref<string>();
const selectedMessage = ref<string>();
let poll: ReturnType<typeof setInterval> | undefined;
let highlightTimer: ReturnType<typeof setTimeout> | undefined;
let version = 0;
let stopped = false;
let lastFocus = 0;
let followedTop = 0;


const orderedThreads = computed(() => [...threads.value].sort((left, right) =>
  left.anchor - right.anchor));
const replies = computed(() => {
  const children = new Map<string, Message[]>();
  for (const thread of threads.value) {
    for (const message of thread.messages) {
      if (!message.parent) continue;
      const siblings = children.get(message.parent) ?? [];
      siblings.push(message);
      children.set(message.parent, siblings);
    }
  }
  return children;
});
const followThread = computed(() => {
  if (props.position === undefined || !orderedThreads.value.length) return undefined;
  return orderedThreads.value.reduce((nearest, thread) =>
    Math.abs(thread.anchor - props.position!) < Math.abs(nearest.anchor - props.position!) ? thread : nearest).thread;
});
const nearPlayback = (anchor: number) => props.position !== undefined && Math.abs(anchor - props.position) <= 5;

function scrollWithinList(target: HTMLElement, smooth = true) {
  const list = threadList.value;
  if (!list) return;
  const top = target.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop - 8;
  followedTop = Math.max(0, Math.min(top, list.scrollHeight - list.clientHeight));
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  list.scrollTo({ top: followedTop, behavior: smooth && !reducedMotion ? "smooth" : "instant" });
}
function alignDiscussion() {
  if (!following.value || !followThread.value || selectedThread.value) return;
  const row = [...(threadList.value?.children ?? [])].find((child) =>
    (child as HTMLElement).dataset.thread === followThread.value);
  if (row) scrollWithinList(row as HTMLElement);
}
function stopFollowing() {
  following.value = false;
  readingDiscussion = true;
}
function resumeFollowing() {
  if (readingDiscussion) return;
  clearTimeout(highlightTimer);
  selectedThread.value = undefined;
  selectedMessage.value = undefined;
  following.value = true;
  void nextTick(alignDiscussion);
}
watch(() => props.activity, followNow);
watch(() => props.seekRevision, () => {
  // A seek originating inside Discussion is still a discussion interaction.
  // Outside clicks/keys already release the reading lock through the document listener.
  if (!readingDiscussion) resumeFollowing();
}, { flush: "post" });
function trackDiscussionClick(event: Event) {
  readingDiscussion = event.target instanceof Node && !!discussionRoot.value?.contains(event.target);
  if (readingDiscussion) stopFollowing();
  else followNow();
}
function followNow() { readingDiscussion = false; resumeFollowing(); }
// Clicks inside the embedded player do not bubble out of its document.
let playerFocusTimer: ReturnType<typeof setTimeout> | undefined;
function followPlayerFocus() {
  clearTimeout(playerFocusTimer);
  playerFocusTimer = setTimeout(() => {
    if (document.activeElement instanceof HTMLIFrameElement) followNow();
  }, 0);
}

async function focusThread(thread: string, message?: string, holdReading = true) {
  await nextTick();
  const row = [...(threadList.value?.children ?? [])].find((child) =>
    (child as HTMLElement).dataset.thread === thread) as HTMLElement | undefined;
  if (!row) return false;
  openThreads.value.add(thread);
  if (holdReading) stopFollowing();
  following.value = !readingDiscussion;
  selectedThread.value = thread;
  selectedMessage.value = message;
  clearTimeout(highlightTimer);
  await nextTick();
  scrollWithinList(row);
  highlightTimer = setTimeout(() => {
    selectedThread.value = undefined;
    selectedMessage.value = undefined;
  }, 4000);
  return true;
}
async function request(path: string, payload: object) {
  const response = await fetch(`/api${path}`, {
    method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok || data.error) throw new Error(data.message ?? data.error ?? "Request failed");
  return data;
}
async function refresh() {
  const entry = props.entry;
  const at = ++version;
  try {
    const result = await request("/discussion/threads", { room: props.room, participant: props.participant, entry });
    if (!stopped && at === version && entry === props.entry) {
      threads.value = result.threads ?? [];
    }
  } catch (cause) {
    if (!stopped && at === version && entry === props.entry) error.value = String(cause);
  }
}
async function mutate(path: string, payload: object, thread?: string, message?: string) {
  if (busy.value) return;
  const entry = props.entry;
  busy.value = true;
  error.value = "";
  try {
    const result = await request(path, { room: props.room, participant: props.participant, ...payload });
    if (!stopped && entry === props.entry) {
      await refresh();
      emit("changed");
      if (thread) await focusThread(thread, result.message ?? message);
    }
  } catch (cause) {
    if (!stopped && entry === props.entry) error.value = String(cause);
  } finally { busy.value = false; }
}
function postReply(parent: string, text: string) {
  const thread = threads.value.find((thread) => thread.messages.some((message) => message.message === parent));
  return mutate("/discussion/reply", {
    parent, text, mode: props.live ? "LIVE" : "HISTORICAL", connection: props.connection,
  }, thread?.thread);
}
function editMessage(message: Message, text: string) {
  if (text.trim() === message.text.trim()) return;
  const thread = threads.value.find((thread) => thread.messages.some((item) => item.message === message.message));
  return mutate("/discussion/edit-message", { message: message.message, text }, thread?.thread, message.message);
}
function askDelete(message: Message) {
  deleting.value = message;
  deleteDialog.value?.showModal();
}
async function answerDelete(confirmed: boolean) {
  const message = deleting.value;
  if (!await closeDialog(deleteDialog.value)) return;
  deleting.value = undefined;
  if (confirmed && message) await mutate("/discussion/delete-message", { message: message.message });
}
watch(() => props.entry, () => {
  version++;
  threads.value = [];
  openThreads.value.clear();
  following.value = true;
  selectedThread.value = undefined;
  selectedMessage.value = undefined;
  clearTimeout(highlightTimer);
  deleting.value = undefined;
  deleteDialog.value?.close();
  error.value = "";
  void refresh();
});
watch([() => props.focusRequest, threads], async ([focus]) => {
  if (!focus || focus.id === lastFocus) return;
  if (await focusThread(focus.thread, focus.message, focus.holdReading)) lastFocus = focus.id;
}, { flush: "post" });
watch(() => props.revision, () => void refresh());
watch([followThread, following, selectedThread, threadList, () => orderedThreads.value.length], alignDiscussion, { flush: "post" });
watch([threadList, () => orderedThreads.value.length, () => openThreads.value.size], ([list], _, onCleanup) => {
  if (!list) return;
  let frame = 0;
  const resize = new ResizeObserver(() => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
    const rows = [...list.querySelectorAll<HTMLElement>(":scope > [data-thread]")];
    const height = rows.length ? rows[rows.length - 1]!.getBoundingClientRect().bottom - rows[0]!.getBoundingClientRect().top + 16 : 0;
    const last = rows[rows.length - 1];
    const posts = last?.classList.contains("expanded")
      ? [...last.querySelectorAll<HTMLElement>("article[data-message]")]
      : [];
    const finalPost = posts[posts.length - 1] ?? last;
    // The tail permits the final post to reach the top, never to scroll past it.
    // Include the thread's bottom margin and the same 8px alignment inset.
    const trailingContent = last && finalPost
      ? last.getBoundingClientRect().bottom - finalPost.getBoundingClientRect().top + 16
      : list.clientHeight;
    const space = height > list.clientHeight + 3 ? Math.max(0, list.clientHeight - trailingContent) : 0;
    const value = `${space}px`;
    if (list.style.getPropertyValue("--follow-space") !== value) list.style.setProperty("--follow-space", value);
    alignDiscussion();
    });
  });
  resize.observe(list);
  for (const row of list.children) resize.observe(row);
  onCleanup(() => { resize.disconnect(); cancelAnimationFrame(frame); });
}, { flush: "post" });
async function toggleThread(thread: string) {
  if (thread !== followThread.value) stopFollowing();
  if (openThreads.value.has(thread)) openThreads.value.delete(thread);
  else openThreads.value.add(thread);
  await nextTick();
  alignDiscussion();
}
onMounted(() => { window.addEventListener("blur", followPlayerFocus); for (const event of ["pointerdown", "wheel", "keydown", "input", "touchstart"]) document.addEventListener(event, trackDiscussionClick, { capture: true, passive: true }); void refresh(); poll = setInterval(() => { if (!busy.value) void refresh(); }, 3500); });
onBeforeUnmount(() => { window.removeEventListener("blur", followPlayerFocus); clearTimeout(playerFocusTimer); for (const event of ["pointerdown", "wheel", "keydown", "input", "touchstart"]) document.removeEventListener(event, trackDiscussionClick, true); stopped = true; version++; clearInterval(poll); clearTimeout(highlightTimer); });
</script>

<template>
  <section ref="discussionRoot" aria-label="Discussion" class="discussion" :class="{ collapsed: !contentShown }"
    @pointerdown.capture="stopFollowing" @pointerup.capture="stopFollowing"
    @pointermove.capture="$event.buttons && stopFollowing()" @click.capture="stopFollowing"
    @keydown.capture="stopFollowing" @input.capture="stopFollowing"
    @wheel.capture.passive="stopFollowing" @touchmove.capture.passive="stopFollowing"
    @scroll.capture="!following && stopFollowing()">
    <header>
      <h3><button class="discussion-toggle" type="button" :aria-expanded="expanded" @click="emit('toggle')">
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" /></svg>Discussion
      </button></h3>
      <button v-if="expanded && !following" class="gradient-button follow-button" type="button" @click="followNow">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7"
          stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 6 7 6-7 6m7-12 7 6-7 6M21 6v12" /></svg>
        Follow playback
      </button>
    </header>
    <p v-if="contentShown && error" role="alert">{{ error }}</p>
    <p v-if="contentShown && !threads.length" role="status">No comments yet.</p>
    <ScrollCues v-show="contentShown" :inert="!expanded" class="discussion-scroll" :target="threadList" content-selector=":scope > [data-thread]" label="discussion">
    <div ref="threadList" class="thread-list" tabindex="0" aria-label="Discussion threads" @wheel.passive="stopFollowing" @touchstart.passive="stopFollowing"
      @keydown="['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End'].includes($event.key) && stopFollowing()">
      <div v-for="thread in orderedThreads" :key="thread.thread" :data-thread="thread.thread"
        class="thread-panel" :class="{ nearby: nearPlayback(thread.anchor), focused: selectedThread === thread.thread, expanded: openThreads.has(thread.thread) }">
        <button type="button" class="thread-summary" :aria-expanded="openThreads.has(thread.thread)"
          @click="toggleThread(thread.thread)">
          <span class="thread-time">{{ formatPlaybackTime(thread.anchor) }}</span>
          <span class="thread-preview-copy" :aria-hidden="openThreads.has(thread.thread)">
          <span v-if="thread.messages[0]?.context === 'LIVE'" class="live-tag">Live</span>
          <span v-else class="historical-tag">Historical</span>
          <span class="thread-title">{{ thread.messages[0]?.deletedAt ? 'Comment deleted.' : thread.messages[0]?.text }}</span>
          </span>
        </button>
        <div class="thread-collapse" :class="{ expanded: openThreads.has(thread.thread) }"
          :inert="!openThreads.has(thread.thread)" @transitionend.self="alignDiscussion">
          <div class="thread-body"><div class="thread-content">
        <DiscussionMessage v-for="message in thread.messages.filter((message) => message.parent === null)"
          :key="message.message" :message="message" :replies="replies" :participant="participant"
          :participant-colors="participantColors" :busy="busy" :selected-message="selectedMessage" :anchor="thread.anchor"
          @seek="selectedThread = undefined; emit('seek', $event)" @reply="postReply" @edit="editMessage" @delete="askDelete" />
          </div></div>
        </div>
      </div>
    </div>
    </ScrollCues>
    <dialog ref="deleteDialog" class="watch-dialog" aria-labelledby="delete-comment-heading" @cancel.prevent="answerDelete(false)">
      <h4 id="delete-comment-heading" class="watch-dialog-title">Delete comment?</h4>
      <div class="watch-dialog-body">
        <p>Your comment will be removed. Replies will stay in the thread.</p>
        <div class="watch-dialog-actions">
          <button type="button" :disabled="busy" @click="answerDelete(false)">Cancel</button>
          <button class="gradient-button" type="button" :disabled="busy" @click="answerDelete(true)">Delete comment</button>
        </div>
      </div>
    </dialog>
  </section>
</template>

<style scoped>
.discussion { display: flex; flex-direction: column; min-height: 0; padding: 1rem; }
header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.5rem; }
header h3 { margin: 0; }
.watch-page .discussion > header > h3 { font-size: clamp(1.6rem, 2.5vw, 2.25rem); }
.watch-page .discussion > header { padding-inline-start: 0.3rem; }
.watch-page .follow-button { margin-inline-end: 0.85rem; display: inline-flex; align-items: center; gap: 0.25rem; padding: 0.15rem 0.4rem; font-size: 0.75rem; line-height: 1.15; min-height: 0; align-self: center; }
.discussion-scroll { flex: 1; margin-inline: -1rem; margin-block-end: -1rem; }
.thread-list { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; overflow-anchor: none; padding: 0.5rem 1rem 0; scrollbar-gutter: stable; }
.thread-list::after { content: ""; display: block; height: var(--follow-space, 0px); }
.thread-panel { margin-block: 0.5rem; border: 1px solid var(--line); border-radius: 0.55rem; overflow: hidden; }
.thread-summary {
  display: flex; align-items: center; gap: 0.35rem; width: 100%; min-width: 0; padding: 0.45rem 0.4rem;
  text-align: left; border: 0; border-radius: 0; cursor: pointer; background: transparent;
}
.watch-page .thread-summary:not(.gradient-button) { box-shadow: none; }
.thread-summary::before { content: ""; width: 0.4rem; height: 0.4rem; border-inline-end: 1.5px solid currentColor; border-block-end: 1.5px solid currentColor; transform: rotate(-45deg); transition: transform 200ms ease; flex: none; margin-inline: 0.2rem; }
.expanded > .thread-summary::before { transform: rotate(45deg); }
.thread-time { flex: none; font-variant-numeric: tabular-nums; font-size: 0.8rem; }
.thread-title { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 0.875rem; }
.historical-tag { padding: 0.1rem 0.3rem; border-radius: 0.25rem; background: #39313d; color: #dbccdf; font-size: 0.68rem; line-height: 1.3; flex: none; }
.thread-panel, .thread-summary { transition: border-color 600ms ease, background-color 600ms ease; }
.thread-summary { position: relative; isolation: isolate; }
.thread-summary::after { content: ""; position: absolute; inset: 0; z-index: -1; background: linear-gradient(110deg, #47391f, #4d3024 52%, #49301f); opacity: 0; transition: opacity 600ms ease; }
.nearby, .focused { border-color: #a36f39; }
.nearby > .thread-summary::after, .focused > .thread-summary::after { opacity: 1; }
.thread-collapse { display: grid; grid-template-rows: 0fr; opacity: 0; transition: grid-template-rows 220ms ease, opacity 180ms ease; }
.thread-collapse.expanded { grid-template-rows: 1fr; opacity: 1; }
.thread-body { min-height: 0; overflow: hidden; }
.thread-content { padding: 0.55rem 0 0; border-top: 1px solid var(--line); }
.expanded.thread-panel { border-color: transparent; border-radius: 0; }
.thread-preview-copy { display: flex; align-items: center; gap: 0.35rem; min-width: 0; max-width: 100%; opacity: 1; transition: opacity 160ms ease, max-width 220ms ease; }
.expanded .thread-preview-copy { opacity: 0; max-width: 0; overflow: hidden; pointer-events: none; }
.expanded > .thread-summary::after { opacity: 0; }
.nearby .thread-content > :deep(.message-tree > article:first-child) { border-color: #a36f39; --message-highlight: 1; }
.discussion > p { font-size: 0.85rem; margin-block: 0.5rem; }
@media (prefers-reduced-motion: reduce) {
  .thread-panel, .thread-summary, .thread-summary::after, .thread-summary::before, .thread-collapse, .thread-preview-copy { transition: none; }
}
.discussion.collapsed { padding-bottom: 0; }
.discussion.collapsed > header { margin-bottom: 0; }
.watch-page button.discussion-toggle:not(.gradient-button) { display: flex; align-items: center; gap: 0.25rem; padding: 0; border: 0; background: transparent; box-shadow: none; font: inherit; letter-spacing: inherit; color: inherit; }
.watch-page button.discussion-toggle:not(.gradient-button):hover { color: #50494a; background: transparent; box-shadow: none; }
.discussion-toggle svg { width: 0.65em; height: 0.65em; flex: none; fill: none; stroke: currentColor; stroke-width: 1.75; stroke-linecap: round; stroke-linejoin: round; transition: transform 160ms ease; }
.discussion-toggle[aria-expanded="true"] svg { transform: rotate(90deg); }
@media (prefers-reduced-motion: reduce) { .discussion-toggle svg { transition: none; } }
</style>
