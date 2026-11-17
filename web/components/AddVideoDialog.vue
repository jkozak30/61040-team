<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { closeDialog } from "../dialog-motion.ts";
import { loadYouTube, parseVideoId, type YouTubePlayer } from "../youtube-player.ts";

const props = defineProps<{ save: (videoId: string, previewTitle?: string) => Promise<void> }>();
const emit = defineEmits<{ close: [] }>();
const dialog = ref<HTMLDialogElement>();
const videoInput = ref("");
const candidateId = ref<string>();
const previewHost = ref<HTMLElement>();
const previewPlayed = ref(false);
const previewError = ref("");
const error = ref("");
const saving = ref(false);
let previewPlayer: YouTubePlayer | undefined;
let previewGeneration = 0;

function previewVideo() {
  const id = parseVideoId(videoInput.value);
  error.value = "";
  if (!id) {
    error.value = "Enter a YouTube link or an 11-character video ID.";
    return;
  }
  candidateId.value = id;
}

function clearPreview() {
  candidateId.value = undefined;
  previewPlayed.value = false;
  previewError.value = "";
}

watch([candidateId, previewHost], async ([id, host]) => {
  const generation = ++previewGeneration;
  previewPlayer?.destroy();
  previewPlayer = undefined;
  previewPlayed.value = false;
  previewError.value = "";
  if (!id || !host) return;

  try {
    const youtube = await loadYouTube();
    if (generation !== previewGeneration) return;
    const element = document.createElement("div");
    host.replaceChildren(element);
    previewPlayer = new youtube.Player(element, {
      videoId: id,
      playerVars: { controls: 0, disablekb: 1, playsinline: 1, origin: window.location.origin },
      events: {
        onReady: () => {},
        onStateChange: ({ data }) => {
          if (generation === previewGeneration && data === 1 && !previewError.value) {
            previewPlayed.value = true;
          }
        },
        onError: () => {
          if (generation !== previewGeneration) return;
          previewPlayed.value = false;
          previewError.value = "This video could not play in the embedded player.";
        },
        onAutoplayBlocked: () => {},
      },
    });
  } catch {
    if (generation === previewGeneration) previewError.value = "Could not load the YouTube preview.";
  }
}, { flush: "post" });

async function addVideo() {
  if (!candidateId.value || !previewPlayed.value || previewError.value || saving.value) return;
  saving.value = true;
  error.value = "";
  try {
    await props.save(candidateId.value, previewPlayer?.getVideoData?.()?.title?.trim().slice(0, 200));
    await dismiss();
  } catch {
    error.value = "Could not add the video. Check that you still own this room and try again.";
  } finally {
    saving.value = false;
  }
}

async function dismiss() {
  if (await closeDialog(dialog.value)) emit("close");
}

onMounted(() => dialog.value?.showModal());
onBeforeUnmount(() => {
  previewGeneration++;
  previewPlayer?.destroy();
});
</script>

<template>
  <dialog ref="dialog" class="add-video-dialog watch-dialog" aria-labelledby="add-video-heading" @cancel.prevent="!saving && dismiss()">
    <h2 id="add-video-heading" class="watch-dialog-title">Add video</h2>
    <div class="watch-dialog-body">
      <form v-show="!candidateId" @submit.prevent="previewVideo">
        <label>YouTube link or video ID <input v-model="videoInput" required /></label>
        <div class="watch-dialog-actions">
          <button type="button" :disabled="saving" @click="dismiss()">Cancel</button>
          <button class="gradient-button" type="submit">Preview video</button>
        </div>
      </form>
      <div v-show="candidateId">
        <p>Play the preview to check it before adding it.</p>
        <div ref="previewHost" class="preview" />
        <p v-if="previewError" role="alert">{{ previewError }}</p>
        <div class="watch-dialog-actions">
          <button type="button" :disabled="saving" @click="dismiss()">Cancel</button>
          <button type="button" :disabled="saving" @click="clearPreview">Choose another</button>
          <button type="button" :class="{ 'gradient-button': previewPlayed && !previewError }"
            :disabled="saving || !previewPlayed || !!previewError" @click="addVideo">Add video</button>
        </div>
      </div>
      <p v-if="error" role="alert">{{ error }}</p>
    </div>
  </dialog>
</template>

<style scoped>
form, label { display: grid; gap: 0.5rem; }
.preview { aspect-ratio: 16 / 9; background: #141414; margin-bottom: 0.75rem; }
.preview :deep(iframe) { width: 100%; height: 100%; border: 0; }
</style>
