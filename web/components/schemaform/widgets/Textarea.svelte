<script lang="ts">
  let {
    value,
    oncommit,
    placeholder = '',
    rows = 3,
  }: {
    value: string;
    oncommit: (v: string) => void;
    placeholder?: string;
    rows?: number;
  } = $props();
</script>

<textarea
  class="sf-input sf-textarea"
  {value}
  {placeholder}
  {rows}
  oninput={(e) => oncommit((e.currentTarget as HTMLTextAreaElement).value)}
></textarea>
