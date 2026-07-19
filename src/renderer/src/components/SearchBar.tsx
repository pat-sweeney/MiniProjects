import React, { useEffect, useRef, useState } from 'react'

interface Props {
  open: boolean
  resultCount: number | null
  onSearch: (query: string) => void
  onClear: () => void
  onClose: () => void
}

/**
 * Overlay search bar. A single query is matched by the sidecar across tags,
 * date/year and person names; results filter the slideshow to matching items.
 */
export default function SearchBar({
  open,
  resultCount,
  onSearch,
  onClear,
  onClose
}: Props): JSX.Element | null {
  const [q, setQ] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  if (!open) return null

  const submit = (): void => {
    const query = q.trim()
    if (query) onSearch(query)
    else onClear()
  }

  const clear = (): void => {
    setQ('')
    onClear()
  }

  return (
    <div className="search-bar">
      <span className="search-icon">🔍</span>
      <input
        ref={inputRef}
        value={q}
        placeholder="Search tags, date/year, or person names…"
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit()
          else if (e.key === 'Escape') onClose()
        }}
      />
      {resultCount !== null && (
        <span className="search-count">
          {resultCount} match{resultCount === 1 ? '' : 'es'}
        </span>
      )}
      <button className="icon" onClick={submit} title="Search (Enter)">
        Search
      </button>
      <button className="icon" onClick={clear} title="Clear filter">
        Clear
      </button>
      <button className="icon" onClick={onClose} title="Close (Esc)">
        ✕
      </button>
    </div>
  )
}
