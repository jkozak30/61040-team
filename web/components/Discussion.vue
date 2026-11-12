<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { formatPlaybackTime } from "../../src/playback-time.ts";
import { createHttpClient } from "@mit-sdg/sync-engine-http/client";
import type { WatchPartyWireHttp } from "../../generated/wire.ts";
import sendIcon from "../assets/paper-plane.svg";
import DiscussionMessage from "./DiscussionMessage.vue";

type ReadInput = WatchPartyWireHttp["/discussion/read"]["input"];
type Snapshot = WatchPartyWireHttp["/discussion/read"]["output"]["discussion"];
type Message = Snapshot["messages"][number];

const props = defineProps<{
  room: ReadInput["room"];
  participant: ReadInput["participant"];
  entry: ReadInput["entry"] | undefined;
  titles: ReadonlyMap<ReadInput["entry"], string>;
  participantColors: ReadonlyMap<string, string>;
  position: number | undefined;
  connection?: WatchPartyWireHttp["/discussion/start-thread"]["input"]["connection"];
  getPosition: () => number | undefined;
}>();

const emit = defineEmits<{ revision: [number | undefined] }>();

const api = createHttpClient<WatchPartyWireHttp>({ baseUrl: "/api" });
const snapshots = reactive(new Map<ReadInput["entry"], Snapshot>());
const drafts = reactive(new Map<ReadInput["entry"], string>());
const repliesDrafts = reactive(new Map<ReadInput["entry"], Map<Message["message"], string>>());
const replyingTo = reactive(new Map<ReadInput["entry"], Message["message"]>());
const pending = reactive(new Set<ReadInput["entry"]>());
const postErrors = reactive(new Map<ReadInput["entry"], string>());
const readError = ref("");
let timer: number;
const reading = new Set<ReadInput["entry"]>();
let stopped = false;

const current = computed(() => props.entry ? snapshots.get(props.entry) : undefined);
const orderedThreads = computed(() => [...(current.value?.threads ?? [])].sort((left, right) => left.anchor - right.anchor));
const following = ref(true);
const threadList = ref<HTMLElement>();
let followedTop = 0;
const followThread = computed(() => {
  if (props.position === undefined) return undefined;
  return (orderedThreads.value.find(({ anchor }) => anchor >= props.position!) ?? orderedThreads.value.at(-1))?.thread;
});

function alignDiscussion() {
  const list = threadList.value;
  if (!list || !following.value) return;
  const row = [...list.children].find((child) => (child as HTMLElement).dataset.thread === followThread.value);
  const top = row ? list.scrollTop + row.getBoundingClientRect().top - list.getBoundingClientRect().top : 0;
  list.scrollTop = Math.max(0, Math.min(top, list.scrollHeight - list.clientHeight));
  followedTop = list.scrollTop;
}

function onDiscussionScroll() {
  if (threadList.value && Math.abs(threadList.value.scrollTop - followedTop) > 1) following.value = false;
}

watch([followThread, following, threadList], alignDiscussion, { flush: "post" });
watch(() => current.value?.revision, (revision) => emit("revision", revision), { immediate: true });
const roots = computed(() => new Map(current.value?.messages.filter((message) => !message.parent)
  .map((message) => [message.thread, message])));
const replies = computed(() => {
  const children = new Map<Message["message"], Message[]>();
  for (const message of current.value?.messages ?? []) {
    if (!message.parent) continue;
    const siblings = children.get(message.parent);
    if (siblings) siblings.push(message);
    else children.set(message.parent, [message]);
  }
  return children;
});

const savedElsewhere = computed(() => [...props.titles]
  .filter(([entry]) => entry !== props.entry &&
    (drafts.get(entry)?.trim() || [...(repliesDrafts.get(entry)?.values() ?? [])].some((text) => text.trim())))
  .map(([, title]) => title));

async function refresh(entry = props.entry) {
  if (!entry || reading.has(entry) || stopped) return;
  reading.add(entry);
  try {
    const result = await api.discussion.read({ room: props.room, participant: props.participant, entry });
    if (stopped || entry !== props.entry) return;
    if ("error" in result) {
      readError.value = "Could not load this discussion. Retrying...";
      return;
    }
    if ((snapshots.get(entry)?.revision ?? 0) <= result.discussion.revision) snapshots.set(entry, result.discussion);
    readError.value = "";
  } catch {
    if (!stopped && entry === props.entry) readError.value = "Could not reach the discussion. Retrying...";
  } finally {
    reading.delete(entry);
  }
}

function replyDraft(entry: ReadInput["entry"], parent: Message["message"], text: string) {
  if (!repliesDrafts.has(entry)) repliesDrafts.set(entry, new Map());
  repliesDrafts.get(entry)!.set(parent, text);
}

