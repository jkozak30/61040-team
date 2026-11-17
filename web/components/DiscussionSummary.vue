<template>
  <h3 class="overview-heading">
    <svg class="overview-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor"
      stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="m6 3 5 5-5 5" />
    </svg>
    AI overview
  </h3>
</template>

<style scoped>
.overview-heading {
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

.overview-chevron { flex: none; width: 0.72em; height: 0.72em; }
</style>
