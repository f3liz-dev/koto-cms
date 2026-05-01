import { Extension, type Editor, type Range } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import Suggestion, {
  type SuggestionKeyDownProps,
  type SuggestionProps,
} from '@tiptap/suggestion';

const slashMenuPluginKey = new PluginKey('slash-menu');

// tsgo doesn't see the command augmentations declared by StarterKit /
// CodeBlockLowlight / Image from this file's perspective; at runtime these
// commands exist because MarkdownEditor.svelte registers the extensions.
// Erase the chain type to unblock type-checking.
function chainOf(editor: Editor): any {
  return editor.chain().focus();
}

export interface SlashItem {
  title: string;
  description?: string;
  command: (args: { editor: Editor; range: Range }) => void;
}

const MARKDOC_CALLOUT_BODY = (type: string): string =>
  `{% callout type="${type}" %}\nYour message here.\n{% /callout %}`;

function insertMarkdocBlock(
  editor: Editor,
  range: Range,
  language: string,
  content: string,
) {
  chainOf(editor)
    .deleteRange(range)
    .setNode('codeBlock', { language })
    .insertContent(content)
    .run();
}

const ITEMS: SlashItem[] = [
  {
    title: 'Heading 1',
    command: ({ editor, range }) =>
      chainOf(editor).deleteRange(range).setNode('heading', { level: 1 }).run(),
  },
  {
    title: 'Heading 2',
    command: ({ editor, range }) =>
      chainOf(editor).deleteRange(range).setNode('heading', { level: 2 }).run(),
  },
  {
    title: 'Heading 3',
    command: ({ editor, range }) =>
      chainOf(editor).deleteRange(range).setNode('heading', { level: 3 }).run(),
  },
  {
    title: 'Bullet list',
    command: ({ editor, range }) =>
      chainOf(editor).deleteRange(range).toggleBulletList().run(),
  },
  {
    title: 'Ordered list',
    command: ({ editor, range }) =>
      chainOf(editor).deleteRange(range).toggleOrderedList().run(),
  },
  {
    title: 'Blockquote',
    command: ({ editor, range }) =>
      chainOf(editor).deleteRange(range).toggleBlockquote().run(),
  },
  {
    title: 'Code block',
    command: ({ editor, range }) =>
      chainOf(editor).deleteRange(range).setCodeBlock().run(),
  },
  {
    title: 'Divider',
    command: ({ editor, range }) =>
      chainOf(editor).deleteRange(range).setHorizontalRule().run(),
  },
  {
    title: 'Callout: Info',
    description: 'Markdoc {% callout type="info" %}',
    command: ({ editor, range }) =>
      insertMarkdocBlock(editor, range, 'markdoc', MARKDOC_CALLOUT_BODY('info')),
  },
  {
    title: 'Callout: Tip',
    description: 'Markdoc {% callout type="tip" %}',
    command: ({ editor, range }) =>
      insertMarkdocBlock(editor, range, 'markdoc', MARKDOC_CALLOUT_BODY('tip')),
  },
  {
    title: 'Callout: Warning',
    description: 'Markdoc {% callout type="warning" %}',
    command: ({ editor, range }) =>
      insertMarkdocBlock(editor, range, 'markdoc', MARKDOC_CALLOUT_BODY('warning')),
  },
  {
    title: 'Callout: Danger',
    description: 'Markdoc {% callout type="danger" %}',
    command: ({ editor, range }) =>
      insertMarkdocBlock(editor, range, 'markdoc', MARKDOC_CALLOUT_BODY('danger')),
  },
];

function filterItems(query: string): SlashItem[] {
  if (!query) return ITEMS;
  const q = query.toLowerCase();
  return ITEMS.filter(
    (i) =>
      i.title.toLowerCase().includes(q) ||
      (i.description?.toLowerCase().includes(q) ?? false),
  );
}

interface RenderState {
  el: HTMLDivElement | null;
  items: SlashItem[];
  selected: number;
  command: ((item: SlashItem) => void) | null;
}

function renderList(state: RenderState) {
  if (!state.el) return;
  state.el.innerHTML = '';
  if (!state.items.length) {
    const empty = document.createElement('div');
    empty.className = 'slash-menu-empty';
    empty.textContent = 'No matches';
    state.el.appendChild(empty);
    return;
  }
  state.items.forEach((item, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'slash-menu-item' + (i === state.selected ? ' selected' : '');
    const title = document.createElement('span');
    title.className = 'slash-menu-item-title';
    title.textContent = item.title;
    btn.appendChild(title);
    if (item.description) {
      const desc = document.createElement('span');
      desc.className = 'slash-menu-item-desc';
      desc.textContent = item.description;
      btn.appendChild(desc);
    }
    btn.onmouseenter = () => {
      state.selected = i;
      renderList(state);
    };
    btn.onmousedown = (e) => {
      e.preventDefault();
      state.command?.(item);
    };
    state.el!.appendChild(btn);
  });
}

function position(el: HTMLDivElement | null, rect: DOMRect | null | undefined) {
  if (!el || !rect) return;
  el.style.top = `${rect.bottom + window.scrollY + 4}px`;
  el.style.left = `${rect.left + window.scrollX}px`;
}

export const SlashMenu = Extension.create({
  name: 'slash-menu',

  addProseMirrorPlugins() {
    const state: RenderState = {
      el: null,
      items: [],
      selected: 0,
      command: null,
    };

    return [
      Suggestion({
        pluginKey: slashMenuPluginKey,
        editor: this.editor,
        char: '/',
        startOfLine: false,
        items: ({ query }: { query: string }) => filterItems(query),
        command: ({ editor, range, props }: { editor: Editor; range: Range; props: SlashItem }) => {
          props.command({ editor, range });
        },
        render: () => ({
          onStart: (props: SuggestionProps<SlashItem>) => {
            state.el = document.createElement('div');
            state.el.className = 'slash-menu';
            state.el.setAttribute('role', 'listbox');
            document.body.appendChild(state.el);
            state.items = props.items;
            state.selected = 0;
            state.command = (item) => props.command(item);
            renderList(state);
            position(state.el, props.clientRect?.());
          },
          onUpdate: (props: SuggestionProps<SlashItem>) => {
            state.items = props.items;
            state.selected = 0;
            state.command = (item) => props.command(item);
            renderList(state);
            position(state.el, props.clientRect?.());
          },
          onKeyDown: (props: SuggestionKeyDownProps) => {
            if (props.event.key === 'ArrowDown') {
              if (state.items.length) {
                state.selected = (state.selected + 1) % state.items.length;
                renderList(state);
              }
              return true;
            }
            if (props.event.key === 'ArrowUp') {
              if (state.items.length) {
                state.selected =
                  (state.selected - 1 + state.items.length) % state.items.length;
                renderList(state);
              }
              return true;
            }
            if (props.event.key === 'Enter') {
              const item = state.items[state.selected];
              if (item) {
                state.command?.(item);
                return true;
              }
              return false;
            }
            if (props.event.key === 'Escape') {
              state.el?.remove();
              state.el = null;
              return true;
            }
            return false;
          },
          onExit: () => {
            state.el?.remove();
            state.el = null;
            state.command = null;
          },
        }),
      }),
    ];
  },
});
