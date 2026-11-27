<script setup lang="ts">
import { parseDiscussionSummary, cleanSummaryText } from "../summary-format.ts";
import ScrollCues from "./ScrollCues.vue";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
const props = defineProps<{ room: string; participant: string; entry: string; revision?: number }>();
const emit = defineEmits<{ openThread: [thread: string]; seekVideo: [timestamp: number]; expanded: [boolean] }>();
const expanded = ref(false);
watch(expanded, value => emit("expanded", value));
const overviewBody = ref<HTMLElement>();
type Overview = { videoId: string; text: string; generatedAt: string };
type Enhancement = { videoOverview?: Overview; suggestedAnswers: { thread: string; text: string; timestamps: number[] }[]; generatedAt: string };
type Summary = { text?: string; referencedThreads?: string[]; generatedAt?: string; baselineId?: string; stale: boolean; staleReason?: "discussion" | "format"; enhanced: boolean; videoOverview?: Overview; enhancement?: Enhancement };
const summary = ref<Summary | null>(null);
const videoOverview = computed(() => summary.value?.videoOverview ?? summary.value?.enhancement?.videoOverview);
const threads = ref<{ thread: string; anchor: number }[]>([]);
const phase = ref<"discussion" | "video" | null>(null);
const busy = computed(() => phase.value !== null);
const error = ref("");
const needsGeneration = computed(() => !summary.value || summary.value.stale || !summary.value.text);
const canEnhance = computed(() => !!summary.value && !summary.value.stale && !!summary.value.baselineId && !summary.value.enhancement);
let token = 0;
let generation = 0;
let poll: ReturnType<typeof setInterval> | undefined;
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

type Answer = Enhancement["suggestedAnswers"][number];
const sectionData = computed(() => {
  const sections = parseDiscussionSummary(summary.value?.text ?? "", summary.value?.referencedThreads ?? [])
    .map(section => ({ ...section, items: section.items.map(item => ({ ...item, answers: [] as Answer[] })) }));
  const open = sections.find(section => section.title === "Still open")!;
  const answers = summary.value?.stale ? [] : summary.value?.enhancement?.suggestedAnswers ?? [];
  const unmatched: Answer[] = [];
  for (const answer of answers) {
    const question = open.items.find(item => item.references.includes(answer.thread));
    if (question) question.answers.push(answer);
    else unmatched.push(answer);
  }
  const cited = new Set([...sections.flatMap(section => section.items.flatMap(item => item.references)), ...answers.map(answer => answer.thread)]);
  return { sections, unmatched, remaining: (summary.value?.referencedThreads ?? []).filter(thread => !cited.has(thread)) };
});
const threadTime = (thread: string) => clock(threads.value.find(item => item.thread === thread)?.anchor ?? 0);

