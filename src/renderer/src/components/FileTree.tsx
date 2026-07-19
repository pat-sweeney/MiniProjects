import React, { useEffect, useMemo, useRef, useState } from 'react'
import { MediaItem } from '../../../shared/types'

interface Props {
  items: MediaItem[]
  currentId?: string
  open: boolean
  onSelect: (index: number) => void
  onToggle: () => void
  onRename: (index: number, newBaseName: string) => Promise<boolean>
  onSuggestName: (index: number) => Promise<string | null>
  onDelete: (index: number) => void
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

/** NAS recycle-bin folders to hide from the tree (case-insensitive). */
const EXCLUDED_DIRS = new Set(['#recyle', '#recycle', '@recycle', '$recycle.bin'])

function buildTree(items: MediaItem[]): TreeNode {
  const root: TreeNode = { name: '', path: '', children: new Map() }
  items.forEach((item, index) => {
    const segments = item.relPath.split(/[\\/]+/).filter(Boolean)
    if (segments.length === 0) segments.push(item.name)
    // Skip anything living under an excluded folder (e.g. a NAS recycle bin).
    if (segments.some((s) => EXCLUDED_DIRS.has(s.toLowerCase()))) return
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

function splitName(name: string): { base: string; ext: string } {
  const dot = name.lastIndexOf('.')
  if (dot > 0) return { base: name.slice(0, dot), ext: name.slice(dot) }
  return { base: name, ext: '' }
}

/** Inline editor shown when a file row is being renamed (F2). */
function RenameInput({
  initialBase,
  ext,
  depth,
  onCommit,
  onCancel,
  onSuggest
}: {
  initialBase: string
  ext: string
  depth: number
  onCommit: (base: string) => void
  onCancel: () => void
  onSuggest: () => Promise<string | null>
}): JSX.Element {
  const [value, setValue] = useState(initialBase)
  const [suggestion, setSuggestion] = useState<string | null>(null)
  const [suggesting, setSuggesting] = useState(true)
  const touched = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
    let alive = true
    onSuggest()
      .then((name) => {
        if (!alive) return
        if (name && name !== initialBase) {
          setSuggestion(name)
          // Auto-fill only if the user hasn't started typing.
          if (!touched.current) {
            setValue(name)
            requestAnimationFrame(() => inputRef.current?.select())
          }
        }
      })
      .finally(() => alive && setSuggesting(false))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="tree-rename" style={{ paddingLeft: 8 + depth * 14 }}>
      <div className="tree-rename-field">
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => {
            touched.current = true
            setValue(e.target.value)
          }}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') onCommit(value.trim())
            else if (e.key === 'Escape') onCancel()
          }}
          onBlur={() => onCancel()}
          spellCheck={false}
        />
        {ext && <span className="tree-rename-ext">{ext}</span>}
      </div>
      {suggesting && (
        <span className="tree-suggest loading" title="Thinking of a name…">
          ✨…
        </span>
      )}
      {!suggesting && suggestion && (
        <button
          type="button"
          className="tree-suggest"
          title="Use suggested name"
          // Keep the input focused so its blur handler doesn't cancel first.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            touched.current = true
            setValue(suggestion)
            inputRef.current?.focus()
            inputRef.current?.select()
          }}
        >
          ✨ {suggestion}
        </button>
      )}
    </div>
  )
}

function NodeRow({
  node,
  depth,
  currentId,
  items,
  expanded,
  renamingIndex,
  toggleExpand,
  onSelect,
  beginRename,
  onRename,
  onSuggestName,
  onDelete,
  endRename
}: {
  node: TreeNode
  depth: number
  currentId?: string
  items: MediaItem[]
  expanded: Set<string>
  renamingIndex: number | null
  toggleExpand: (path: string) => void
  onSelect: (index: number) => void
  beginRename: (index: number) => void
  onRename: (index: number, base: string) => Promise<boolean>
  onSuggestName: (index: number) => Promise<string | null>
  onDelete: (index: number) => void
  endRename: () => void
}): JSX.Element {
  const isFolder = node.children.size > 0
  const isCollapsed = !expanded.has(node.path)
  const item = node.itemIndex !== undefined ? items[node.itemIndex] : undefined
  const isCurrent = item?.id === currentId
  const isEditing = node.itemIndex !== undefined && renamingIndex === node.itemIndex

  if (isEditing && item) {
    const { base, ext } = splitName(item.name)
    return (
      <RenameInput
        initialBase={base}
        ext={ext}
        depth={depth}
        onSuggest={() => onSuggestName(node.itemIndex!)}
        onCommit={async (b) => {
          const ok = await onRename(node.itemIndex!, b)
          if (ok) endRename()
        }}
        onCancel={endRename}
      />
    )
  }

  return (
    <>
      <div
        className={
          'tree-row' +
          (isFolder ? ' folder' : ' file') +
          (isCurrent ? ' current' : '')
        }
        style={{ paddingLeft: 8 + depth * 14 }}
        title={isFolder ? node.name : node.name + ' — press F2 to rename'}
        tabIndex={isFolder ? undefined : 0}
        onClick={() => {
          if (isFolder) toggleExpand(node.path)
          else if (node.itemIndex !== undefined) onSelect(node.itemIndex)
        }}
        onKeyDown={(e) => {
          if (isFolder || node.itemIndex === undefined) return
          if (e.key === 'F2') {
            e.preventDefault()
            if (item?.source === 'local') beginRename(node.itemIndex)
          } else if (e.key === 'Delete') {
            e.preventDefault()
            e.stopPropagation()
            onDelete(node.itemIndex)
          } else if (e.key === 'Enter') {
            onSelect(node.itemIndex)
          }
        }}
      >
        <span className="tree-icon">
          {isFolder ? (isCollapsed ? '▸' : '▾') : node.kind === 'video' ? '🎞' : '🖼'}
        </span>
        <span className="tree-name">{node.name}</span>
        {!isFolder && node.itemIndex !== undefined && (
          <button
            type="button"
            className="tree-delete"
            title="Delete file"
            onClick={(e) => {
              e.stopPropagation()
              onDelete(node.itemIndex!)
            }}
          >
            🗑
          </button>
        )}
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
            expanded={expanded}
            renamingIndex={renamingIndex}
            toggleExpand={toggleExpand}
            onSelect={onSelect}
            beginRename={beginRename}
            onRename={onRename}
            onSuggestName={onSuggestName}
            onDelete={onDelete}
            endRename={endRename}
          />
        ))}
    </>
  )
}

export default function FileTree(props: Props): JSX.Element {
  const { items, currentId, open, onSelect, onToggle, onRename, onSuggestName, onDelete } =
    props
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [renamingIndex, setRenamingIndex] = useState<number | null>(null)

  const root = useMemo(() => buildTree(items), [items])

  const toggleExpand = (path: string): void => {
    setExpanded((prev) => {
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
                expanded={expanded}
                renamingIndex={renamingIndex}
                toggleExpand={toggleExpand}
                onSelect={onSelect}
                beginRename={setRenamingIndex}
                onRename={onRename}
                onSuggestName={onSuggestName}
                onDelete={onDelete}
                endRename={() => setRenamingIndex(null)}
              />
            ))
          )}
        </div>
        <div className="filetree-hint">Select a file and press F2 to rename</div>
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
