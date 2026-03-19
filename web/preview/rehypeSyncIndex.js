/**
 * rehypeSyncIndex
 *
 * A rehype plugin that stamps `data-sync-index="N"` on every top-level
 * element child of the document root — exactly mirroring what the
 * Milkdown syncIndexPlugin does on the ProseMirror side.
 *
 * "Top-level" means direct element children of the hast root, so nested
 * nodes (a <p> inside a <blockquote>) do NOT get their own index.
 *
 * Usage in your unified pipeline:
 *
 *   import { rehypeSyncIndex } from "./rehypeSyncIndex.js";
 *   unified()
 *     .use(remarkParse)
 *     .use(remarkRehype)
 *     .use(rehypeSyncIndex)   // ← add here, after remark→rehype conversion
 *     .use(rehypeStringify)
 *
 * No dependencies beyond the hast tree structure — no visit() needed
 * because we only touch root.children.
 */
export function rehypeSyncIndex() {
  return (tree) => {
    let index = 0;
    for (const node of tree.children) {
      // Only element nodes get an index (skip text/comment/doctype nodes)
      if (node.type === "element") {
        if (!node.properties) node.properties = {};
        node.properties["data-sync-index"] = String(index++);
      }
    }
  };
}