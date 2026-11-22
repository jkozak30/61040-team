<script setup lang="ts">
import { nextTick, onMounted, onBeforeUnmount, ref, watch } from "vue";
import sendIcon from "../assets/paper-plane.svg";

type Message = { message: string; parent: string | null; author: string; name: string; text: string; context: "LIVE" | "HISTORICAL"; postedAt: string; editedAt?: string; deletedAt?: string };
type Thread = { thread: string; anchor: number; messages: Message[] };
const props = defineProps<{ room: string; participant: string; entry: string; connection: string; position: number; live: boolean; focusRequest?: { thread: string; id: number } }>();
const emit = defineEmits<{ seek: [number] ; changed: [] }>();
const threads = ref<Thread[]>([]);
const draft = ref("");
const replies = ref<Record<string, string>>({});
const busy = ref(false);
const error = ref("");
const root = ref<HTMLElement>();
const deleteDialog = ref<HTMLDialogElement>();
const deleting = ref<Message>();
const editing = ref<string>();
const editDraft = ref("");
let poll: ReturnType<typeof setInterval> | undefined;
let version = 0;
let lastFocus = 0;
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
const posted = (date: string) => new Date(date).toLocaleString();
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
  const selected = props.entry;
  const token = ++version;
  try {
    const response = await request("/discussion/threads", { room: props.room, participant: props.participant, entry: selected });
    if (version === token && selected === props.entry) threads.value = response.threads ?? [];
  } catch (cause) { if (version === token) error.value = String(cause); }
}
async function post(parent?: string) {
  const text = parent ? replies.value[parent] ?? "" : draft.value;
  if (!text.trim() || text.trim().length > 2000 || busy.value) return;
  busy.value = true; error.value = "";
  const base = { room: props.room, participant: props.participant, text, mode: props.live ? "LIVE" : "HISTORICAL", connection: props.connection };
  try {
    if (parent) await request("/discussion/reply", { ...base, parent });
    else await request("/discussion/start-thread", { ...base, entry: props.entry, anchor: Math.max(0, props.position) });
    if (parent) replies.value[parent] = "";
    else draft.value = "";
    await refresh(); emit("changed");
  } catch (cause) { error.value = String(cause); }
  finally { busy.value = false; }
}
function beginEdit(message: Message) {
  editing.value = message.message;
  editDraft.value = message.text;
}
async function saveEdit(message: Message) {
  if (busy.value || !editDraft.value.trim() || editDraft.value.trim().length > 2000) return;
  busy.value = true; error.value = "";
  try {
    await request("/discussion/edit-message", { room: props.room, participant: props.participant, message: message.message, text: editDraft.value });
    editing.value = undefined;
    await refresh(); emit("changed");
  } catch (cause) { error.value = String(cause); }
  finally { busy.value = false; }
}
function askDelete(message: Message) {
  deleting.value = message;
  deleteDialog.value?.showModal();
}
async function deleteMessage() {
  const message = deleting.value;
  deleteDialog.value?.close();
  deleting.value = undefined;
  if (!message || busy.value) return;
  busy.value = true; error.value = "";
  try {
    await request("/discussion/delete-message", { room: props.room, participant: props.participant, message: message.message });
    if (editing.value === message.message) editing.value = undefined;
    await refresh(); emit("changed");
  } catch (cause) { error.value = String(cause); }
  finally { busy.value = false; }
}
watch(() => props.entry, () => { version++; threads.value = []; draft.value = ""; replies.value = {}; editing.value = undefined; deleting.value = undefined; deleteDialog.value?.close(); error.value = ""; void refresh(); });
watch([() => props.focusRequest, threads], async ([focus]) => {
  if (!focus || focus.id === lastFocus) return;
  await nextTick();
  const target = root.value?.querySelector(`[data-thread="${focus.thread}"]`);
  if (target) { target.scrollIntoView({ block: "nearest" }); lastFocus = focus.id; }
});
onMounted(() => { void refresh(); poll = setInterval(() => void refresh(), 3500); });
onBeforeUnmount(() => { version++; if (poll) clearInterval(poll); });
</script>

