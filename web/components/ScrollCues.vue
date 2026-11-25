<script setup lang="ts">
import { ref, watch } from "vue";
const props = defineProps<{ target?: HTMLElement; label: string; tone?: "warm"; contentSelector?: string }>();
const above = ref(false);
const below = ref(false);
function step(direction: number) {
  props.target?.scrollBy({ top: direction * props.target.clientHeight * 0.75, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
}
watch(() => props.target, (target, _, cleanup) => {
  if (!target) return;
  let frame = 0;
  const update = () => {
    // Ignore alignment spacers, padding, and margins: only real content counts.
    const content = [...target.querySelectorAll<HTMLElement>(props.contentSelector ?? ":scope > *")]
      .filter(element => element.getClientRects().length && element.getBoundingClientRect().height > 0);
    const viewport = target.getBoundingClientRect();
    const top = viewport.top + target.clientTop;
    const bottom = top + target.clientHeight;
    above.value = content.some(element => element.getBoundingClientRect().top < top - 3);
    below.value = content.some(element => element.getBoundingClientRect().bottom > bottom + 3);
  };
  const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); };
  const observer = new ResizeObserver(schedule);
  const observe = () => { observer.disconnect(); observer.observe(target); for (const child of target.children) observer.observe(child); schedule(); };
  const mutations = new MutationObserver(observe);
  mutations.observe(target, { subtree: true, childList: true, characterData: true, attributes: true });
  target.addEventListener('scroll', schedule, { passive: true });
  observe();
  cleanup(() => { cancelAnimationFrame(frame); observer.disconnect(); mutations.disconnect(); target.removeEventListener('scroll', schedule); });
}, { immediate: true, flush: 'post' });
</script>
<template>
  <div class="scroll-cues" :class="{ warm: tone === 'warm' }">
    <div class="cue-strip top" :class="{ available: above }">
      <button type="button" :disabled="!above" :tabindex="above ? 0 : -1" :aria-label="`Scroll ${label} up`" @click="step(-1)">
        <svg viewBox="0 0 16 10" aria-hidden="true"><path d="m3 7 5-4 5 4" /></svg>
      </button>
    </div>
    <slot />
    <div class="cue-strip bottom" :class="{ available: below }">
      <button type="button" :disabled="!below" :tabindex="below ? 0 : -1" :aria-label="`Scroll ${label} down`" @click="step(1)">
        <svg viewBox="0 0 16 10" aria-hidden="true"><path d="m3 3 5 4 5-4" /></svg>
      </button>
    </div>
  </div>
</template>
<style scoped>
.scroll-cues { --cue-rgb: 135, 125, 137; --cue-ink: #eee5ee; background: var(--surface); display: flex; flex-direction: column; min-height: 0; min-width: 0; }
.cue-strip { height: 0; flex: none; opacity: 0; pointer-events: none; transition: opacity 180ms ease; }
.cue-strip.available { height: 0.85rem; opacity: 1; pointer-events: auto; }
.warm { --cue-rgb: 218, 174, 87; --cue-ink: #ffe3a5; background: linear-gradient(115deg, #322d21, #2d241e 62%, #28221d); }
/* A glow that dissolves on every edge, in its own row outside the content. */
.cue-strip { background: radial-gradient(ellipse at center, rgba(var(--cue-rgb), 0.28) 0%, rgba(var(--cue-rgb), 0.12) 40%, rgba(var(--cue-rgb), 0) 75%); }
.watch-page .cue-strip button:not(.gradient-button) { display: flex; align-items: center; justify-content: center; padding: 0; width: 100%; height: 100%; min-height: 0; background: transparent; border: 0; box-shadow: none; color: var(--cue-ink); }
svg { width: 1rem; height: 0.7rem; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
@media (prefers-reduced-motion: reduce) { .cue-strip { transition: none; } }
</style>
