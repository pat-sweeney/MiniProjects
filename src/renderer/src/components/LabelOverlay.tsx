import React from 'react'
import { PersonTag } from '../../../shared/types'

interface Props {
  people: PersonTag[]
}

/**
 * Read-only labels drawn over an image from persisted metadata (normalized
 * coords). This is render-only — the underlying image file is never modified.
 */
export default function LabelOverlay({ people }: Props): JSX.Element {
  return (
    <div className="face-overlay">
      {people.map((p, i) => {
        const style: React.CSSProperties = {
          left: `${p.left * 100}%`,
          top: `${p.top * 100}%`,
          width: `${(p.right - p.left) * 100}%`,
          height: `${(p.bottom - p.top) * 100}%`
        }
        const isUnknown = /^unknown/i.test(p.name)
        return (
          <div key={`${p.name}-${i}`} className="face-box readonly" style={style}>
            <span className={'face-label' + (isUnknown ? ' unknown' : '')}>
              {p.name}
            </span>
          </div>
        )
      })}
    </div>
  )
}
