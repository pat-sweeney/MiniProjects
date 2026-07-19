import React, { useMemo, useState } from 'react'
import { MediaItem } from '../../../shared/types'

interface Props {
  items: MediaItem[]
  currentId?: string
  open: boolean
  onSelect: (index: number) => void
  onToggle: () => void
}

interface TreeNode {
  name: string
  path: string
  /** Child folders/files keyed by segment name, preserving insertion order */
  children: Map<string, TreeNode>
  /** Set only for leaf nodes: index into the media array */
  itemIndex?: number
  kind?: 'image' | 'video'
}

function buildTree(items: MediaItem[]): TreeNode {
  const root: TreeNode = { name: '', path: '', children: new Map() }
  items.forEach((item, index) => {
    const segments = item.relPath.split(/[\\/]+/).filter(Boolean)
    if (segments.length === 0) segments.push(item.name)
    let node = root
    segments.forEach((seg, i) => {
      const isLeaf = i === segments.length - 1
      let child = node.children.get(seg)
      if (!child) {
        child = {
          name: seg,
          path: `${node.path}/${seg}`,
          children: new Map()
        }
        node.children.set(seg, child)
      }
      if (isLeaf) {
        child.itemIndex = index
        child.kind = item.kind
      }
      node = child
    })
  })
  return root
}

function NodeRow({
  node,
  depth,
  currentId,
  items,
  collapsed,
  toggleCollapse,
  onSelect
}: {
  node: TreeNode
  depth: number
  currentId?: string
  items: MediaItem[]
  collapsed: Set<string>
  toggleCollapse: (path: string) => void
  onSelect: (index: number) => void
}): JSX.Element {
  const isFolder = node.children.size > 0
  const isCollapsed = collapsed.has(node.path)
  const isCurrent =
    node.itemIndex !== undefined && items[node.itemIndex]?.id === currentId

  return (
    <>
      <div
        className={
          'tree-row' +
          (isFolder ? ' folder' : ' file') +
          (isCurrent ? ' current' : '')
        }
        style={{ paddingLeft: 8 + depth * 14 }}
        title={node.name}
        onClick={() => {
          if (isFolder) toggleCollapse(node.path)
          else if (node.itemIndex !== undefined) onSelect(node.itemIndex)
        }}
      >
        <span className="tree-icon">
          {isFolder ? (isCollapsed ? '▸' : '▾') : node.kind === 'video' ? '🎞' : '🖼'}
        </span>
        <span className="tree-name">{node.name}</span>
      </div>
      {isFolder &&
        !isCollapsed &&
        [...node.children.values()].map((child) => (
          <NodeRow
            key={child.path}
            node={child}
            depth={depth + 1}
            currentId={currentId}
            items={items}
            collapsed={collapsed}
            toggleCollapse={toggleCollapse}
            onSelect={onSelect}
          />
        ))}
    </>
  )
}

export default function FileTree(props: Props): JSX.Element {
  const { items, currentId, open, onSelect, onToggle } = props
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const root = useMemo(() => buildTree(items), [items])

  const toggleCollapse = (path: string): void => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  return (
    <>
      <aside className={'filetree' + (open ? '' : ' hidden')}>
        <div className="filetree-header">
          <span className="filetree-title">Files ({items.length})</span>
          <button
            className="icon filetree-hide"
            onClick={onToggle}
            title="Hide file tree"
          >
            ⟨
          </button>
        </div>
        <div className="filetree-body">
          {items.length === 0 ? (
            <div className="filetree-empty">No media loaded</div>
          ) : (
            [...root.children.values()].map((child) => (
              <NodeRow
                key={child.path}
                node={child}
                depth={0}
                currentId={currentId}
                items={items}
                collapsed={collapsed}
                toggleCollapse={toggleCollapse}
                onSelect={onSelect}
              />
            ))
          )}
        </div>
      </aside>

      {!open && (
        <div className="tree-reveal">
          <button
            className="icon tree-show"
            onClick={onToggle}
            title="Show file tree"
          >
            ⟩
          </button>
        </div>
      )}
    </>
  )
}
