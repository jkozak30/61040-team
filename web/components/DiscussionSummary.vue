<script setup lang="ts">
import ScrollCues from "./ScrollCues.vue";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
const props = defineProps<{ room: string; participant: string; entry: string; revision?: number }>();
const emit = defineEmits<{ openThread: [thread: string, anchor: number] }>();
const expanded = ref(false);
const overviewBody = ref<HTMLElement>();
const summary = ref<{ text: string; referencedThreads: string[]; generatedAt: string } | null>(null);
const threads = ref<{ thread: string; anchor: number }[]>([]);
const busy = ref(false);
const error = ref("");
let token = 0;
let generation = 0;
let poll: ReturnType<typeof setInterval> | undefined;
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

const summarySections = computed(() => {
  const text = summary.value?.text ?? "";
  const sections: { title: string; items: string[] }[] = [];
  const headings = [
    "Overview",
    "Questions raised",
    "What the discussion covered",
    "Still open",
  ];

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    const heading = line
      .replace(/^#{1,6}\s*/, "")
      .replace(/\*\*/g, "")
      .replace(/:$/, "")
      .trim();

    if (headings.includes(heading)) {
      sections.push({ title: heading, items: [] });
      continue;
    }

    if (!sections.length) {
      sections.push({ title: "Overview", items: [] });
    }

    const cleaned = line
      .replace(/\[([^\[\]\s]+)\]/g, (match, id) => summary.value?.referencedThreads.includes(id) ? "" : match)
      .replace(/^\s*[-*]\s+/, "")
      .replace(/\*\*/g, "")
      .trim();

    if (cleaned) {
      sections[sections.length - 1].items.push(cleaned);
    }
  }

  return sections;
});

async function post(path: string, entry = props.entry) {
  const res = await fetch(`/api${path}`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ room: props.room, participant: props.participant, entry }) });
  const data = await res.json();
  if (!res.ok || data.error) {
    const message = data.error === "CONFLICT"
      ? "The overview could not be generated. Please try again."
      : data.error === "FORBIDDEN" ? "You no longer have access to this discussion." : "Could not reach the overview service. Try again.";
    throw new Error(message);
  }
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
  catch (e) { if (at === token) error.value = e instanceof Error ? e.message : String(e); }
}
async function generate() {
  const entry = props.entry;
  const at = ++generation;
  busy.value = true; error.value = "";
  try {
    const result = await post("/summary/request", entry);
    if (at === generation && entry === props.entry) {
      token++;
      summary.value = result.summary ?? null;
    }
  }
  catch (e) { if (at === generation && entry === props.entry) error.value = e instanceof Error ? e.message : String(e); }
  finally { if (at === generation) busy.value = false; }
}
function openThread(thread: string) {
  const found = threads.value.find((item) => item.thread === thread);
  if (found) emit("openThread", found.thread, found.anchor);
}
watch(() => props.entry, () => { token++; generation++; busy.value = false; summary.value = null; threads.value = []; error.value = ""; void read(); });
watch(() => props.revision, () => void read());
onMounted(() => { void read(); poll = setInterval(() => { if (!busy.value) void read(); }, 10000); });
onBeforeUnmount(() => { token++; generation++; if (poll) clearInterval(poll); });
</script>
<template>
  <section class="summary-panel">
    <button type="button" class="overview-toggle" :aria-expanded="expanded" @click="expanded = !expanded">
      <svg class="overview-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor"
        stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="m6 3 5 5-5 5" />
      </svg>
      AI overview
    </button>
    <div class="overview-collapse" :class="{ expanded }" :inert="!expanded">
      <div class="overview-clip"><ScrollCues class="overview-scroll" :target="overviewBody" tone="warm" label="AI overview"><div ref="overviewBody" class="overview-body" tabindex="0" aria-label="AI overview content">
    <button class="generate-overview" type="button" :disabled="busy" @click="generate">{{ busy ? 'Generating…' : summary ? 'Regenerate overview' : 'Generate overview' }}</button>
    <p v-if="error" role="alert">{{ error }}</p>
    <div v-if="summary" class="summary-card">
      <small>Generated {{ new Date(summary.generatedAt).toLocaleString() }}</small>
      
