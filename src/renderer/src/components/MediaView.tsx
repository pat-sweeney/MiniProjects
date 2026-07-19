import React, { useEffect, useRef } from 'react'
import { FaceBox, MediaItem, PersonTag } from '../../../shared/types'
import FaceOverlay from './FaceOverlay'
import LabelOverlay from './LabelOverlay'

interface Props {
  item: MediaItem
  muted: boolean
  videoSeconds: number
  playing: boolean
  faces?: FaceBox[]
  labels?: PersonTag[]
  onRename?: (face: FaceBox, name: string) => void
  onCtrlClickPoint?: (x: number, y: number) => void
  onVideoDone?: () => void
}

/** Renders a single image or video. Videos play `videoSeconds` then signal done. */
export default function MediaView({
  item,
  muted,
  videoSeconds,
  playing,
  faces = [],
  labels = [],
  onRename,
  onCtrlClickPoint,
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
      <img
        src={item.src}
        alt={item.name}
        draggable={false}
        onClick={(e) => {
          // Ctrl/⌘-click: probe for a face at this point (see App.detectFaceAt).
          if (!onCtrlClickPoint || !(e.ctrlKey || e.metaKey)) return
          e.preventDefault()
          e.stopPropagation()
          const r = e.currentTarget.getBoundingClientRect()
          if (r.width === 0 || r.height === 0) return
          const x = (e.clientX - r.left) / r.width
          const y = (e.clientY - r.top) / r.height
          onCtrlClickPoint(Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y)))
        }}
      />
      {faces.length > 0 && onRename ? (
        <FaceOverlay faces={faces} onRename={onRename} />
      ) : labels.length > 0 ? (
        <LabelOverlay people={labels} />
      ) : null}
    </div>
  )
}
