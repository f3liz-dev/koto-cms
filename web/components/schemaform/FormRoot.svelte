<script lang="ts">
  import { parse as yamlParse, stringify as yamlStringify } from 'yaml';
  import type { FieldEntry, FieldSchema } from './schema';
  import { resolveWidget } from './resolve';
  import { stringOf, boolOf, numberOf, dateOf, arrayOf } from './coerce';

  import Toggle from './widgets/Toggle.svelte';
  import TextInput from './widgets/TextInput.svelte';
  import Textarea from './widgets/Textarea.svelte';
  import Slider from './widgets/Slider.svelte';
  import Stepper from './widgets/Stepper.svelte';
  import PillSelect from './widgets/PillSelect.svelte';
  import SearchSelect from './widgets/SearchSelect.svelte';
  import DatePicker from './widgets/DatePicker.svelte';
  import TagChips from './widgets/TagChips.svelte';

  import ConditionalField from './layout/ConditionalField.svelte';
  import DisclosureGroup from './layout/DisclosureGroup.svelte';
  import RawToggle from './layout/RawToggle.svelte';

  let {
    yamlText,
    fields,
    onChange,
    key = '',
  }: {
    yamlText: string;
    fields: FieldEntry[];
    onChange: (next: string) => void;
    key?: string;
  } = $props();

  type ParseResult =
    | { ok: true; value: Record<string, unknown> }
    | { ok: false; error: string };

  const parsed: ParseResult = $derived.by(() => {
    if (!yamlText.trim()) return { ok: true, value: {} };
    try {
      const doc = yamlParse(yamlText) as unknown;
      if (doc && typeof doc === 'object' && !Array.isArray(doc)) {
        return { ok: true, value: doc as Record<string, unknown> };
      }
      return { ok: false, error: 'Frontmatter must be a mapping' };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  let values = $state<Record<string, unknown>>({});

  $effect(() => {
    key;
    if (parsed.ok) values = { ...parsed.value };
  });

  let showRaw = $state(false);

  const useTypedForm = $derived(!showRaw && fields.length > 0 && parsed.ok);

  const mainFields = $derived(fields.filter((f) => f.schema.ui?.group !== 'advanced'));
  const advancedFields = $derived(fields.filter((f) => f.schema.ui?.group === 'advanced'));

  function setField(name: string, value: unknown) {
    const next = { ...values };
    if (value === undefined || value === null || value === '') {
      delete next[name];
    } else {
      next[name] = value;
    }
    values = next;
    onChange(yamlStringify(next).trimEnd());
  }

  function onRawInput(e: Event) {
    onChange((e.currentTarget as HTMLTextAreaElement).value);
  }

  function widgetFor(schema: FieldSchema) {
    return resolveWidget(schema);
  }
</script>

{#snippet renderField(entry: FieldEntry)}
  {@const schema = entry.schema}
  {@const name = entry.name}
  {@const widget = widgetFor(schema)}
  {@const raw = values[name]}
  <ConditionalField rule={schema.showWhen} {values}>
    <label class="sf-field">
      <span class="sf-field-label">
        {schema.label ?? name}
        {#if schema.required}<span class="sf-field-req">*</span>{/if}
      </span>
      {#if widget === 'toggle'}
        <Toggle value={boolOf(raw)} oncommit={(v) => setField(name, v)} />
      {:else if widget === 'textarea'}
        <Textarea
          value={stringOf(raw)}
          placeholder={schema.ui?.placeholder ?? ''}
          rows={schema.ui?.rows ?? 3}
          oncommit={(v) => setField(name, v)}
        />
      {:else if widget === 'slider'}
        <Slider
          value={numberOf(raw)}
          min={schema.ui?.min ?? 0}
          max={schema.ui?.max ?? 100}
          step={schema.ui?.step ?? 1}
          oncommit={(v) => setField(name, v)}
        />
      {:else if widget === 'stepper'}
        <Stepper
          value={numberOf(raw)}
          min={schema.ui?.min}
          max={schema.ui?.max}
          step={schema.ui?.step ?? 1}
          oncommit={(v) => setField(name, v)}
        />
      {:else if widget === 'pill-select'}
        <PillSelect
          value={stringOf(raw)}
          options={schema.options ?? []}
          oncommit={(v) => setField(name, v)}
        />
      {:else if widget === 'search-select'}
        <SearchSelect
          value={stringOf(raw)}
          options={schema.options ?? []}
          oncommit={(v) => setField(name, v)}
        />
      {:else if widget === 'date-picker'}
        <DatePicker
          value={dateOf(raw)}
          oncommit={(v) => setField(name, v)}
        />
      {:else if widget === 'tag-chips'}
        <TagChips
          value={arrayOf(raw)}
          oncommit={(v) => setField(name, v.length ? v : undefined)}
        />
      {:else if schema.type === 'number'}
        <TextInput
          type="number"
          value={String(numberOf(raw))}
          placeholder={schema.ui?.placeholder ?? ''}
          oncommit={(v) => setField(name, v === '' ? undefined : Number(v))}
        />
      {:else}
        <TextInput
          value={stringOf(raw)}
          placeholder={schema.ui?.placeholder ?? ''}
          oncommit={(v) => setField(name, v)}
        />
      {/if}
      {#if schema.description}
        <span class="sf-field-desc">{schema.description}</span>
      {/if}
    </label>
  </ConditionalField>
{/snippet}

<div class="sf-form">
  {#if useTypedForm && parsed.ok}
    {#each mainFields as entry (entry.name)}
      {@render renderField(entry)}
    {/each}
    {#if advancedFields.length > 0}
      <DisclosureGroup>
        {#each advancedFields as entry (entry.name)}
          {@render renderField(entry)}
        {/each}
      </DisclosureGroup>
    {/if}
  {:else}
    <textarea
      class="sf-input sf-raw-editor"
      value={yamlText}
      oninput={onRawInput}
      spellcheck={false}
    ></textarea>
    {#if !parsed.ok}
      <p class="sf-parse-error">YAML error: {parsed.error}</p>
    {/if}
  {/if}

  {#if fields.length > 0}
    <RawToggle
      {showRaw}
      parseOk={parsed.ok}
      onToggle={(next) => {
        if (!next || parsed.ok) showRaw = next;
      }}
    />
  {/if}
</div>