async function post(path: string, entry = props.entry, extra: object = {}) {
  const res = await fetch(`/api${path}`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ room: props.room, participant: props.participant, entry, ...extra }) });
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
    }
  }
  catch (e) { if (at === token) error.value = e instanceof Error ? e.message : String(e); }
}
function active(at: number, entry: string) { return at === generation && entry === props.entry; }
async function enhanceCurrent(at: number, entry: string) {
  const baseline = summary.value?.baselineId;
  if (!baseline || summary.value?.stale) return;
  phase.value = "video";
  const result = await post("/summary/enhance", entry, { expectedBaseline: baseline });
  if (active(at, entry)) { token++; summary.value = result.summary ?? null; }
}
async function generate() {
  if (busy.value) return;
  const entry = props.entry;
  const at = ++generation;
  token++; phase.value = "discussion"; error.value = "";
  try {
    const result = await post("/summary/request", entry);
    if (active(at, entry)) {
      token++; summary.value = result.summary ?? null;
    }
  } catch {
    if (active(at, entry)) {
      error.value = phase.value === "video"
        ? "The discussion overview is ready, but video enhancement failed. You can retry Enhance with video."
        : "Could not generate the discussion overview. Please try again.";
      await read();
    }
  } finally { if (active(at, entry)) phase.value = null; }
}
async function enhance() {
  if (busy.value) return;
  const entry = props.entry;
  const at = ++generation;
  token++; error.value = "";
  try { await enhanceCurrent(at, entry); }
  catch {
    if (active(at, entry)) {
      error.value = "Enhancement failed. Your discussion summary has been kept. Please try again.";
      await read();
    }
  } finally { if (active(at, entry)) phase.value = null; }
}
function openThread(thread: string) {
  const found = threads.value.find((item) => item.thread === thread);
  if (found) emit("openThread", found.thread);
}
watch(() => props.entry, () => { token++; generation++; phase.value = null; summary.value = null; threads.value = []; error.value = ""; void read(); });
watch(() => props.revision, () => {
  // Hide local changes immediately; the server rechecks all remote changes on read.
  if (summary.value) summary.value = { stale: true, enhanced: summary.value.enhanced, videoOverview: videoOverview.value };
  void read();
});
onMounted(() => { void read(); poll = setInterval(() => { void read(); }, 2000); });
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
    <button v-if="phase === 'discussion' || (!busy && needsGeneration)" class="generate-overview" type="button" :disabled="busy" @click="generate">{{ phase === 'video' ? 'Enhancing with video…' : phase === 'discussion' ? 'Generating…' : summary ? 'Regenerate overview' : 'Generate overview' }}</button>
    <button v-else-if="phase === 'video' || canEnhance" class="generate-overview enhance-action" type="button" :disabled="busy" @click="enhance">{{ phase === 'video' ? 'Enhancing with video…' : 'Enhance with video' }}</button>
    <p v-if="phase === 'video'" class="overview-empty" role="status">Reading the video for context and suggested answers…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <section v-if="videoOverview" class="summary-section video-overview">
      <h4>Video overview</h4>
      <p>{{ cleanSummaryText(videoOverview.text) }}</p>
    </section>
    <div v-if="summary && !summary.stale && summary.text" class="summary-card">
      <small>Generated {{ new Date(summary.generatedAt!).toLocaleString() }}</small>
      <div class="summary-content">
        <section v-for="section in sectionData.sections" :key="section.title" class="summary-section" :class="{ 'open-questions': section.title === 'Still open' }">
          <h4>{{ section.title }}</h4>
          <ul v-if="section.items.length">
            <li v-for="(item, index) in section.items" :key="index">
              <span>{{ item.text }}</span>
              <span class="inline-citations">
                <button v-for="thread in item.references" :key="thread" type="button" class="citation-link discussion-citation"
                  :aria-label="`Open thread at ${threadTime(thread)}`" @click="openThread(thread)">{{ threadTime(thread) }}</button>
              </span>
              <p v-for="(answer, answerIndex) in item.answers" :key="answerIndex" class="answer-addition">
                <small class="answer-label">Suggested answer</small>
                {{ cleanSummaryText(answer.text) }}
                <span class="inline-citations">
                  <button type="button" class="citation-link discussion-citation" :aria-label="`Open thread at ${threadTime(answer.thread)}`" @click="openThread(answer.thread)">{{ threadTime(answer.thread) }}</button>
                  <button v-for="time in answer.timestamps" :key="time" type="button" class="citation-link video-citation"
                    :aria-label="`Jump to video ${clock(time)}`" @click="emit('seekVideo', time)">{{ clock(time) }}</button>
                </span>
              </p>
            </li>
          </ul>
          <p v-else class="overview-empty">No additional discussion points.</p>
          <template v-if="section.title === 'Still open'">
            <p v-for="(answer, index) in sectionData.unmatched" :key="index" class="answer-addition">
              <small class="answer-label">Suggested answer</small>
              {{ cleanSummaryText(answer.text) }}
              <span class="inline-citations">
                <button type="button" class="citation-link discussion-citation" :aria-label="`Open thread at ${threadTime(answer.thread)}`" @click="openThread(answer.thread)">{{ threadTime(answer.thread) }}</button>
                <button v-for="time in answer.timestamps" :key="time" type="button" class="citation-link video-citation"
                  :aria-label="`Jump to video ${clock(time)}`" @click="emit('seekVideo', time)">{{ clock(time) }}</button>
              </span>
            </p>
          </template>
        </section>
      </div>
      <div v-if="sectionData.remaining.length" class="references" aria-label="Other discussion references">
        <button v-for="thread in sectionData.remaining" :key="thread" type="button" class="citation-link discussion-citation"
          :aria-label="`Open thread at ${threadTime(thread)}`" @click="openThread(thread)">{{ threadTime(thread) }}</button>
      </div>
      <small class="unverified-note">Answers are unverified. Open the original discussion to check them.</small>
    </div>
    <p v-else-if="summary?.stale" class="overview-empty stale-notice" role="status"><template v-if="summary.staleReason === 'format'">Regenerate overview to use the updated summary format.</template><template v-else>Discussion changed. Regenerate overview to see an updated recap{{ summary.enhanced ? ' and suggested answers' : '' }}.</template></p>
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

.overview-scroll { height: var(--overview-height, auto); max-height: var(--overview-height, clamp(7rem, 25dvh, 18rem)); }
.overview-body { min-height: 0; overflow-y: auto; overscroll-behavior: contain; scrollbar-gutter: stable; display: grid; gap: 0.65rem; }
.overview-body > p { margin: 0; }
.overview-body > p[role="alert"] { font-size: 0.8rem; line-height: 1.4; }
.summary-content { display: grid; gap: 1rem; min-width: 0; }
.summary-section h4 { margin: 0 0 0.45rem; font-size: 0.9rem; }
.summary-section p, .summary-section li { font-size: 0.875rem; line-height: 1.55; }
.summary-section ul { margin: 0; padding-inline-start: 1.2rem; display: grid; gap: 0.4rem; }
.summary-overview { margin: 0; }
.references { display: flex; flex-wrap: wrap; gap: 0.4rem; margin: 0; }
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
.video-overview { color: #a9ddf2; }
.video-overview p { margin: 0; white-space: pre-wrap; }
.summary-section .answer-addition { color: #a9ddf2; margin: 0.55rem 0 0; }
.answer-label { display: block; margin-bottom: 0.2rem; color: #93cde6; font-weight: 700; }
.inline-citations { display: inline; margin-inline-start: 0.25rem; }
.watch-page button.citation-link:not(.gradient-button) { display: inline-block; padding: 0 0.15rem; margin-inline-end: 0.2rem; background: transparent; border: 0; border-radius: 0.15rem; box-shadow: none; font-size: 0.75rem; line-height: 1.4; text-decoration: underline; text-underline-offset: 0.15rem; }
.watch-page button.discussion-citation:not(.gradient-button) { color: #efcc7f; }
.watch-page button.video-citation:not(.gradient-button) { color: #a9ddf2; }
.watch-page button.citation-link:not(.gradient-button):hover { background: transparent; box-shadow: none; color: #fff; }
</style>