async function post(entry: ReadInput["entry"], parent?: Message["message"]) {
  const text = (parent ? repliesDrafts.get(entry)?.get(parent) : drafts.get(entry))?.trim();
  const position = parent ? undefined : props.getPosition();
  if (!text || pending.has(entry) || (!parent && position === undefined)) return;
  const membership = { room: props.room, participant: props.participant, connection: props.connection };
  pending.add(entry);
  postErrors.delete(entry);
  try {
    const result = parent
      ? await api.discussion.reply({ ...membership, parent, text })
      : await api.discussion["start-thread"]({ ...membership, entry, position: position!, text });
    if ("error" in result) {
      postErrors.set(entry, result.error === "CONFLICT"
        ? "The selected video changed. Your draft is saved with this video."
        : "Could not post. Your draft is saved.");
      return;
    }
    if (parent) {
      repliesDrafts.get(entry)?.delete(parent);
      replyingTo.delete(entry);
    } else {
      drafts.delete(entry);
    }
    if (entry === props.entry) await refresh(entry);
  } catch {
    postErrors.set(entry, "Could not confirm the post. Your draft is saved.");
  } finally {
    pending.delete(entry);
  }
}

watch(() => props.entry, (entry) => {
  readError.value = "";
  following.value = true;
  void refresh(entry);
}, { immediate: true });
onMounted(() => { timer = window.setInterval(() => void refresh(), 1500); });
onBeforeUnmount(() => {
  stopped = true;
  window.clearInterval(timer);
});
</script>

<template>
  <section v-if="entry" aria-label="Discussion" class="discussion">
    <header>
      <h3>Discussion</h3>
      <button v-if="!following" class="gradient-button follow-button" type="button" @click="following = true">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7"
          stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="m4 6 7 6-7 6m7-12 7 6-7 6M21 6v12" />
        </svg>
        Follow playback
      </button>
    </header>
    <p v-if="savedElsewhere.length" role="status">Draft saved for {{ savedElsewhere.join(", ") }}.</p>
    <p v-if="readError" role="status">{{ readError }}</p>
    <p v-if="postErrors.get(entry)" role="alert">{{ postErrors.get(entry) }}</p>
    <form @submit.prevent="post(entry)">
      <label>
        New comment<span v-if="position !== undefined"> ({{ formatPlaybackTime(position) }})</span>
        <span class="comment-editor">
          <span aria-hidden="true" class="comment-measure">{{ (drafts.get(entry) ?? '') + ' ' }}</span>
          <textarea
            :value="drafts.get(entry) ?? ''"
            :disabled="pending.has(entry)"
            maxlength="4000"
            rows="1"
            @input="drafts.set(entry, ($event.target as HTMLTextAreaElement).value)"
          />
        </span>
      </label>
      <div class="reply-actions">
        <button class="reply-icon" type="submit" aria-label="Post comment" title="Post comment"
          :disabled="pending.has(entry) || position === undefined || !drafts.get(entry)?.trim()">
          <img :src="sendIcon" width="14" height="14" alt="" />
        </button>
      </div>
    </form>

    <p v-if="current && !current.threads.length">No comments yet.</p>
    <div ref="threadList" class="thread-list" @scroll="onDiscussionScroll">
      <details
        v-for="thread in orderedThreads"
        :key="thread.thread"
        :data-thread="thread.thread"
        :class="{ nearby: position !== undefined && Math.abs(thread.anchor - position) <= 2 }"
      >
        <summary @click="following = false">
          <time>{{ formatPlaybackTime(thread.anchor) }}</time>
          <small v-if="roots.get(thread.thread)?.context === 'LIVE'" class="live-tag">Live</small>
          <span class="thread-title">{{ roots.get(thread.thread)?.text }}</span>
        </summary>
        <DiscussionMessage v-if="roots.get(thread.thread)" :message="roots.get(thread.thread)!" :replies="replies" :participant-colors="participantColors">
          <template #reply="{ message }">
            <form v-if="replyingTo.get(entry) === message.message"
              class="reply-composer" @submit.prevent="post(entry, message.message)">
              <label>
                Reply to {{ message.name }}
                <span class="comment-editor">
                  <span aria-hidden="true" class="comment-measure">{{ (repliesDrafts.get(entry)?.get(message.message) ?? '') + ' ' }}</span>
                  <textarea
                    :value="repliesDrafts.get(entry)?.get(message.message) ?? ''"
                    :disabled="pending.has(entry)"
                    maxlength="4000"
                    rows="1"
                    @input="replyDraft(entry, message.message, ($event.target as HTMLTextAreaElement).value)"
                  />
                </span>
              </label>
              <div class="reply-actions">
                <button type="button" :disabled="pending.has(entry)" @click="replyingTo.delete(entry)">
                  Cancel
                </button>
                <button class="reply-icon" type="submit" aria-label="Send reply" title="Send reply"
                  :disabled="pending.has(entry) || !repliesDrafts.get(entry)?.get(message.message)?.trim()">
                  <img :src="sendIcon" width="14" height="14" alt="" />
                </button>
              </div>
            </form>
            <button v-else class="reply-button" type="button" :disabled="pending.has(entry)"
              :aria-label="`Reply to ${message.name}`" title="Reply" @click="replyingTo.set(entry, message.message)">
              Reply
            </button>
          </template>
        </DiscussionMessage>
      </details>
    </div>
  </section>
