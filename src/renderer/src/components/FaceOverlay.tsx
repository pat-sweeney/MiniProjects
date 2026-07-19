import React, { useState } from 'react'
import { FaceBox } from '../../../shared/types'

interface Props {
  faces: FaceBox[]
  onRename: (face: FaceBox, newName: string) => void
}

/** Draws clickable, editable boxes over detected faces (normalized coords). */
export default function FaceOverlay({ faces, onRename }: Props): JSX.Element {
  const [editing, setEditing] = useState<number | null>(null)
  const [value, setValue] = useState('')

  return (
    <div className="face-overlay">
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
            {editing === f.faceId ? (
              <input
                autoFocus
                className="face-label"
                style={{ width: 160 }}
                value={value}
                placeholder="Enter name…"
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
