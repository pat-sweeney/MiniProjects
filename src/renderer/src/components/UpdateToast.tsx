import React, { useEffect, useState } from 'react'

interface UpdateState {
  status: 'idle' | 'available' | 'progress' | 'downloaded' | 'error'
  version?: string
  percent?: number
  message?: string
}

/** Listens to auto-updater IPC events and surfaces a small status toast. */
export default function UpdateToast(): JSX.Element | null {
  const [state, setState] = useState<UpdateState>({ status: 'idle' })
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!window.api?.onUpdateEvent) return
    const off = window.api.onUpdateEvent((type, payload: any) => {
      setDismissed(false)
      switch (type) {
        case 'update:available':
          setState({ status: 'available', version: payload?.version })
          break
        case 'update:progress':
          setState({ status: 'progress', percent: Math.round(payload?.percent ?? 0) })
          break
        case 'update:downloaded':
          setState({ status: 'downloaded', version: payload?.version })
          break
        case 'update:error':
          setState({ status: 'error', message: String(payload ?? 'update error') })
          break
        default:
          break
      }
    })
    return off
  }, [])

  if (dismissed || state.status === 'idle') return null

  let text = ''
  if (state.status === 'available') text = `⬇ Downloading update ${state.version ?? ''}…`
  else if (state.status === 'progress') text = `⬇ Update downloading… ${state.percent}%`
  else if (state.status === 'downloaded')
    text = `✓ Update ${state.version ?? ''} ready — restart to apply`
  else if (state.status === 'error') text = `⚠ Update error: ${state.message}`

  return (
    <div className="update-toast">
      <span>{text}</span>
      <button className="update-x" onClick={() => setDismissed(true)}>✕</button>
    </div>
  )
}
