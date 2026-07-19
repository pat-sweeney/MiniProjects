import React, { useState } from 'react'
import { AppSettings } from '../../../shared/types'
import { TRANSITION_OPTIONS } from '../lib/transitions'

interface Props {
  settings: AppSettings
  faceAvailable: boolean
  voiceAvailable: boolean
  onSave: (s: AppSettings) => void
  onClose: () => void
}

export default function SettingsPanel({
  settings, faceAvailable, voiceAvailable, onSave, onClose
}: Props): JSX.Element {
  const [s, setS] = useState<AppSettings>(settings)

  const set = <K extends keyof AppSettings>(k: K, v: AppSettings[K]): void =>
    setS((prev) => ({ ...prev, [k]: v }))

  const pickFolder = async (): Promise<void> => {
    const p = await window.api.pickFolder()
    if (p) set('localFolder', p)
  }

  return (
    <div className="panel">
      <button className="close-x" onClick={onClose}>✕</button>
      <h2>Settings</h2>

      <div className="row">
        <label>Local folder (scanned recursively)</label>
        <div className="row-2">
          <input
            value={s.localFolder}
            placeholder="D:\Photos"
            onChange={(e) => set('localFolder', e.target.value)}
          />
          <button style={{ flex: '0 0 auto' }} onClick={pickFolder}>Browse…</button>
        </div>
      </div>

      <div className="row">
        <label>NAS / HTTP folder URL (directory listing)</label>
        <input
          value={s.httpFolder}
          placeholder="http://nas.local/photos/"
          onChange={(e) => set('httpFolder', e.target.value)}
        />
      </div>

      <div className="row row-2">
        <div>
          <label>Image duration (s)</label>
          <input
            type="number" min={1}
            value={s.intervalSeconds}
            onChange={(e) => set('intervalSeconds', Number(e.target.value))}
          />
        </div>
        <div>
          <label>Video preview (s, 0=full)</label>
          <input
            type="number" min={0}
            value={s.videoSeconds}
            onChange={(e) => set('videoSeconds', Number(e.target.value))}
          />
        </div>
      </div>

      <div className="row row-2">
        <div>
          <label>Transition</label>
          <select
            value={s.transition}
            onChange={(e) => set('transition', e.target.value as any)}
          >
            {TRANSITION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label>Transition speed (ms)</label>
          <input
            type="number" min={0} step={100}
            value={s.transitionMs}
            onChange={(e) => set('transitionMs', Number(e.target.value))}
          />
        </div>
      </div>

      <div className="row row-2">
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="checkbox" style={{ width: 'auto' }}
            checked={s.shuffle}
            onChange={(e) => set('shuffle', e.target.checked)}
          />
          Shuffle
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="checkbox" style={{ width: 'auto' }}
            checked={s.loop}
            onChange={(e) => set('loop', e.target.checked)}
          />
          Loop
        </label>
      </div>

      <div className="row row-2">
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="checkbox" style={{ width: 'auto' }}
            checked={s.muteVideo}
            onChange={(e) => set('muteVideo', e.target.checked)}
          />
          Mute video audio
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="checkbox" style={{ width: 'auto' }}
            disabled={!faceAvailable}
            checked={s.faceRecognitionEnabled && faceAvailable}
            onChange={(e) => set('faceRecognitionEnabled', e.target.checked)}
          />
          Face recognition {faceAvailable ? '' : '(unavailable)'}
        </label>
      </div>

      <div className="row">
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="checkbox" style={{ width: 'auto' }}
            disabled={!voiceAvailable}
            checked={s.voiceEnabled && voiceAvailable}
            onChange={(e) => set('voiceEnabled', e.target.checked)}
          />
          Voice control {voiceAvailable ? '' : '(model not installed)'}
        </label>
      </div>

      <hr style={{ borderColor: 'var(--border)', margin: '16px 0' }} />

      <div className="row row-2">
        <div>
          <label>Ollama URL</label>
          <input
            value={s.ollamaUrl}
            onChange={(e) => set('ollamaUrl', e.target.value)}
          />
        </div>
        <div>
          <label>Ollama model</label>
          <input
            value={s.ollamaModel}
            onChange={(e) => set('ollamaModel', e.target.value)}
          />
        </div>
      </div>

      <div className="actions">
        <button className="primary" onClick={() => onSave(s)}>Save & Rescan</button>
        <button onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}
