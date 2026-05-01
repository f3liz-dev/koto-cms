<script lang="ts">
  import { slide } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import type { Snippet } from 'svelte';
  import { evaluateCondition, type ConditionalRule } from '../schema';

  let {
    rule,
    values,
    children,
  }: {
    rule: ConditionalRule | undefined;
    values: Record<string, unknown>;
    children: Snippet;
  } = $props();

  const visible = $derived(rule ? evaluateCondition(rule, values) : true);
</script>

{#if visible}
  <div transition:slide={{ duration: 150, easing: cubicOut }}>
    {@render children()}
  </div>
{/if}
