<script lang="ts">
  let {
    value,
    oncommit,
    placeholder = '',
    type = 'text',
  }: {
    value: string;
    oncommit: (v: string) => void;
    placeholder?: string;
    type?: 'text' | 'number' | 'date';
  } = $props();
</script>

<input
  {type}
  class="sf-input"
  {value}
  {placeholder}
  oninput={(e) => oncommit((e.currentTarget as HTMLInputElement).value)}
/>
