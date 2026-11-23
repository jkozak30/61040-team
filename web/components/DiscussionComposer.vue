<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { formatPlaybackTime } from "../../src/playback-time.ts";
import sendIcon from "../assets/paper-plane.svg";

const props = defineProps<{
  room: string;
  participant: string;
  entry: string;
  connection: string;
  live: boolean;
  position?: number;
  getPosition: () => number | undefined;
}>();
const emit = defineEmits<{ activity: []; posted: [result: { entry: string; thread: string; message: string }] }>();
const drafts = reactive(new Map<string, string>());
const draft = computed({
  get: () => drafts.get(props.entry) ?? "",
  set: (text: string) => drafts.set(props.entry, text),
});
const posting = ref(false);
const error = ref("");
async function post() {
  const entry = props.entry;
  const text = draft.value.trim();
  const anchor = props.getPosition();
  if (posting.value || !text || text.length > 2000 || anchor === undefined || !Number.isFinite(anchor)) return;
  posting.value = true;
  error.value = "";
  try {
    const response = await fetch("/api/discussion/start-thread", {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        room: props.room, participant: props.participant, entry, anchor: Math.max(0, anchor),
        text, mode: props.live ? "LIVE" : "HISTORICAL", connection: props.connection,
      }),
    });
    const result = await response.json();
    if (!response.ok || result.error) throw new Error(result.message ?? result.error ?? "Could not post.");
    if ((drafts.get(entry) ?? "").trim() === text) drafts.delete(entry);
    emit("posted", { entry, thread: result.thread, message: result.message });
  } catch (cause) {
    error.value = String(cause);
  } finally { posting.value = false; }
}
</script>

<template>
  <section class="new-discussion" aria-labelledby="new-comment-heading"
    @pointerdown.capture="emit('activity')" @pointerup.capture="emit('activity')"
    @pointermove.capture="$event.buttons && emit('activity')" @click.capture="emit('activity')"
    @keydown.capture="emit('activity')" @input.capture="emit('activity')"
    @wheel.capture.passive="emit('activity')">
    <h3 id="new-comment-heading">New comment<span v-if="position !== undefined"> ({{ formatPlaybackTime(position) }})</span></h3>
    <form class="comment-composer" @submit.prevent="post">
      <label class="comment-editor">
        <span class="visually-hidden">New comment</span>
        <span aria-hidden="true" class="comment-measure">{{ draft + ' ' }}</span>
        <textarea v-model="draft" rows="2" maxlength="2000" :disabled="posting" />
      </label>
      <button class="reply-icon" type="submit" aria-label="Post comment" title="Post comment"
        :disabled="posting || !draft.trim() || position === undefined">
        <img :src="sendIcon" width="14" height="14" alt="" />
      </button>
    </form>
    <p v-if="error" role="alert">{{ error }}</p>
  </section>
</template>

<style scoped>
.new-discussion { min-width: 0; }
.new-discussion > h3 { margin: 0 0 0.65rem; font: 500 1rem/1.4 var(--display); letter-spacing: normal; }
h3 span { font-variant-numeric: tabular-nums; }
.comment-composer { position: relative; margin: 0; }
.comment-editor { display: grid; min-width: 0; }
.comment-editor > textarea, .comment-measure {
  grid-area: 1 / 1;
  min-width: 0;
  min-height: calc(2.8em + 0.8rem + 2px);
  padding: 0.4rem 2.6rem 0.4rem 0.5rem;
  border: 1px solid var(--outline);
  border-radius: 0.25rem;
  font: inherit;
  line-height: 1.4;
  white-space: pre-wrap;
  overflow-wrap: break-word;
}
.comment-editor > textarea { width: 100%; resize: none; overflow: hidden; background: var(--raised); color: var(--text); }
.comment-measure { visibility: hidden; pointer-events: none; max-height: 14rem; }
.reply-icon { position: absolute; inset-inline-end: 0.45rem; inset-block-end: 0.45rem; display: grid; place-items: center; min-height: 1.65rem; padding: 0.3rem; background: #39323a; border-color: transparent; }
p { margin-bottom: 0; font-size: 0.8rem; }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
</style>
