<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
const props = defineProps<{ room: string; participant: string; entry: string; revision?: number }>();
const emit = defineEmits<{ openThread: [thread: string, anchor: number] }>();
const summary = ref<{ text: string; referencedThreads: string[]; generatedAt: string } | null>(null);
const threads = ref<{ thread: string; anchor: number }[]>([]);
const busy = ref(false);
const error = ref("");
let token = 0;
let poll: ReturnType<typeof setInterval> | undefined;
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
async function post(path: string) {
  const res = await fetch(`/api${path}`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ room: props.room, participant: props.participant, entry: props.entry }) });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.message ?? data.error ?? "Summary unavailable");
  return data;
}
async function read() {
  const at = ++token;
  try {
    const [result, discussion] = await Promise.all([post("/summary/read"), post("/discussion/threads")]);
    if (at === token) {
      summary.value = result.summary ?? null;
      threads.value = discussion.threads ?? [];
      error.value = "";
    }
  }
  catch (e) { if (at === token) error.value = String(e); }
}
async function generate() {
  busy.value = true; error.value = "";
  try { const result = await post("/summary/request"); summary.value = result.summary ?? null; }
  catch (e) { error.value = String(e); }
  finally { busy.value = false; }
}
function openThread(thread: string) {
  const found = threads.value.find((item) => item.thread === thread);
  if (found) emit("openThread", found.thread, found.anchor);
}
watch(() => props.entry, () => { token++; summary.value = null; threads.value = []; error.value = ""; void read(); });
watch(() => props.revision, () => void read());
onMounted(() => { void read(); poll = setInterval(() => { if (!busy.value) void read(); }, 10000); });
onBeforeUnmount(() => { token++; if (poll) clearInterval(poll); });
</script>
<template>
  <div class="summary-panel">
    <h3 class="overview-heading">AI overview</h3>
    <button type="button" :disabled="busy" @click="generate">{{ busy ? 'Generating…' : summary ? 'Regenerate overview' : 'Generate overview' }}</button>
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-if="summary">
      <small>Generated {{ new Date(summary.generatedAt).toLocaleString() }}</small>
      <p class="summary-text">{{ summary.text }}</p>
      <small>Answers are unverified. Open the original discussion to check them.</small>
      <ul class="references">
        <li v-for="thread in summary.referencedThreads" :key="thread">
          <button type="button" @click="openThread(thread)">
            Open thread at {{ clock(threads.find((item) => item.thread === thread)?.anchor ?? 0) }}
          </button>
        </li>
      </ul>
    </template>
    <p v-else>No AI overview yet. Add discussion comments, then generate one.</p>
  </div>
</template>
<style scoped>
.summary-panel { display:grid; gap:.65rem; padding:.65rem; }
.overview-heading { margin:0; font:700 clamp(1.45rem,2.5vw,2.1rem)/1.1 Arial,sans-serif; letter-spacing:-.06em; }
.summary-text { white-space:pre-wrap; overflow-wrap:anywhere; font-size:.9rem; line-height:1.5; }
small { opacity:.75; }
.references { list-style:none; margin:0; padding:0; display:grid; gap:.35rem; }
.references button { text-align:left; font-size:.82rem; }
</style>
