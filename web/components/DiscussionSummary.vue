<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
const props = defineProps<{ room: string; participant: string; entry: string; revision?: number }>();
const summary = ref<{ text: string; referencedThreads: string[]; generatedAt: string } | null>(null);
const busy = ref(false);
const error = ref("");
let token = 0;
async function post(path: string) {
  const res = await fetch(`/api${path}`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ room: props.room, participant: props.participant, entry: props.entry }) });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.message ?? data.error ?? "Summary unavailable");
  return data;
}
async function read() {
  const at = ++token;
  try { const result = await post("/summary/read"); if (at === token) summary.value = result.summary ?? null; }
  catch (e) { if (at === token) error.value = String(e); }
}
async function generate() {
  busy.value = true; error.value = "";
  try { const result = await post("/summary/request"); summary.value = result.summary ?? null; }
  catch (e) { error.value = String(e); }
  finally { busy.value = false; }
}
watch(() => props.entry, () => { token++; summary.value = null; error.value = ""; void read(); });
watch(() => props.revision, () => void read());
onMounted(() => void read());
onBeforeUnmount(() => { token++; });
</script>
<template>
  <div class="summary-panel">
    <h3 class="overview-heading">AI overview</h3>
    <button type="button" :disabled="busy" @click="generate">{{ busy ? 'Generating…' : summary ? 'Regenerate overview' : 'Generate overview' }}</button>
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-if="summary">
      <small>Generated {{ new Date(summary.generatedAt).toLocaleString() }}</small>
      <p class="summary-text">{{ summary.text }}</p>
      <small>Based on {{ summary.referencedThreads.length }} discussion threads. Visit the discussion panel to open the original messages.</small>
    </template>
    <p v-else>No AI overview yet. Add discussion comments, then generate one.</p>
  </div>
</template>
<style scoped>
.summary-panel { display:grid; gap:.65rem; padding:.65rem; }
.overview-heading { margin:0; font:700 clamp(1.45rem,2.5vw,2.1rem)/1.1 Arial,sans-serif; letter-spacing:-.06em; }
.summary-text { white-space:pre-wrap; overflow-wrap:anywhere; font-size:.9rem; line-height:1.5; }
small { opacity:.75; }
</style>
