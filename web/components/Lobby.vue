<script setup lang="ts">
import { computed, ref } from "vue";
import type { WatchPartyWireHttp } from "../../generated/wire.ts";

type Membership = WatchPartyWireHttp["/rooms/join"]["output"] & { code?: string };
type SavedRooms = WatchPartyWireHttp["/watch/history"]["output"]["rooms"];

const props = defineProps<{
  username?: string;
  page: "home" | "history";
  busy: boolean;
  savedRooms: SavedRooms;
}>();
const emit = defineEmits<{
  create: [name: string];
  join: [code: string, name?: string];
  reopen: [room: Membership["room"], entry?: SavedRooms[number]["watch"]["entries"][number]["entry"], joinLive?: boolean];
  addVideo: [SavedRooms[number]];
}>();

const ownerName = ref("");
const guestName = ref("");
const code = ref("");
const orderedRooms = computed(() => [...props.savedRooms].sort((left, right) => {
  const liveOrder = Number(right.watch.status === "LIVE") - Number(left.watch.status === "LIVE");
  const activity = (saved: SavedRooms[number]) => Date.parse(saved.watch.endedAt ?? saved.lastActivityAt);
  return liveOrder || activity(right) - activity(left);
}));
</script>

<template>
  <div class="lobby" :class="{ 'lobby-history': page === 'history' }">
    <template v-if="page === 'home'">
      <form class="home-card" @submit.prevent="emit('join', code, guestName.trim() || username)">
        <h2 id="join-room-heading" class="home-strip">Join a room</h2>
        <fieldset class="home-box" :disabled="busy" aria-labelledby="join-room-heading">
          <label>
            Room code
            <input v-model.trim="code" required autocapitalize="characters" spellcheck="false" />
          </label>
          <label>
            Your display name
            <input v-model="guestName" maxlength="32" />
            <small>{{ username ? "Defaults to your username." : "Required on your first join." }} Returning members keep their existing name.</small>
          </label>
          <button type="submit">Join room</button>
        </fieldset>
      </form>
      <form v-if="username" class="home-card" @submit.prevent="emit('create', ownerName.trim() || username)">
        <h2 id="create-room-heading" class="home-strip">Create a room</h2>
        <fieldset class="home-box" :disabled="busy" aria-labelledby="create-room-heading">
          <label>
            Owner display name
            <input v-model="ownerName" :placeholder="username" maxlength="32" />
          </label>
          <button type="submit">Create room</button>
        </fieldset>
      </form>
    </template>

    <section v-else aria-labelledby="rooms-heading" :aria-busy="busy">
      <h2 id="rooms-heading">Your Streams</h2>
      <p v-if="busy && !orderedRooms.length" role="status">Loading streams...</p>
      <p v-else-if="!orderedRooms.length">You have no saved rooms yet.</p>
      <ul v-else class="history">
        <li v-for="saved in orderedRooms" :key="saved.room" class="room-card">
          <div class="room-card-header">
            <strong v-if="saved.watch.status === 'LIVE'" class="live">Live now</strong>
            <span v-else-if="saved.watch.endedAt" class="ended">
              Ended <time :datetime="saved.watch.endedAt">{{ new Date(saved.watch.endedAt).toLocaleString() }}</time>
            </span>
            <span v-else>Not started</span>
            <span v-if="saved.owner" class="badge">Owner</span>
            <small v-if="saved.lastJoinedAt">
              Last joined <time :datetime="saved.lastJoinedAt">{{ new Date(saved.lastJoinedAt).toLocaleString() }}</time>
            </small>
            <div class="room-card-actions">
              <button v-if="saved.owner" type="button" :disabled="busy" @click="emit('addVideo', saved)">+ Add video</button>
              <button v-if="saved.watch.status === 'LIVE'" class="join-live" type="button" :disabled="busy"
                @click="emit('reopen', saved.room, undefined, true)">Join live</button>
              <button v-else-if="!saved.watch.entries.length || saved.watch.status === 'NOT_STARTED'" type="button"
                :disabled="busy" @click="emit('reopen', saved.room)">Open room</button>
            </div>
          </div>
          <ul class="videos">
            <li v-for="video in saved.watch.entries" :key="video.entry">
              <strong>{{ video.source.title || video.source.id }}</strong>
              <button class="watch-locally" type="button" :disabled="busy" @click="emit('reopen', saved.room, video.entry)">Watch locally</button>
            </li>
          </ul>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.lobby-history { margin-top: 2rem; }
form { min-width: 0; }
fieldset, label { display: grid; gap: 0.5rem; }
.room-card { border: 1px solid var(--line); border-radius: 0.6rem; padding: 1rem; }
.history, .videos { list-style: none; padding: 0; }
.history { max-width: 56rem; display: grid; gap: 0.75rem; }
.room-card { background: #fffaf3; }
.room-card-header, .videos li { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
.room-card-header { min-block-size: calc(2.35rem + 2px); padding-block-end: 0.55rem; box-sizing: content-box; }
.room-card-actions button { min-block-size: calc(2.35rem + 2px); line-height: 1.45; }
.room-card-header small { color: #584951; }
.join-live, .watch-locally { font-weight: 800; }
.room-card-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 0.4rem; margin-inline-start: auto; }
.join-live { background: var(--accent); color: white; border-color: white; }
.watch-locally { margin-inline-start: auto; background: linear-gradient(110deg, #d0dfe0, #ded5e7 38%, #e7d3dc 70%, #ecdacb); color: #171417; border-color: #171417; }
@media (hover: hover) {
  .join-live:not(:disabled):hover { border-color: white; }
  .watch-locally:not(:disabled):hover { border-color: #171417; box-shadow: 0 0 7px #62576c55; }
}
.videos li { justify-content: space-between; padding-block: 0.35rem; border-top: 1px solid var(--line); }
.live, .badge { background: var(--accent); color: white; padding: 0.2rem 0.45rem; border-radius: 0.25rem; }
.badge { background: #36303b; }
.ended { background: #9b4523; color: #fff; font-weight: 700; padding: 0.2rem 0.45rem; border-radius: 0.25rem; }
</style>