<div class="summary-content">
  <section
    v-for="section in summarySections"
    :key="section.title"
    class="summary-section"
  >
    <h4>{{ section.title }}</h4>

    <p
      v-if="section.title === 'Overview'"
      class="summary-overview"
    >
      {{ section.items.join(" ") }}
    </p>

    <ul v-else>
      <li v-for="(item, index) in section.items" :key="index">
        {{ item }}
      </li>
    </ul>
  </section>
</div>

      <small>Answers are unverified. Open the original discussion to check them.</small>
      <ul class="references">
        <li v-for="thread in summary.referencedThreads" :key="thread">
          <button type="button" @click="openThread(thread)">
            Open thread at {{ clock(threads.find((item) => item.thread === thread)?.anchor ?? 0) }}
          </button>
        </li>
      </ul>
    </div>
    <p v-else class="overview-empty">No AI overview yet. Add discussion comments, then generate one.</p>
      </div></ScrollCues></div>
    </div>
  </section>
</template>
<style scoped>

.overview-toggle {
  cursor: pointer;
  width: 100%;
  border: 0;
  border-radius: 0;
  text-align: left;
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


.overview-chevron { flex: none; width: 0.72em; height: 0.72em; transition: transform 160ms ease; }
.overview-toggle[aria-expanded="true"] .overview-chevron { transform: rotate(90deg); }
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

.overview-scroll { max-height: clamp(7rem, 25dvh, 18rem); }
.overview-body { min-height: 0; overflow-y: auto; overscroll-behavior: contain; scrollbar-gutter: stable; display: grid; gap: 0.65rem; }
.overview-body > p { margin: 0; }
.summary-content { display: grid; gap: 1rem; min-width: 0; }
.summary-section h4 { margin: 0 0 0.45rem; font-size: 0.9rem; }
.summary-section p, .summary-section li { font-size: 0.875rem; line-height: 1.55; }
.summary-section ul { margin: 0; padding-inline-start: 1.2rem; display: grid; gap: 0.4rem; }
.summary-overview { margin: 0; }
.references { list-style: none; margin: 0; padding: 0.6rem 0 0; border-top: 1px solid #796044; display: grid; gap: 0.35rem; }
.references button { text-align: left; font-size: 0.8rem; }
small { font-size: 0.7rem; opacity: 0.85; }
.watch-page .overview-toggle:not(.gradient-button) { box-shadow: none; }
.overview-collapse { display: grid; grid-template-rows: 0fr; opacity: 0; transition: grid-template-rows 220ms ease, opacity 180ms ease; }
.overview-collapse.expanded { grid-template-rows: 1fr; opacity: 1; }
.overview-clip { min-height: 0; overflow: hidden; }
@media (prefers-reduced-motion: reduce) { .overview-collapse { transition: none; } }
.overview-toggle { transition: color 160ms ease; }
/* Override the watch page's generic white hover text on this heading. */
.watch-page button.overview-toggle:not(.gradient-button):not(:disabled):hover {
  background: #79675d;
  color: #50494a;
  border-color: transparent;
  box-shadow: none;
}
.summary-section {
  padding: 0.75rem;
  background: var(--raised);
  border: 1px solid var(--outline);
  border-radius: 0.4rem;
  box-shadow: 0 0 2px #ffffff52, 0 0 6px #ffffff24;
}
.summary-card {
  min-width: 0;
  padding: 0;
  display: grid;
  gap: 0.65rem;
  color: #fff;
}
.overview-body .overview-empty { font-size: 0.8rem; line-height: 1.4; }
.watch-page button.generate-overview:not(.gradient-button) {
  background: linear-gradient(110deg, #82652e, #815039 52%, #79552f);
  color: #fff;
  border: 1px solid #fff;
  font-weight: 800;
  box-shadow: 0 0 2px #ffffff52, 0 0 6px #ffffff24;
}
.watch-page button.generate-overview:not(.gradient-button):not(:disabled):hover {
  background: linear-gradient(110deg, #957538, #955e42 52%, #8b6338);
  color: #fff;
  border-color: #fff;
}
</style>
