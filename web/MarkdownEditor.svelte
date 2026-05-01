<script lang="ts">
  import { untrack } from 'svelte';
  import { Editor, type AnyExtension } from '@tiptap/core';
  import StarterKit from '@tiptap/starter-kit';
  import { BubbleMenu } from '@tiptap/extension-bubble-menu';
  import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
  import { common, createLowlight } from 'lowlight';
  import { Markdown } from 'tiptap-markdown';
  import { SlashMenu } from './SlashMenu';
  import { LinkSuggestion, type LinkTarget } from './LinkSuggestion';
  import Image from '@tiptap/extension-image';
  import { FormRoot, adaptLegacyFields } from './components/schemaform';
  import type { FrontmatterFieldSchema } from './api';

  export type AssetUploader = (file: File) => Promise<string>;
  import {
    splitFrontmatter,
    mergeFrontmatter,
    encodeSpecialBlocksForEditor,
    decodeSpecialBlocksFromEditor,
    findScrollContainer,
  } from './MarkdownEditor.helpers';

  let {
    value,
    editorKey,
    onChange,
    frontmatterSchema = null,
    uploadAsset = null,
    linkTargets = () => [],
    currentFilePath = '',
  }: {
    value: string;
    editorKey: string;
    onChange: (next: string) => void;
    frontmatterSchema?: FrontmatterFieldSchema[] | null;
    uploadAsset?: AssetUploader | null;
    linkTargets?: () => LinkTarget[];
    currentFilePath?: string;
  } = $props();

  let rootEl: HTMLDivElement | undefined = $state();
  let menuEl: HTMLDivElement | undefined = $state();
  let editor: Editor | null = null;

  let hasFrontmatter = $state(false);
  let frontmatter = $state('');
  let markdownBody = $state('');
  let lastEmitted = '';
  let sourceMode = $state(false);

  const lowlight = createLowlight(common);

  function emitChange(body: string) {
    markdownBody = body;
    const merged = mergeFrontmatter(hasFrontmatter, frontmatter, body);
    if (lastEmitted !== merged) {
      lastEmitted = merged;
      onChange(merged);
    }
  }

  // Re-sync state whenever the incoming value changes identity (file switch).
  $effect(() => {
    const parsed = splitFrontmatter(value);
    hasFrontmatter = parsed.hasFrontmatter;
    frontmatter = parsed.frontmatter;
    markdownBody = parsed.body;
    lastEmitted = value ?? '';
  });

  // Destroy + recreate the editor when editorKey changes or source mode toggles.
  $effect(() => {
    // track dependencies
    editorKey;
    sourceMode;

    // In source mode the WYSIWYG is hidden; keep the editor torn down.
    if (sourceMode) {
      editor?.destroy();
      editor = null;
      return;
    }

    if (!rootEl) return;

    // Seed from the latest known body (source-mode edits update `markdownBody`).
    const encoded = encodeSpecialBlocksForEditor(untrack(() => markdownBody));

    const extensions: AnyExtension[] = [
      StarterKit.configure({ codeBlock: false }),
      CodeBlockLowlight.configure({ lowlight }),
      Image.configure({ inline: false, allowBase64: false }),
      Markdown.configure({
        html: true,
        tightLists: true,
        linkify: false,
        breaks: false,
        transformPastedText: true,
        transformCopiedText: true,
      }),
      SlashMenu,
      LinkSuggestion.configure({
        targets: linkTargets,
        currentPath: () => currentFilePath,
      }),
    ];
    if (menuEl) {
      extensions.push(
        BubbleMenu.configure({
          element: menuEl,
          pluginKey: 'koto-bubble',
          updateDelay: 100,
        }),
      );
    }

    editor?.destroy();
    editor = new Editor({
      element: rootEl,
      extensions,
      content: encoded,
      editorProps: {
        handlePaste(_view, event) {
          if (!uploadAsset) return false;
          const items = (event as ClipboardEvent).clipboardData?.items;
          if (!items) return false;
          const images: File[] = [];
          for (const item of items) {
            if (item.type.startsWith('image/')) {
              const f = item.getAsFile();
              if (f) images.push(f);
            }
          }
          if (!images.length) return false;
          event.preventDefault();
          void uploadAndInsertImages(images);
          return true;
        },
        handleDrop(_view, event) {
          if (!uploadAsset) return false;
          const files = (event as DragEvent).dataTransfer?.files;
          if (!files || !files.length) return false;
          const images = Array.from(files).filter((f) => f.type.startsWith('image/'));
          if (!images.length) return false;
          event.preventDefault();
          void uploadAndInsertImages(images);
          return true;
        },
      },
      onUpdate({ editor }) {
        const storage = (editor.storage as unknown as Record<string, unknown>).markdown as
          | { getMarkdown: () => string }
          | undefined;
        const md = storage?.getMarkdown?.() ?? '';
        const decoded = decodeSpecialBlocksFromEditor(md);
        emitChange(decoded);
      },
    });

    // Emit initial value if encode/decode round-trip normalized the source.
    const initialDecoded = decodeSpecialBlocksFromEditor(encoded);
    const initialMerged = mergeFrontmatter(
      untrack(() => hasFrontmatter),
      untrack(() => frontmatter),
      initialDecoded,
    );
    if (lastEmitted !== initialMerged) {
      lastEmitted = initialMerged;
      onChange(initialMerged);
    }

    return () => {
      editor?.destroy();
      editor = null;
    };
  });

  // Forward wheel scroll to the real scroll ancestor (focus mode differs from normal mode).
  $effect(() => {
    const el = rootEl;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey) return;
      const container = findScrollContainer(el);
      if (!container) return;
      if (container.scrollHeight <= container.clientHeight) return;
      if (event.deltaY === 0 && event.deltaX === 0) return;
      container.scrollBy({ top: event.deltaY, left: event.deltaX, behavior: 'auto' });
      event.preventDefault();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  function onEnableFrontmatter() {
    hasFrontmatter = true;
    frontmatter = '';
    emitChange(markdownBody);
  }

  function onDisableFrontmatter() {
    hasFrontmatter = false;
    emitChange(markdownBody);
  }

  function fmt(name: 'bold' | 'italic' | 'strike' | 'code') {
    if (!editor) return;
    const chain = editor.chain().focus();
    switch (name) {
      case 'bold':
        chain.toggleBold().run();
        break;
      case 'italic':
        chain.toggleItalic().run();
        break;
      case 'strike':
        chain.toggleStrike().run();
        break;
      case 'code':
        chain.toggleCode().run();
        break;
    }
  }

  function heading(level: 1 | 2 | 3) {
    editor?.chain().focus().toggleHeading({ level }).run();
  }

  function listToggle(kind: 'bullet' | 'ordered') {
    if (!editor) return;
    if (kind === 'bullet') editor.chain().focus().toggleBulletList().run();
    else editor.chain().focus().toggleOrderedList().run();
  }

  function toggleBlockquote() {
    editor?.chain().focus().toggleBlockquote().run();
  }

  async function uploadAndInsertImages(files: File[]) {
    if (!uploadAsset || !editor) return;
    for (const file of files) {
      try {
        const src = await uploadAsset(file);
        editor.chain().focus().setImage({ src, alt: file.name }).run();
      } catch (err) {
        console.error('Image upload failed', err);
      }
    }
  }

  function onSourceInput(e: Event) {
    markdownBody = (e.currentTarget as HTMLTextAreaElement).value;
    emitChange(markdownBody);
  }

  function toggleSourceMode() {
    sourceMode = !sourceMode;
  }

  function setLink() {
    if (!editor) return;
    const prev = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('URL', prev ?? '');
    if (url === null) return;
    if (!url) {
      editor.chain().focus().extendMarkRange('link').unsetMark('link').run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setMark('link', { href: url }).run();
  }
</script>

<div class="editor-shell h-full min-h-0 flex flex-col">
  <section class="frontmatter-wrap{hasFrontmatter ? '' : ' frontmatter-wrap-empty'}">
    <div class="frontmatter-head">
      <div class="frontmatter-label">Frontmatter</div>
      <button
        class="frontmatter-toggle"
        type="button"
        onclick={hasFrontmatter ? onDisableFrontmatter : onEnableFrontmatter}
      >
        {hasFrontmatter ? 'Remove' : 'Add'}
      </button>
    </div>
    {#if hasFrontmatter}
      <FormRoot
        yamlText={frontmatter}
        fields={frontmatterSchema ? adaptLegacyFields(frontmatterSchema) : []}
        key={editorKey}
        onChange={(next) => {
          frontmatter = next;
          emitChange(markdownBody);
        }}
      />
    {:else}
      <p class="frontmatter-hint">No frontmatter block in this file.</p>
    {/if}
  </section>

  <div bind:this={menuEl} class="tiptap-bubble-menu" role="toolbar" aria-label="Formatting">
    <button type="button" onclick={() => fmt('bold')} title="Bold" aria-label="Bold"><b>B</b></button>
    <button type="button" onclick={() => fmt('italic')} title="Italic" aria-label="Italic"><i>I</i></button>
    <button type="button" onclick={() => fmt('strike')} title="Strike" aria-label="Strike"><s>S</s></button>
    <button type="button" onclick={() => fmt('code')} title="Inline code" aria-label="Inline code">{'</>'}</button>
    <span class="tiptap-bubble-sep"></span>
    <button type="button" onclick={() => heading(1)} title="Heading 1">H1</button>
    <button type="button" onclick={() => heading(2)} title="Heading 2">H2</button>
    <button type="button" onclick={() => heading(3)} title="Heading 3">H3</button>
    <span class="tiptap-bubble-sep"></span>
    <button type="button" onclick={() => listToggle('bullet')} title="Bullet list">•</button>
    <button type="button" onclick={() => listToggle('ordered')} title="Ordered list">1.</button>
    <button type="button" onclick={toggleBlockquote} title="Blockquote">&quot;</button>
    <button type="button" onclick={setLink} title="Link">🔗</button>
  </div>

  <div class="editor-mode-bar">
    <button
      type="button"
      class="source-toggle"
      class:active={sourceMode}
      onclick={toggleSourceMode}
      title="Toggle markdown source view"
    >
      {sourceMode ? 'WYSIWYG' : 'Source'}
    </button>
  </div>

  {#if sourceMode}
    <textarea
      class="source-editor"
      value={markdownBody}
      oninput={onSourceInput}
      spellcheck={false}
    ></textarea>
  {:else}
    <div class="editor-surface w-full min-h-0 flex-1" bind:this={rootEl}></div>
  {/if}
</div>
