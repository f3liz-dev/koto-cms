<script lang="ts">
  let {
    locales,
    activeLocale,
    onSwitch,
  }: {
    locales: string[];
    activeLocale: string | null;
    onSwitch: (locale: string) => void;
  } = $props();
</script>

{#if locales && locales.length >= 2}
  <div class="locale-tabs">
    {#each locales as locale (locale)}
      <button
        class="locale-tab{locale === activeLocale ? ' active' : ''}"
        onclick={() => onSwitch(locale)}
      >
        {locale}
      </button>
    {/each}
  </div>
{/if}
