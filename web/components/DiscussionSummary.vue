<script setup lang="ts">
import { computed, ref } from "vue";
import { createHttpClient } from "@mit-sdg/sync-engine-http/client";
import type { WatchPartyWireHttp } from "../../generated/wire.ts";

type Read = WatchPartyWireHttp["/summaries/read"];
const props = defineProps<{
  room: Read["input"]["room"];
  participant: Read["input"]["participant"];
  entry: Read["input"]["entry"];
  discussionRevision?: number;
}>();

const api = createHttpClient<WatchPartyWireHttp>({ baseUrl: "/api" });
const summary = ref<Read["output"]["summary"]>();
const readRevision = ref(0);
const reading = ref(false);
const generating = ref(false);
const error = ref("");
const revision = computed(() => Math.max(readRevision.value, props.discussionRevision ?? 0));
const legacy = computed(() => !!summary.value && summary.value.format !== "lecture-insights-v5");
const stale = computed(() => !!summary.value && summary.value.sourceRevision < revision.value);
const canRefresh = computed(() => legacy.value || stale.value);

function entryInput() {
  return { room: props.room, participant: props.participant, entry: props.entry };
}

async function readSummary() {
  if (reading.value || generating.value) return;
  reading.value = true;
  error.value = "";
  try {
    const result = await api.summaries.read(entryInput());
    if ("error" in result) throw new Error(result.error);
    summary.value = result.summary;
    readRevision.value = result.currentRevision;
  } catch {
    error.value = "Could not load the saved summary.";
  } finally {
    reading.value = false;
  }
}

async function summarize() {
  if (reading.value || generating.value || summary.value === undefined || revision.value === 0 ||
      (summary.value && !canRefresh.value)) return;
  generating.value = true;
  error.value = "";
  try {
    const result = await api.summaries.summarize(entryInput());
    if ("error" in result) throw new Error(result.error);
    summary.value = result.summary;
  } catch {
    error.value = "Could not generate a summary. Try again.";
  } finally {
    generating.value = false;
  }
}

function onToggle(event: Event) {
  if ((event.currentTarget as HTMLDetailsElement).open && summary.value === undefined) void readSummary();
}
</script>

<template>
  <details @toggle="onToggle">
    <summary>
      <svg class="overview-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor"
        stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="m6 3 5 5-5 5" />
      </svg>
      AI overview
    </summary>
    <div class="overview-body" :aria-busy="reading || generating">
      <p v-if="summary === undefined && !error" role="status">Loading summary...</p>
      <p v-if="generating" role="status">Generating summary...</p>
      <p v-if="error" role="alert">{{ error }}</p>
      <button v-if="error && summary === undefined" type="button" @click="readSummary">Retry loading</button>
      <template v-if="summary">
        <p v-if="summary.content.overview">{{ summary.content.overview }}</p>
        <ul v-if="summary.content.insights.length">
          <li v-for="(insight, index) in summary.content.insights" :key="index">{{ insight }}</li>
        </ul>
        <p v-else>No substantive takeaways yet.</p>
        <p v-if="legacy" role="status">Refresh to get a key-insights recap.</p>
        <p v-else-if="stale" role="status">New messages since this summary was generated.</p>
      </template>
      <p v-else-if="summary === null && revision === 0">Add a comment before generating a summary.</p>
      <button
        v-if="summary !== undefined && revision > 0 && (!summary || canRefresh)"
        type="button"
        :disabled="reading || generating"
        @click="summarize"
      >
        {{ summary ? "Refresh summary" : "Generate summary" }}
      </button>
    </div>
  </details>
</template>

<style scoped>
summary {
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.25rem;
  list-style: none;
  margin: 0;
  padding: 0 0.3rem;
  background: #79675d;
  color: var(--surface);
  font: 700 clamp(1.6rem, 2.5vw, 2.25rem)/0.95 Arial, sans-serif;
  letter-spacing: -0.08em;
}

summary::-webkit-details-marker { display: none; }
.overview-chevron { flex: none; width: 0.72em; height: 0.72em; transition: transform 160ms ease; }
details[open] .overview-chevron { transform: rotate(90deg); }
.overview-body {
  padding: 0.75rem 1rem;
  background: linear-gradient(115deg, #322d21, #2d241e 62%, #28221d);
  color: #efbd8c;
  overflow-wrap: anywhere;
}
.overview-body p:first-child, .overview-body ul:first-child { margin-top: 0; }
.overview-body p:last-child, .overview-body ul:last-child { margin-bottom: 0; }
@media (prefers-reduced-motion: reduce) {
  .overview-chevron { transition: none; }
}
</style>
