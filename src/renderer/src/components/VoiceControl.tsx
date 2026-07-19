import React from 'react'

interface Props {
  listening: boolean
  partial: string
  lastAction: string
}

export default function VoiceControl({ listening, partial, lastAction }: Props): JSX.Element | null {
  if (!listening && !lastAction) return null
  return (
    <div className="voice-hud">
      {listening && <span className="dot-rec" />}
      {partial ? `“${partial}”` : lastAction || 'Listening…'}
    </div>
  )
}