</template>

<style scoped>
.discussion {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 1rem;
}

header { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
.follow-button { display: inline-flex; align-items: center; gap: 0.35rem; }
.thread-list { max-height: clamp(14rem, 48dvh, 32rem); overflow-y: auto; min-height: 0; flex: 1; overscroll-behavior: contain; overflow-anchor: none; }
summary .live-tag { flex: none; }
summary time { flex: none; color: inherit; }

textarea {
  display: block;
  width: 100%;
  max-height: 10rem;
}

details { margin-block: 0.5rem; }
summary { display: flex; align-items: center; gap: 0.35rem; padding: 0.4rem 0.3rem; cursor: pointer; }
summary::before { content: "▸"; flex: none; }
details[open] > summary::before { content: "▾"; }
.thread-title { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
header button { color: var(--text); }
summary,
details > :deep(.message-tree > article:first-child) {
  position: relative;
  isolation: isolate;
  border: 1px solid transparent;
  border-radius: 0.55rem;
  transition: border-color 220ms ease;
}
details > :deep(.message-tree > article:first-child) { border-color: var(--line); }
summary::after,
details > :deep(.message-tree > article:first-child::after) {
  content: "";
  position: absolute;
  z-index: -1;
  inset: 0;
  border-radius: inherit;
  background: linear-gradient(110deg, #47391f, #4d3024 52%, #49301f);
  opacity: 0;
  pointer-events: none;
  transition: opacity 220ms ease;
}
.nearby > summary,
.nearby > :deep(.message-tree > article:first-child) { border-color: #a36f39; }
.nearby > summary::after,
.nearby > :deep(.message-tree > article:first-child::after) { opacity: 1; }
details[open] > summary { margin-bottom: 0.3rem; }
@media (prefers-reduced-motion: reduce) {
  summary, summary::after,
  details > :deep(.message-tree > article:first-child),
  details > :deep(.message-tree > article:first-child::after) { transition: none; }
}
/* A hidden copy gives the textarea its wrapped text height, including trailing newlines. */
.discussion > form { margin-block: 0.9rem 1rem; }
.comment-editor { margin-block-start: 0.45rem; display: grid; min-width: 0; }
.comment-editor > textarea,
.comment-measure {
  grid-area: 1 / 1; min-width: 0; max-height: none;
  padding: 0.4rem 0.5rem; border: 1px solid transparent;
  font: inherit; line-height: 1.4; white-space: pre-wrap; overflow-wrap: break-word;
}
.comment-editor > textarea { border-color: var(--outline); resize: none; overflow: hidden; }
.comment-measure { visibility: hidden; pointer-events: none; min-height: calc(1lh + 2.9rem + 2px); }
.reply-actions { display: flex; justify-content: flex-end; align-items: center; gap: 0.4rem; margin-top: 0.4rem; }
.discussion > form {
  position: relative;
}

.discussion > form > .reply-actions {
  position: absolute;
  inset-inline-end: 0.45rem;
  inset-block-end: 0.45rem;
  margin: 0;
}

.comment-editor > textarea,
.comment-measure {
  padding-block-end: 2.5rem;
}
.reply-actions button { font-size: 0.72rem; padding: 0.2rem 0.35rem; min-height: 1.65rem; }
.reply-button { flex: none; align-self: start; background: #39323a; border-color: transparent; color: var(--text); font-size: 0.75rem; padding: 0.15rem 0.3rem; }
.reply-icon { display: grid; place-items: center; margin-inline-start: auto; background: #39323a; border-color: transparent; padding: 0.3rem; }
.discussion .reply-icon:not(:disabled) { background: #343038; border-color: transparent; }
@media (hover: hover) {
  .discussion .reply-icon:not(:disabled):hover { background: #403944; border-color: transparent; box-shadow: -2px 0 5px #42c8e46b, 2px 0 5px #ec6dac73, 0 -1px 4px #8472ed60; }
}
@supports selector(details::details-content) and (interpolate-size: allow-keywords) {
  @media (prefers-reduced-motion: no-preference) {
    details::details-content {
      interpolate-size: allow-keywords;
      block-size: 0;
      opacity: 0;
      overflow: clip;
      transition: block-size 180ms ease, opacity 160ms ease, content-visibility 180ms allow-discrete;
    }
    details[open]::details-content { block-size: auto; opacity: 1; }
  }
}
.reply-composer {
  position: relative;
}

.reply-composer > .reply-actions {
  position: absolute;
  inset-inline: 0.45rem;
  inset-block-end: 0.45rem;
  justify-content: space-between;
  margin: 0;
}
</style>
