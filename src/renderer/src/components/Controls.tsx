import React from 'react'
import { MediaItem, TransitionType } from '../../../shared/types'
import { TRANSITION_OPTIONS } from '../lib/transitions'

interface Props {
  playing: boolean
  current?: MediaItem
  index: number
  total: number
  transition: TransitionType
  faceAvailable: boolean
  detecting: boolean
  labelCount: number
  showLabels: boolean
  searchOpen: boolean
  voiceOn: boolean
  onPlayPause: () => void
  onPrev: () => void
  onNext: () => void
  onTransition: (t: TransitionType) => void
  onDetectFaces: () => void
  onToggleLabels: () => void
  onToggleSearch: () => void
  onToggleVoice: () => void
  onOpenMetadata: () => void
  onOpenSettings: () => void
}

export default function Controls(props: Props): JSX.Element {
  const {
    playing, current, index, total, transition, faceAvailable, detecting,
    labelCount, showLabels, searchOpen, voiceOn, onPlayPause, onPrev, onNext,
    onTransition, onDetectFaces, onToggleLabels, onToggleSearch, onToggleVoice,
    onOpenMetadata, onOpenSettings
  } = props

  const isImage = current?.kind === 'image'

  return (
    <div className="controls">
      <button className="icon" onClick={onPrev} title="Previous (←)">⏮</button>
      <button className="icon primary" onClick={onPlayPause} title="Play/Pause (space)">
        {playing ? '⏸' : '▶'}
      </button>
      <button className="icon" onClick={onNext} title="Next (→)">⏭</button>

      <select
        value={transition}
        onChange={(e) => onTransition(e.target.value as TransitionType)}
        style={{ width: 150 }}
        title="Transition"
      >
        {TRANSITION_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      <span className="caption">
        {current ? `${index + 1}/${total} · ${current.relPath}` : 'No media'}
      </span>

      <span className="spacer" />

      <button
        className={'icon' + (searchOpen ? ' primary' : '')}
        onClick={onToggleSearch}
        title="Search tags, date, people (/)"
      >
        🔍 search
      </button>
      <button
        className={'icon' + (labelCount > 0 ? ' primary' : '')}
        onClick={onDetectFaces}
        disabled={!isImage || !faceAvailable || detecting}
        title={
          faceAvailable
            ? 'Detect & label faces (F)'
            : 'Face detection unavailable (Python sidecar not running)'
        }
      >
        {detecting ? '⏳' : '🙂'} {labelCount > 0 ? labelCount : 'faces'}
      </button>
      <button
        className={'icon' + (showLabels ? ' primary' : '')}
        onClick={onToggleLabels}
        title={showLabels ? 'Hide name labels (L)' : 'Show name labels (L)'}
      >
        {showLabels ? '🏷' : '🚫'} labels
      </button>
      <button className={'icon' + (voiceOn ? ' primary' : '')} onClick={onToggleVoice} title="Voice control (V)">
        🎤
      </button>
      <button className="icon" onClick={onOpenMetadata} title="Edit metadata (E)">🏷</button>
      <button className="icon" onClick={onOpenSettings} title="Settings (S)">⚙</button>
    </div>
  )
}