<template>
  <section ref="root" aria-label="Discussion" class="discussion">
    <header><h3>Discussion</h3><small>Comments are saved with video timestamps.</small></header>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
    <div class="comment-composer">
      <label>New comment at {{ clock(position) }}
        <span class="comment-editor"><textarea v-model="draft" rows="2" maxlength="2000" placeholder="Ask a question or share an observation" /></span>
      </label>
      <div class="reply-actions">
        <button class="reply-icon" type="button" aria-label="Post comment" :disabled="busy || !draft.trim()" @click="post()">
          <img :src="sendIcon" width="14" height="14" alt="" />
        </button>
      </div>
    </div>
    <p v-if="!threads.length">No discussion for this video yet. Start a thread at the current timestamp.</p>
    <ol v-else class="threads">
      <li v-for="thread in threads" :key="thread.thread" class="thread" :data-thread="thread.thread"
        :class="{ focused: focusRequest?.thread === thread.thread }">
        <button type="button" class="timestamp" @click="emit('seek', thread.anchor)">{{ clock(thread.anchor) }} · Jump to video</button>
        <ol class="messages">
          <li v-for="message in thread.messages" :key="message.message" :class="{ reply: message.parent !== null }">
            <div class="message-meta"><strong>{{ message.name }}</strong><small>{{ message.context === 'LIVE' ? 'Live' : 'Review' }} · {{ posted(message.postedAt) }}{{ message.editedAt && !message.deletedAt ? ' · Edited' : '' }}</small></div>
            <p v-if="message.deletedAt" class="deleted">Comment deleted.</p>
            <template v-else-if="editing === message.message">
              <label class="reply-field">Edit comment
                <textarea v-model="editDraft" rows="2" maxlength="2000" />
              </label>
              <button type="button" :disabled="busy || !editDraft.trim()" @click="saveEdit(message)">Save</button>
              <button type="button" :disabled="busy" @click="editing = undefined">Cancel</button>
            </template>
            <p v-else>{{ message.text }}</p>
            <div v-if="message.author === participant && !message.deletedAt && editing !== message.message" class="message-actions">
              <button type="button" :disabled="busy" @click="beginEdit(message)">Edit</button>
              <button type="button" :disabled="busy" @click="askDelete(message)">Delete</button>
            </div>
            <label class="reply-field">Reply to {{ message.deletedAt ? 'thread' : message.name }}
              <input v-model="replies[message.message]" maxlength="2000" placeholder="Write a reply" @keydown.enter.prevent="post(message.message)" />
            </label>
            <button type="button" :disabled="busy || !replies[message.message]?.trim()" @click="post(message.message)">Reply</button>
          </li>
        </ol>
      </li>
    </ol>
    <dialog ref="deleteDialog" aria-labelledby="delete-comment-heading" @cancel="deleting = undefined">
      <h4 id="delete-comment-heading">Delete comment?</h4>
      <p>Your comment will be removed. Replies will stay in the thread.</p>
      <button type="button" @click="deleteDialog?.close(); deleting = undefined">Cancel</button>
      <button type="button" @click="deleteMessage">Delete comment</button>
    </dialog>
  </section>
</template>
<style scoped>
.discussion { display:flex; flex-direction:column; min-height:0; padding:1rem; gap:.5rem; }
header { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:.5rem; }
.comment-composer { position:relative; margin-block:.65rem 1rem; }
.comment-editor { display:block; margin-block-start:.45rem; }
.comment-editor textarea { display:block; width:100%; min-height:5rem; padding:.5rem .6rem 2rem; border:1px solid var(--outline); background:var(--surface); color:inherit; font:inherit; resize:vertical; }
.reply-actions { position:absolute; right:.45rem; bottom:.45rem; }
.reply-icon { display:grid; place-items:center; padding:.4rem; background:#39323a; }
.threads,.messages { list-style:none; margin:0; padding:0; display:grid; gap:.75rem; }
.thread { padding:.6rem; border:1px solid var(--line); border-radius:.35rem; }
.thread.focused { border-color:var(--accent); }
.timestamp { margin-bottom:.6rem; font-size:.83rem; }
.messages > li { padding:.5rem; background:var(--raised); }
.messages > li.reply { margin-left:1rem; border-left:2px solid var(--outline); }
.message-meta { display:flex; flex-wrap:wrap; justify-content:space-between; gap:.4rem; }
.message-meta small { opacity:.7; }
.messages p { margin:.45rem 0; white-space:pre-wrap; overflow-wrap:anywhere; }
.messages p.deleted { opacity:.65; font-style:italic; }
.message-actions { display:flex; gap:.5rem; margin-bottom:.5rem; }
.reply-field { display:grid; gap:.25rem; font-size:.8rem; }
.reply-field input,.reply-field textarea { width:100%; padding:.35rem; font:inherit; }
.discussion dialog { max-width:min(24rem,calc(100vw - 2rem)); padding:1rem; border:1px solid var(--outline); border-radius:.4rem; background:var(--surface); color:inherit; }
.discussion dialog::backdrop { background:#0009; }
.discussion dialog h4 { margin:0 0 .5rem; }
.discussion dialog p { margin:0 0 1rem; }
.discussion dialog button + button { margin-left:.5rem; }
.error { color:#ee8787; }
</style>
