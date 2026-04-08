import { useState, useCallback } from "preact/hooks";

/**
 * Recursive, collapsible file tree component.
 * Nodes with children are directories (collapsible); leaf nodes are files.
 */
export function FileTree({ tree, activePath, onSelectFile }) {
  if (!tree || !tree.length) return null;
  return (
    <div class="file-tree">
      {tree.map((node) => (
        <FileTreeNode
          key={node.displayPath || node.name}
          node={node}
          depth={0}
          activePath={activePath}
          onSelectFile={onSelectFile}
        />
      ))}
    </div>
  );
}

function FileTreeNode({ node, depth, activePath, onSelectFile }) {
  const [expanded, setExpanded] = useState(depth < 1);
  const isDir = node.type === "dir";
  const isActive = !isDir && activePath === node.realPath;

  const toggle = useCallback((e) => {
    e.stopPropagation();
    setExpanded((prev) => !prev);
  }, []);

  const select = useCallback(() => {
    if (!isDir) onSelectFile(node.realPath);
  }, [isDir, node.realPath, onSelectFile]);

  return (
    <div>
      <div
        class={`file-tree-item${isDir ? " is-dir" : ""}${isActive ? " active" : ""}`}
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
        onClick={isDir ? toggle : select}
      >
        <span class="tree-icon">
          {isDir ? (expanded ? "▾" : "▸") : "·"}
        </span>
        {node.name}
      </div>
      {isDir && expanded && node.children ? (
        <div class="file-tree-children">
          {node.children.map((child) => (
            <FileTreeNode
              key={child.displayPath || child.name}
              node={child}
              depth={depth + 1}
              activePath={activePath}
              onSelectFile={onSelectFile}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
