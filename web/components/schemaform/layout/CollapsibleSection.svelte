<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    label,
    collapsed = false,
    children,
  }: {
    label: string;
    collapsed?: boolean;
    children: Snippet;
  } = $props();
</script>

<details class="sf-collapsible" open={!collapsed}>
  <summary class="sf-collapsible-summary">{label}</summary>
  <div class="sf-collapsible-body">
    {@render children()}
  </div>
</details>
