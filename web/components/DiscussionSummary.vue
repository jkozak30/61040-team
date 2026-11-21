<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { createHttpClient } from "@mit-sdg/sync-engine-http/client";
import type { WatchPartyWireHttp } from "../../generated/wire.ts";
import { formatPlaybackTime } from "../../src/playback-time.ts";

const api = createHttpClient<WatchPartyWireHttp>({ baseUrl: "/api" });
type Entry = WatchPartyWireHttp["/discussion/summary"]["input"]["entry"];
type Summary = WatchPartyWireHttp["/discussion/summary"]["output"]["summaries"][number]["summary"];
type Threads = WatchPartyWireHttp["/discussion/threads"]["output"]["threads"];
const props = defineProps<{ room: string; participant: string; entry: Entry; revision: number }>();
const emit = defineEmits<{ "open-thread": [string, number] }>();
const summary = ref<Summary>();
const threads = ref<Threads>([]);
const busy = ref(false);
const error = ref("");
let generation = 0;
let timer: number | undefined;

async function refresh() {
  const current = ++generation;
  const input = { room: props.room, participant: props.participant, entry: props.entry };
  try {
    const [saved, discussion] = await Promise.all([
      api.discussion.summary(input), api.discussion.threads(input),
    ]);
    if (current !== generation) return;
    if ("error" in saved || "error" in discussion) throw new Error("Could not load overview.");
    summary.value = saved.summaries[0]?.summary;
    threads.value = discussion.threads;
    error.value = "";
  } catch {
    if (current === generation) error.value = "Could not load the overview. Try again later.";
  }
}

watch(() => [props.entry, props.revision], () => {
  summary.value = undefined;
  threads.value = [];
  void refresh();
}, { immediate: true });
onMounted(() => { timer = window.setInterval(() => { if (!busy.value) void refresh(); }, 10_000); });
onBeforeUnmount(() => { window.clearInterval(timer); generation++; });

async function requestSummary() {
  if (busy.value || !threads.value.length) return;
  busy.value = true;
  error.value = "";
  try {
    const result = await api.discussion.summarize({ room: props.room, participant: props.participant, entry: props.entry });
    if ("error" in result) throw new Error(result.error);
    if (result.failed) error.value = "Could not generate an overview. The previous one is still here.";
    else summary.value = result.summaries[0]?.summary;
  } catch {
    error.value = "Could not generate an overview. Try again later.";
  } finally { busy.value = false; }
}

function openThread(thread: string) {
  const found = threads.value.find((candidate) => candidate.thread === thread);
  if (found) emit("open-thread", thread, found.anchor);
}
</script>

<template>
  <div class="overview">
    <h3 class="overview-heading">
      <svg class="overview-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor"
        stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="m6 3 5 5-5 5" />
      </svg>
      AI overview
    </h3>
    <div class="overview-body">
      <p v-if="!threads.length">Add a comment to request an overview.</p>
      <p v-if="summary" class="summary-text">{{ summary.content }}</p>
      <p v-if="summary" class="summary-note">Generated {{ new Date(summary.generatedAt).toLocaleString() }}. Answers are unverified; check the original discussion.</p>
      <ul v-if="summary?.referencedItems.length" class="references">
        <li v-for="thread in summary.referencedItems" :key="thread">
          <button type="button" @click="openThread(thread)">
            Open thread at {{ formatPlaybackTime(threads.find((item) => item.thread === thread)?.anchor ?? 0) }}
          </button>
        </li>
      </ul>
      <p v-if="error" role="status">{{ error }}</p>
      <button type="button" :disabled="busy || !threads.length" @click="requestSummary">
        {{ busy ? "Generating..." : summary ? "Refresh overview" : "Generate overview" }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.overview-heading { display: flex; align-items: center; gap: 0.25rem; list-style: none; margin: 0; padding: 0 0.3rem; background: #79675d; color: var(--surface); font: 700 clamp(1.6rem, 2.5vw, 2.25rem)/0.95 Arial, sans-serif; letter-spacing: -0.08em; }
.overview-chevron { flex: none; width: 0.72em; height: 0.72em; }
.overview-body { padding: 0.8rem 1rem 1rem; }
.overview-body p { margin: 0 0 0.7rem; }
.summary-text { white-space: pre-wrap; overflow-wrap: anywhere; }
.summary-note { font-size: 0.75rem; color: #c8b9c4; }
.references { list-style: none; padding: 0; margin: 0 0 0.8rem; }
.references li + li { margin-top: 0.4rem; }
.references button { text-align: left; font-size: 0.8rem; }
</style>
