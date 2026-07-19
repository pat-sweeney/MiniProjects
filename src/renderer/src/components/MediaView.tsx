import React, { useEffect, useRef } from 'react'
import { FaceBox, MediaItem } from '../../../shared/types'
import FaceOverlay from './FaceOverlay'

interface Props {
  item: MediaItem
  muted: boolean
  videoSeconds: number
  playing: boolean
  faces?: FaceBox[]
  showFaces?: boolean
  onRename?: (face: FaceBox, name: string) => void
  onVideoDone?: () => void
}

/** Renders a single image or video. Videos play `videoSeconds` then signal done. */
export default function MediaView({
  item,
  muted,
  videoSeconds,
  playing,
  faces = [],
  showFaces = false,
  onRename,
  onVideoDone
}: Props): JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null)
  const doneRef = useRef(false)

  useEffect(() => {
    doneRef.current = false
  }, [item.id])

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    if (playing) v.play().catch(() => {})
    else v.pause()
  }, [playing, item.id])

  const finish = (): void => {
    if (doneRef.current) return
    doneRef.current = true
    onVideoDone?.()
  }

  if (item.kind === 'video') {
    return (
      <div className="media-wrap">
        <video
          ref={videoRef}
          src={item.src}
          autoPlay={playing}
          muted={muted}
          playsInline
          onTimeUpdate={(e) => {
            const v = e.currentTarget
            if (videoSeconds > 0 && v.currentTime >= videoSeconds) finish()
          }}
          onEnded={finish}
          onError={finish}
        />
      </div>
    )
  }

  return (
    <div className="media-wrap">
      <img src={item.src} alt={item.name} draggable={false} />
      {showFaces && onRename && <FaceOverlay faces={faces} onRename={onRename} />}
    </div>
  )
}
