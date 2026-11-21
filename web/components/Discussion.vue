<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { createHttpClient } from "@mit-sdg/sync-engine-http/client";
import type { WatchPartyWireHttp } from "../../generated/wire.ts";
import { formatPlaybackTime } from "../../src/playback-time.ts";
import sendIcon from "../assets/paper-plane.svg";

const api = createHttpClient<WatchPartyWireHttp>({ baseUrl: "/api" });
type Entry = WatchPartyWireHttp["/discussion/threads"]["input"]["entry"];
type Threads = WatchPartyWireHttp["/discussion/threads"]["output"]["threads"];

const props = defineProps<{
  room: string;
  participant: string;
  entry: Entry;
  position: number;
  mode: "LIVE" | "HISTORICAL";
  connection: string;
  focusThread?: string;
}>();
const emit = defineEmits<{ posted: []; "open-at": [number] }>();
const threads = ref<Threads>([]);
const draft = ref("");
const replyDraft = ref("");
const replyTo = ref<string>();
const busy = ref(false);
const error = ref("");
const loading = ref(false);
const root = ref<HTMLElement>();
let timer: number | undefined;
let generation = 0;

async function refresh() {
  const entry = props.entry;
  const current = ++generation;
  try {
    const result = await api.discussion.threads({ room: props.room, participant: props.participant, entry });
    if (current !== generation) return;
    if ("error" in result) throw new Error(result.error);
    threads.value = result.threads;
    error.value = "";
  } catch {
    if (current === generation) error.value = "Could not load the discussion. Retrying...";
  } finally {
    if (current === generation) loading.value = false;
  }
}

async function focus(thread: string) {
  await nextTick();
  root.value?.querySelector(`[data-thread="${thread}"]`)?.scrollIntoView({ block: "nearest" });
}

watch(() => props.entry, () => {
  threads.value = [];
  draft.value = "";
  replyTo.value = undefined;
  loading.value = true;
  void refresh();
}, { immediate: true });
watch(() => props.focusThread, (thread) => { if (thread) void focus(thread); });
onMounted(() => { timer = window.setInterval(() => { if (!busy.value) void refresh(); }, 5000); });
onBeforeUnmount(() => { window.clearInterval(timer); generation++; });

async function postThread() {
  const text = draft.value.trim();
  if (!text || text.length > 2000 || busy.value) return;
  busy.value = true;
  try {
    const result = await api.discussion["start-thread"]({
      room: props.room, participant: props.participant, entry: props.entry,
      anchor: Math.max(0, props.position), text, mode: props.mode, connection: props.connection,
    });
    if ("error" in result) throw new Error(result.error);
    draft.value = "";
    await refresh();
    emit("posted");
  } catch {
    error.value = "Could not post the comment. Check the watch and try again.";
  } finally { busy.value = false; }
}

async function postReply() {
  const text = replyDraft.value.trim();
  const parent = replyTo.value;
  if (!parent || !text || text.length > 2000 || busy.value) return;
  busy.value = true;
  try {
    const result = await api.discussion.reply({
      room: props.room, participant: props.participant, parent, text,
      mode: props.mode, connection: props.connection,
    });
    if ("error" in result) throw new Error(result.error);
    replyDraft.value = "";
    replyTo.value = undefined;
    await refresh();
    emit("posted");
  } catch {
    error.value = "Could not post the reply. Check the watch and try again.";
  } finally { busy.value = false; }
}
</script>

<template>
  <section ref="root" aria-label="Discussion" class="discussion">
    <header><h3>Discussion</h3><small>{{ mode === "LIVE" ? "Live watch" : "Local review" }}</small></header>
    <form class="comment-composer" @submit.prevent="postThread">
      <label>
        New comment at {{ formatPlaybackTime(position) }}
        <span class="comment-editor"><textarea v-model="draft" rows="2" maxlength="2000" /></span>
      </label>
      <div class="reply-actions">
        <button class="reply-icon" type="submit" aria-label="Post comment" :disabled="busy || !draft.trim()">
          <img :src="sendIcon" width="14" height="14" alt="" />
        </button>
      </div>
    </form>
    <p v-if="error" role="status">{{ error }}</p>
    <p v-if="loading" role="status">Loading discussion...</p>
    <p v-else-if="!threads.length">No comments on this video yet.</p>
    <ol v-else class="threads">
      <li v-for="thread in threads" :key="thread.thread" :data-thread="thread.thread"
        :class="{ focused: thread.thread === focusThread }">
        <button class="timestamp" type="button" :aria-label="`Open video at ${formatPlaybackTime(thread.anchor)}`"
          @click="emit('open-at', thread.anchor)">{{ formatPlaybackTime(thread.anchor) }}</button>
        <ol class="messages">
          <li v-for="message in thread.messages" :key="message.message" :class="{ reply: !!message.parent }">
            <div class="message-meta"><strong>{{ message.name }}</strong>
              <small>{{ message.context === "LIVE" ? "Live" : "Review" }} · {{ new Date(message.postedAt).toLocaleString() }}</small>
            </div>
            <p>{{ message.text }}</p>
            <button type="button" @click="replyTo = message.message; replyDraft = ''">Reply</button>
            <form v-if="replyTo === message.message" class="reply-form" @submit.prevent="postReply">
              <label>Reply to {{ message.name }}<textarea v-model="replyDraft" rows="2" maxlength="2000" /></label>
              <button type="submit" :disabled="busy || !replyDraft.trim()">Post reply</button>
              <button type="button" @click="replyTo = undefined">Cancel</button>
            </form>
          </li>
        </ol>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.discussion { display: flex; flex-direction: column; min-height: 0; padding: 1rem; }
header { display: flex; align-items: baseline; justify-content: space-between; gap: 0.5rem; }
header small { color: #c8b9c4; }
.comment-composer { position: relative; margin-block: 0.9rem 1rem; }
.comment-editor { display: block; margin-block-start: 0.45rem; }
textarea { display: block; width: 100%; min-height: 4rem; padding: 0.4rem 0.5rem; border: 1px solid var(--outline); font: inherit; line-height: 1.4; resize: vertical; }
.comment-editor > textarea { padding-bottom: 2.5rem; }
.reply-actions { position: absolute; inset-inline-end: 0.45rem; inset-block-end: 0.45rem; }
.reply-icon { display: grid; place-items: center; min-height: 1.65rem; padding: 0.3rem; background: #39323a; border-color: transparent; }
.threads, .messages { list-style: none; margin: 0; padding: 0; }
.threads { display: grid; gap: 1.2rem; overflow-y: auto; }
.threads > li { padding: 0.7rem; border: 1px solid var(--line); border-radius: 0.4rem; }
.threads > li.focused { border-color: var(--accent); }
.timestamp { margin-bottom: 0.5rem; font-variant-numeric: tabular-nums; }
.messages { display: grid; gap: 0.65rem; }
.messages > li { padding-top: 0.5rem; border-top: 1px solid var(--line); }
.messages > li.reply { margin-left: 1rem; padding-left: 0.65rem; border-left: 2px solid var(--outline); }
.message-meta { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.4rem; }
.message-meta small { color: #c8b9c4; }
.messages p { margin: 0.3rem 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.messages button { font-size: 0.75rem; }
.reply-form { display: flex; flex-wrap: wrap; align-items: end; gap: 0.4rem; margin-top: 0.5rem; }
.reply-form label { width: 100%; }
.reply-form textarea { margin-top: 0.3rem; }
</style>
