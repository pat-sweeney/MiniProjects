import React, { useState } from 'react'
import { FaceBox } from '../../../shared/types'

interface Props {
  faces: FaceBox[]
  knownNames?: string[]
  onRename: (face: FaceBox, newName: string) => void
  onDelete?: (face: FaceBox) => void
}

/** Draws clickable, editable boxes over detected faces (normalized coords). */
export default function FaceOverlay({
  faces,
  knownNames = [],
  onRename,
  onDelete
}: Props): JSX.Element {
  const [editing, setEditing] = useState<number | null>(null)
  const [value, setValue] = useState('')

  return (
    <div className="face-overlay">
      <datalist id="face-name-options">
        {knownNames.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      {faces.map((f) => {
        const style: React.CSSProperties = {
          left: `${f.left * 100}%`,
          top: `${f.top * 100}%`,
          width: `${(f.right - f.left) * 100}%`,
          height: `${(f.bottom - f.top) * 100}%`
        }
        const isUnknown = /^unknown/i.test(f.name)
        return (
          <div
            key={f.faceId}
            className="face-box"
            style={style}
            onClick={(e) => {
              e.stopPropagation()
              setEditing(f.faceId)
              setValue(isUnknown ? '' : f.name)
            }}
            title="Click to label this person"
          >
            {onDelete && (
              <button
                type="button"
                className="face-remove"
                title="Remove this face label"
                onClick={(e) => {
                  e.stopPropagation()
                  if (editing === f.faceId) setEditing(null)
                  onDelete(f)
                }}
              >
                ✕
              </button>
            )}
            {editing === f.faceId ? (
              <input
                autoFocus
                className="face-label"
                style={{ width: 160 }}
                value={value}
                list="face-name-options"
                placeholder="Enter or pick a name…"
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && value.trim()) {
                    onRename(f, value.trim())
                    setEditing(null)
                  } else if (e.key === 'Escape') {
                    setEditing(null)
                  }
                }}
                onBlur={() => setEditing(null)}
              />
            ) : (
              <span className={'face-label' + (isUnknown ? ' unknown' : '')}>
                {f.name}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
