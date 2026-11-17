<script setup lang="ts">
import { ref } from "vue";

const props = defineProps<{ busy: boolean; savingVisit: boolean }>();
const emit = defineEmits<{
  submit: [credentials: { username: string; password: string }, creating: boolean];
  clearError: [];
}>();

const creating = ref(false);
const username = ref("");
const password = ref("");

function submit() {
  if (props.busy) return;
  emit("submit", { username: username.value.trim(), password: password.value }, creating.value);
  password.value = "";
}

function switchMode() {
  creating.value = !creating.value;
  password.value = "";
  emit("clearError");
}
</script>

<template>
  <form class="home-card login-form" @submit.prevent="submit">
    <h2 id="login-form-heading" class="home-strip">
      <span :key="creating ? 'create' : 'signin'" class="login-mode-title">
        {{ creating ? "Create account" : "Sign in" }}
      </span>
    </h2>

    <fieldset class="home-box" :disabled="busy" aria-labelledby="login-form-heading">
      <p v-if="savingVisit">
        Sign in or create an account to save this room to your history.
      </p>

      <label>
        Username
        <input v-model="username" autocomplete="username" autocapitalize="off" required />
      </label>

      <label>
        Password
        <input
          v-model="password"
          type="password"
          :autocomplete="creating ? 'new-password' : 'current-password'"
          required
        />
      </label>

      <p v-if="creating">
        Use 3–32 letters, digits, underscores, or hyphens for the username
        and 10–128 characters for the password.
      </p>

      <button type="submit">{{ creating ? "Create account" : "Sign in" }}</button>
      <button type="button" @click="switchMode">
        {{ creating ? "Use an existing account" : "Create an account" }}
      </button>
      <slot />
    </fieldset>
  </form>
</template>

<style scoped>
.login-form {
  width: 100%;
  margin: 0.9rem 0 0;
}

.login-form fieldset {
  display: grid;
  gap: 0.75rem;
  margin: 0;
}

.login-form p {
  margin: 0;
}

.login-form label {
  display: grid;
  gap: 0.25rem;
}
.login-mode-title {
  display: inline-block;
  animation: login-mode-in 160ms ease-out;
}

@keyframes login-mode-in {
  from { opacity: 0; transform: translateY(3px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (prefers-reduced-motion: reduce) {
  .login-mode-title { animation: none; }
}
</style>
