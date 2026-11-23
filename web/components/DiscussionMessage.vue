<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { formatPlaybackTime } from "../../src/playback-time.ts";
import { participantColor } from "../participant-color.ts";
import type { DiscussionMessage as Message } from "../discussion-types.ts";
import sendIcon from "../assets/paper-plane.svg";

const props = defineProps<{
  message: Message;
  replies: ReadonlyMap<string, Message[]>;
  participant: string;
  participantColors: ReadonlyMap<string, string>;
  busy: boolean;
  anchor: number;
  selectedMessage?: string;
}>();
const emit = defineEmits<{
  seek: [position: number];
  reply: [parent: string, text: string];
  edit: [message: Message, text: string];
  delete: [message: Message];
}>();
const replying = ref(false);
const replyDraft = ref("");
const editing = ref(false);
const editDraft = ref("");
const originalText = ref("");
const editor = ref<HTMLTextAreaElement>();
const replyEditor = ref<HTMLTextAreaElement>();
let replyCountBeforePost = 0;
let submittedReply: string | undefined;
const editChanged = computed(() => editDraft.value.trim() !== originalText.value.trim());

async function beginEdit() {
  originalText.value = props.message.text;
  editDraft.value = originalText.value;
  replying.value = false;
  editing.value = true;
  await nextTick();
  editor.value?.focus();
}
function cancelEdit() {
  editing.value = false;
  editDraft.value = "";
  originalText.value = "";
}
async function beginReply() {
  replying.value = true;
  await nextTick();
  replyEditor.value?.focus();
}
function saveEdit() {
  const text = editDraft.value.trim();
  if (!props.busy && text && text.length <= 2000 && editChanged.value) emit("edit", props.message, text);
}
function sendReply() {
  const text = replyDraft.value.trim();
  if (!props.busy && text && text.length <= 2000) {
    replyCountBeforePost = props.replies.get(props.message.message)?.length ?? 0;
    submittedReply = text;
    emit("reply", props.message.message, text);
  }
}
watch(() => props.message.text, () => {
  if (editing.value && props.message.text === editDraft.value.trim()) cancelEdit();
});
watch(() => props.busy, (busy, wasBusy) => {
  if (busy || !wasBusy) return;
  // Clear a submitted reply only when it appears in the refreshed thread.
  const children = props.replies.get(props.message.message) ?? [];
  if (submittedReply && children.length > replyCountBeforePost && children.some((message) =>
    message.author === props.participant && message.text === submittedReply)) {
    replyDraft.value = "";
    replying.value = false;
  }
  submittedReply = undefined;
});
watch(() => props.message.deletedAt, (deleted) => {
  if (deleted) cancelEdit();
});
</script>

<template>
  <div class="message-tree">
    <article :data-message="message.message" :class="{ selected: selectedMessage === message.message }">
      <p class="message-meta">
        <strong v-if="!message.deletedAt" :style="{ color: participantColor(message.author, participantColors) }">{{ message.name }}</strong>
        <small v-if="!message.deletedAt && message.context === 'LIVE'" class="live-tag">Live</small>
        <small v-else-if="!message.deletedAt" class="historical-tag">Historical</small>
        <small v-if="message.editedAt && !message.deletedAt" class="edited-tag">Edited</small>
        <button v-if="message.parent === null" type="button" class="gradient-button jump-button" @click="emit('seek', anchor)">Jump to {{ formatPlaybackTime(anchor) }}</button>
      </p>
      <div class="message-row">
        <p v-if="message.deletedAt" class="message-text deleted">Comment deleted.</p>
        <form v-else-if="editing" class="edit-composer" @submit.prevent="saveEdit">
          <label>Edit comment
            <textarea ref="editor" v-model="editDraft" rows="2" maxlength="2000" :disabled="busy" />
          </label>
          <div class="message-actions">
            <button type="button" :disabled="busy" @click="cancelEdit">Cancel</button>
            <button type="submit" :disabled="busy || !editDraft.trim() || !editChanged">Save</button>
          </div>
        </form>
        <p v-else class="message-text">{{ message.text }}</p>
        <div v-if="!editing" class="message-actions">
          <template v-if="message.author === participant && !message.deletedAt">
            <button type="button" :disabled="busy" @click="beginEdit">Edit</button>
            <button type="button" :disabled="busy" @click="emit('delete', message)">Delete</button>
          </template>
          <button v-if="!replying" type="button" :disabled="busy" @click="beginReply">Reply</button>
        </div>
        <form v-if="replying && !editing" class="reply-composer" @submit.prevent="sendReply">
          <label>Reply to {{ message.deletedAt ? 'thread' : message.name }}
            <textarea ref="replyEditor" v-model="replyDraft" rows="2" maxlength="2000" :disabled="busy" />
          </label>
          <div class="message-actions">
            <button type="button" :disabled="busy" @click="replying = false">Cancel</button>
            <button class="reply-icon" type="submit" aria-label="Send reply" :disabled="busy || !replyDraft.trim()">
              <img :src="sendIcon" width="14" height="14" alt="" />
            </button>
          </div>
        </form>
      </div>
    </article>
    <ul v-if="replies.get(message.message)?.length">
      <li v-for="child in replies.get(message.message)" :key="child.message">
        <DiscussionMessage :message="child" :replies="replies" :participant="participant"
          :participant-colors="participantColors" :busy="busy" :selected-message="selectedMessage" :anchor="anchor"
          @seek="emit('seek', $event)" @reply="(parent, text) => emit('reply', parent, text)"
          @edit="(message, text) => emit('edit', message, text)"
          @delete="emit('delete', $event)" />
      </li>
    </ul>
  </div>
