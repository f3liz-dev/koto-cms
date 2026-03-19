import { $prose } from "@milkdown/utils";
import { Plugin, PluginKey } from "@milkdown/prose/state";
import { Decoration, DecorationSet } from "@milkdown/prose/view";

const syncIndexKey = new PluginKey("cms-sync-index");

/**
 * A Milkdown $prose plugin that stamps data-sync-index="N" on every
 * top-level block node in the ProseMirror document.
 *
 * These indices match the ones stamped by rehypeSyncIndex on the preview
 * side, making cross-pane scroll sync exact regardless of nesting differences.
 */
export const syncIndexPlugin = $prose(() =>
  new Plugin({
    key: syncIndexKey,
    props: {
      decorations(state) {
        const decorations = [];
        let index = 0;
        state.doc.forEach((node, offset) => {
          decorations.push(
            Decoration.node(offset, offset + node.nodeSize, {
              "data-sync-index": String(index++),
            }),
          );
        });
        return DecorationSet.create(state.doc, decorations);
      },
    },
  }),
);