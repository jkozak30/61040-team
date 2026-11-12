<script setup lang="ts">
import { participantColor } from "../participant-color.ts";
import type { WatchPartyWireHttp } from "../../generated/wire.ts";

type Message = WatchPartyWireHttp["/discussion/read"]["output"]["discussion"]["messages"][number];

defineProps<{
  message: Message;
  replies: ReadonlyMap<Message["message"], Message[]>;
  participantColors: ReadonlyMap<string, string>;
}>();

defineSlots<{ reply(props: { message: Message }): unknown }>();
</script>

<template>
  <div class="message-tree">
    <article>
      <p class="message-meta"><strong :style="{ color: participantColor(message.author, participantColors) }">{{ message.name }}</strong>
        <small v-if="message.context === 'LIVE'" class="live-tag">Live</small>
        <small v-else class="historical">Historical</small>
      </p>
      <div class="message-row">
        <p class="message-text">{{ message.text }}</p>
        <slot name="reply" :message="message" />
      </div>
    </article>
    <ul v-if="replies.get(message.message)?.length">
      <li v-for="child in replies.get(message.message)" :key="child.message">
        <DiscussionMessage :message="child" :replies="replies" :participant-colors="participantColors">
          <template #reply="slotProps"><slot name="reply" v-bind="slotProps" /></template>
        </DiscussionMessage>
      </li>
    </ul>
  </div>
</template>

<style scoped>
article { background: var(--raised); border: 1px solid var(--line); border-radius: 0.55rem; padding: 0.65rem; }
.message-meta { display: flex; flex-wrap: wrap; gap: 0.35rem; align-items: baseline; margin: 0; overflow-wrap: anywhere; }
.message-meta strong { font-family: var(--participant-font); font-weight: 600; }
.message-meta .historical { color: #c8b9c4; }
.message-row {
  display: grid;
  gap: 0.4rem;
  margin-top: 0.4rem;
}
.message-row > :deep(.reply-button) {
  justify-self: end;
}
.message-row :deep(form) { flex: 1 0 100%; min-width: 0; margin-top: 0.35rem; }
.message-text {
  flex: 1;
  min-width: 0;
  margin: 0;
  color: #d4c8cf;
  font-size: 0.875rem;
  font-weight: 400;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

ul { list-style: none; margin: 0 0 0 0.65rem; padding: 0 0 0 0.75rem; border-inline-start: 1px solid var(--outline); }
li { position: relative; padding-top: 0.45rem; }
li::before { content: ""; position: absolute; inset-inline-start: -0.75rem; top: 1.3rem; width: 0.75rem; border-top: 1px solid var(--outline); }
</style>
