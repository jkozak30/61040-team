<script setup lang="ts">
import sendIcon from "../assets/paper-plane.svg";
</script>

<template>
  <section aria-label="Discussion" class="discussion">
    <header><h3>Discussion</h3></header>
    <div class="comment-composer">
      <label>
        New comment
        <span class="comment-editor">
          <textarea disabled rows="1" />
        </span>
      </label>
      <div class="reply-actions">
        <button class="reply-icon" type="button" aria-label="Post comment" disabled>
          <img :src="sendIcon" width="14" height="14" alt="" />
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.discussion {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 1rem;
}

header { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }

.comment-composer {
  position: relative;
  margin-block: 0.9rem 1rem;
}

.comment-editor { display: block; margin-block-start: 0.45rem; }
.comment-editor > textarea {
  display: block;
  width: 100%;
  min-height: calc(1lh + 2.9rem + 2px);
  padding: 0.4rem 0.5rem 2.5rem;
  border: 1px solid var(--outline);
  font: inherit;
  line-height: 1.4;
  resize: none;
}

.reply-actions {
  position: absolute;
  inset-inline-end: 0.45rem;
  inset-block-end: 0.45rem;
}

.reply-icon {
  display: grid;
  place-items: center;
  min-height: 1.65rem;
  padding: 0.3rem;
  background: #39323a;
  border-color: transparent;
}
</style>