</template>

<style scoped>
article {
  position: relative; isolation: isolate;
  background: var(--raised);
  border: 1px solid var(--line);
  border-radius: 0.55rem;
  padding: 0.65rem;
  transition: background-color 600ms ease, border-color 600ms ease, box-shadow 600ms ease;
}
article::before { content: ""; position: absolute; inset: 0; z-index: -1; border-radius: inherit; background: linear-gradient(110deg, #47391f, #4d3024 52%, #49301f); opacity: var(--message-highlight, 0); transition: opacity 600ms ease; pointer-events: none; }
article.selected { --message-highlight: 1; border-color: #c99554; box-shadow: 0 0 0 1px #c9955455; }
.message-meta { display: flex; flex-wrap: wrap; gap: 0.35rem; align-items: baseline; margin: 0; overflow-wrap: anywhere; }
.message-meta strong { font-family: var(--participant-font); font-weight: 600; }
.historical-tag, .edited-tag { padding: 0.1rem 0.3rem; border-radius: 0.25rem; font-size: 0.68rem; line-height: 1.3; }
.historical-tag { background: #39313d; color: #dbccdf; }
.edited-tag { background: #453729; color: #e9c49a; }
.jump-button { margin-inline-start: auto; font-size: 0.7rem; padding: 0.2rem 0.35rem; }
.message-row { display: grid; gap: 0.4rem; margin-top: 0.4rem; min-width: 0; }
.message-text { margin: 0; color: #d4c8cf; font-size: 0.875rem; font-weight: 400; white-space: pre-wrap; overflow-wrap: anywhere; }
.deleted { opacity: 0.65; font-style: italic; }
.message-actions { display: flex; flex-wrap: wrap; justify-content: end; gap: 0.4rem; }
.message-actions button { font-size: 0.75rem; padding: 0.15rem 0.3rem; }
.message-actions .reply-icon { display: grid; place-items: center; padding: 0.3rem; background: #39323a; }
form, label { display: grid; gap: 0.4rem; min-width: 0; margin: 0; }
label { font-size: 0.8rem; }
textarea { width: 100%; min-width: 0; font: inherit; resize: vertical; }
ul { list-style: none; margin: 0 0 0 0.65rem; padding: 0 0 0 0.75rem; border-inline-start: 1px solid var(--outline); }
li { position: relative; padding-top: 0.45rem; }
li::before { content: ""; position: absolute; inset-inline-start: -0.75rem; top: 1.3rem; width: 0.75rem; border-top: 1px solid var(--outline); }
@media (max-width: 600px) {
  ul { margin-inline-start: 0.3rem; padding-inline-start: 0.5rem; }
  li::before { inset-inline-start: -0.5rem; width: 0.5rem; }
}
@media (prefers-reduced-motion: reduce) { article, article::before { transition: none; } }
</style>
