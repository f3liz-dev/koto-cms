<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    label = 'Advanced',
    children,
  }: {
    label?: string;
    children: Snippet;
  } = $props();
</script>

<details class="sf-disclosure">
  <summary class="sf-disclosure-summary">{label} ▸</summary>
  <div class="sf-disclosure-body">
    {@render children()}
  </div>
</details>
