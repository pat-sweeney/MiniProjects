import React, { useEffect, useState } from 'react'
import { ImageMetadata, MediaItem } from '../../../shared/types'
import { getExif, getMetadata, setMetadata } from '../lib/sidecar'

interface Props {
  item: MediaItem
  onClose: () => void
  onSaved?: () => void
}

const EMPTY: Omit<ImageMetadata, 'path'> = {
  description: '',
  place: '',
  year: '',
  tags: []
}

export default function MetadataPanel({ item, onClose, onSaved }: Props): JSX.Element {
  const [meta, setMeta] = useState<ImageMetadata>({ path: item.id, ...EMPTY })
  const [tagInput, setTagInput] = useState('')
  const [exifHint, setExifHint] = useState('')

  useEffect(() => {
    let alive = true
    ;(async () => {
      const stored = await getMetadata(item.id)
      if (!alive) return
      // Auto-fill year/place from EXIF when the stored fields are empty.
      if (!stored.year || !stored.place) {
        const exif = await getExif(item.id)
        if (!alive) return
        const filled: string[] = []
        const nextMeta = { ...stored }
        if (!stored.year && exif.year) {
          nextMeta.year = exif.year
          filled.push('year')
        }
        if (!stored.place && exif.place) {
          nextMeta.place = exif.place
          filled.push('place')
        }
        setMeta(nextMeta)
        if (filled.length) setExifHint(`Auto-filled from EXIF: ${filled.join(', ')}`)
        else setExifHint('')
        return
      }
      setMeta(stored)
    })()
    return () => {
      alive = false
    }
  }, [item.id])

  const addTag = (): void => {
    const t = tagInput.trim()
    if (t && !meta.tags.includes(t)) {
      setMeta({ ...meta, tags: [...meta.tags, t] })
    }
    setTagInput('')
  }

  const save = async (): Promise<void> => {
    await setMetadata({ ...meta, path: item.id })
    onSaved?.()
    onClose()
  }

  return (
    <div className="panel">
      <button className="close-x" onClick={onClose}>✕</button>
      <h2>Image Details</h2>
      {exifHint && (
        <div className="row" style={{ color: 'var(--ok)', fontSize: 12 }}>
          {exifHint}
        </div>
      )}
      <div className="row">
        <label>File</label>
        <div style={{ fontSize: 13, color: 'var(--muted)', wordBreak: 'break-all' }}>
          {item.relPath}
        </div>
      </div>

      <div className="row">
        <label>Description</label>
        <textarea
          rows={3}
          value={meta.description}
          onChange={(e) => setMeta({ ...meta, description: e.target.value })}
        />
      </div>

      <div className="row row-2">
        <div>
          <label>Place</label>
          <input
            value={meta.place}
            onChange={(e) => setMeta({ ...meta, place: e.target.value })}
          />
        </div>
        <div>
          <label>Year</label>
          <input
            value={meta.year}
            onChange={(e) => setMeta({ ...meta, year: e.target.value })}
          />
        </div>
      </div>

      <div className="row">
        <label>Tags</label>
        <div className="row-2">
          <input
            value={tagInput}
            placeholder="add a tag…"
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addTag()
              }
            }}
          />
          <button style={{ flex: '0 0 auto' }} onClick={addTag}>Add</button>
        </div>
        <div className="tag-list">
          {meta.tags.map((t) => (
            <span className="tag" key={t}>
              {t}
              <button
                onClick={() =>
                  setMeta({ ...meta, tags: meta.tags.filter((x) => x !== t) })
                }
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      </div>

      <div className="actions">
        <button className="primary" onClick={save}>Save</button>
        <button onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}
