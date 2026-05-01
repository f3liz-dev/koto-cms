import { Extension, type Editor, type Range } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import Suggestion, {
  type SuggestionKeyDownProps,
  type SuggestionProps,
} from '@tiptap/suggestion';

const linkSuggestionPluginKey = new PluginKey('link-suggestion');

export interface LinkTarget {
  path: string;
  title: string;
}

export interface LinkSuggestionOptions {
  targets: () => LinkTarget[];
  currentPath: () => string;
}

function chainOf(editor: Editor): any {
  return editor.chain().focus();
}

function filterTargets(all: LinkTarget[], query: string): LinkTarget[] {
  const q = query.trim().toLowerCase();
  const base = q
    ? all.filter(
        (t) => t.title.toLowerCase().includes(q) || t.path.toLowerCase().includes(q),
      )
    : all;
  return base.slice(0, 12);
}

/**
 * Compute the relative path from `from` (a file path) to `to` (another file
 * path), both repo-root-relative. Always returns a form prefixed with `./` or
 * `../` so the output is an unambiguous relative link.
 */
export function relativePath(from: string, to: string): string {
  const fromDir = from.split('/').slice(0, -1);
  const toParts = to.split('/');
  let i = 0;
  while (
    i < fromDir.length &&
    i < toParts.length - 1 &&
    fromDir[i] === toParts[i]
  ) {
    i += 1;
  }
  const up = fromDir.length - i;
  const down = toParts.slice(i);
  const parts = up === 0 ? ['.', ...down] : Array.from({ length: up }, () => '..').concat(down);
  return parts.join('/');
}

interface RenderState {
  el: HTMLDivElement | null;
  items: LinkTarget[];
  selected: number;
  command: ((item: LinkTarget) => void) | null;
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
    const path = document.createElement('span');
    path.className = 'slash-menu-item-desc';
    path.textContent = item.path;
    btn.appendChild(path);
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

export const LinkSuggestion = Extension.create<LinkSuggestionOptions>({
  name: 'link-suggestion',

  addOptions() {
    return {
      targets: () => [],
      currentPath: () => '',
    };
  },

  addProseMirrorPlugins() {
    const opts = this.options;
    const state: RenderState = {
      el: null,
      items: [],
      selected: 0,
      command: null,
    };

    return [
      Suggestion({
        pluginKey: linkSuggestionPluginKey,
        editor: this.editor,
        char: '[[',
        startOfLine: false,
        allowSpaces: true,
        items: ({ query }: { query: string }) => filterTargets(opts.targets(), query),
        command: ({ editor, range, props }: { editor: Editor; range: Range; props: LinkTarget }) => {
          const rel = relativePath(opts.currentPath(), props.path);
          chainOf(editor).deleteRange(range).insertContent(`[${props.title}](${rel})`).run();
        },
        render: () => ({
          onStart: (props: SuggestionProps<LinkTarget>) => {
            state.el = document.createElement('div');
            state.el.className = 'slash-menu link-suggestion-menu';
            state.el.setAttribute('role', 'listbox');
            document.body.appendChild(state.el);
            state.items = props.items;
            state.selected = 0;
            state.command = (item) => props.command(item);
            renderList(state);
            position(state.el, props.clientRect?.());
          },
          onUpdate: (props: SuggestionProps<LinkTarget>) => {
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
