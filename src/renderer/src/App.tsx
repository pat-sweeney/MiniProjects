import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  AppSettings,
  DEFAULT_SETTINGS,
  FaceBox,
  FilenameContext,
  ImageMetadata,
  MediaItem,
  ParsedIntent,
  PersonTag,
  TransitionType
} from '../../shared/types'
import Controls from './components/Controls'
import FileTree from './components/FileTree'
import SettingsPanel from './components/SettingsPanel'
import MetadataPanel from './components/MetadataPanel'
import MediaView from './components/MediaView'
import VoiceControl from './components/VoiceControl'
import UpdateToast from './components/UpdateToast'
import { enterClass, leaveClass, resolveTransition } from './lib/transitions'
import {
  getMetadata,
  getExif,
  health,
  initSidecar,
  relabelFace,
  scanFaces,
  setMetadata
} from './lib/sidecar'
import { VoiceSession } from './lib/voice'

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export default function App(): JSX.Element {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [media, setMedia] = useState<MediaItem[]>([])
  const [index, setIndex] = useState(0)
  const [prevItem, setPrevItem] = useState<MediaItem | null>(null)
  const [resolvedTransition, setResolvedTransition] =
    useState<Exclude<TransitionType, 'random'>>('fade')
  const [animKey, setAnimKey] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [faces, setFaces] = useState<FaceBox[]>([])
  const [labels, setLabels] = useState<PersonTag[]>([])
  const [detecting, setDetecting] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showTree, setShowTree] = useState(true)
  const [showMetadata, setShowMetadata] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [toast, setToast] = useState('')
  const [faceAvailable, setFaceAvailable] = useState(false)
  const [voiceAvailable, setVoiceAvailable] = useState(false)
  const [voiceOn, setVoiceOn] = useState(false)
  const [voicePartial, setVoicePartial] = useState('')
  const [lastVoiceAction, setLastVoiceAction] = useState('')

  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clearPrevTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const voiceRef = useRef<VoiceSession | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Refs mirroring state for use inside stable callbacks (voice/keyboard).
  const stateRef = useRef({ media, index, faces, settings, playing })
  stateRef.current = { media, index, faces, settings, playing }

  const current = media[index]

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 2600)
  }, [])

  // ---- Startup ----
  useEffect(() => {
    ;(async () => {
      await initSidecar()
      const s = await window.api.getSettings()
      setSettings(s)
      const h = await health()
      setFaceAvailable(!!h?.face_recognition)
      setVoiceAvailable(!!h?.vosk)
      if (s.localFolder || s.httpFolder) {
        await doScan(s)
      } else {
        setShowSettings(true)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const doScan = useCallback(async (s: AppSettings) => {
    setScanning(true)
    try {
      let items = await window.api.scanMedia(s.localFolder, s.httpFolder)
      if (s.shuffle) items = shuffleArray(items)
      setMedia(items)
      setIndex(0)
      setPrevItem(null)
      if (items.length === 0) showToast('No media found in the configured sources')
    } finally {
      setScanning(false)
    }
  }, [showToast])

  // ---- Transition-aware navigation ----
  const go = useCallback(
    (dir: 1 | -1 | number, absolute = false) => {
      const { media: m, index: i, settings: s } = stateRef.current
      if (m.length === 0) return
      let next: number
      if (absolute) next = dir
      else {
        next = i + (dir as number)
        if (next >= m.length) next = s.loop ? 0 : m.length - 1
        if (next < 0) next = s.loop ? m.length - 1 : 0
      }
      if (next === i && !absolute) return
      setPrevItem(m[i])
      setResolvedTransition(resolveTransition(s.transition))
      setAnimKey((k) => k + 1)
      setIndex(next)
      if (clearPrevTimer.current) clearTimeout(clearPrevTimer.current)
      clearPrevTimer.current = setTimeout(
        () => setPrevItem(null),
        Math.max(50, s.transitionMs)
      )
    },
    []
  )

  const next = useCallback(() => go(1), [go])
  const prev = useCallback(() => go(-1), [go])
  const goToIndex = useCallback((i: number) => go(i, true), [go])

  // ---- File-tree rename + LLM-suggested names ----
  const suggestName = useCallback(
    async (idx: number): Promise<string | null> => {
      const { media: m, settings: s } = stateRef.current
      const it = m[idx]
      if (!it) return null
      const ctx: FilenameContext = { currentName: it.name, kind: it.kind }
      try {
        const meta = await getMetadata(it.id)
        ctx.description = meta.description
        ctx.place = meta.place
        ctx.year = meta.year
      } catch {
        /* ignore */
      }
      if (it.kind === 'image') {
        try {
          const exif = await getExif(it.id)
          if (!ctx.year && exif.year) ctx.year = exif.year
          if (!ctx.place && exif.place) ctx.place = exif.place
          ctx.dateTaken = exif.dateTaken
          ctx.camera = exif.camera
        } catch {
          /* ignore */
        }
        if (s.faceRecognitionEnabled && faceAvailable) {
          try {
            const res = await scanFaces(it.id)
            if (res?.available) {
              ctx.people = res.faces
                .map((f) => f.name)
                .filter((n) => n && !/^unknown/i.test(n))
            }
          } catch {
            /* ignore */
          }
        }
      }
      const r = await window.api.suggestFilename(s.ollamaUrl, s.ollamaModel, ctx)
      return r?.name || null
    },
    [faceAvailable]
  )

  const renameItem = useCallback(
    async (idx: number, newBaseName: string): Promise<boolean> => {
      const it = stateRef.current.media[idx]
      if (!it) return false
      if (it.source !== 'local') {
        showToast('Rename is only supported for local files')
        return false
      }
      // Preserve any user metadata across the rename (sidecar keys it by path).
      let oldMeta: ImageMetadata | null = null
      try {
        oldMeta = await getMetadata(it.id)
      } catch {
        /* ignore */
      }
      const res = await window.api.renameFile(it.id, newBaseName)
      if (!res.ok || !res.id || !res.src || !res.name) {
        showToast(res.error || 'Rename failed')
        return false
      }
      const oldRel = it.relPath
      const slash = Math.max(oldRel.lastIndexOf('/'), oldRel.lastIndexOf('\\'))
      const newRel = (slash >= 0 ? oldRel.slice(0, slash + 1) : '') + res.name
      setMedia((prev) =>
        prev.map((mm, i) =>
          i === idx
            ? { ...mm, id: res.id!, src: res.src!, name: res.name!, relPath: newRel }
            : mm
        )
      )
      if (
        oldMeta &&
        (oldMeta.description ||
          oldMeta.place ||
          oldMeta.year ||
          (oldMeta.tags && oldMeta.tags.length))
      ) {
        try {
          await setMetadata({ ...oldMeta, path: res.id })
        } catch {
          /* ignore */
        }
      }
      showToast(`Renamed to “${res.name}”`)
      return true
    },
    [showToast]
  )

  // ---- Auto-advance timer (images only; videos self-advance) ----
  useEffect(() => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current)
    if (!playing || !current || current.kind !== 'image') return
    advanceTimer.current = setTimeout(
      () => go(1),
      Math.max(500, settings.intervalSeconds * 1000)
    )
    return () => {
      if (advanceTimer.current) clearTimeout(advanceTimer.current)
    }
  }, [playing, current, index, settings.intervalSeconds, go])

  // ---- Load persisted people labels for the current image (no detection) ----
  // Face detection is on-demand only; on display we just render the labels
  // that were previously saved into the image's metadata.
  useEffect(() => {
    setFaces([])
    setLabels([])
    if (!current || current.kind !== 'image') return
    let alive = true
    getMetadata(current.id).then((m) => {
      if (alive) setLabels(m.people || [])
    })
    return () => {
      alive = false
    }
  }, [current])

  /** Persist the given detected faces into the image's metadata as people. */
  const persistFacesAsMetadata = useCallback(
    async (itemId: string, detected: FaceBox[]): Promise<void> => {
      const people: PersonTag[] = detected.map((f) => ({
        name: f.name,
        top: f.top,
        right: f.right,
        bottom: f.bottom,
        left: f.left
      }))
      try {
        const meta = await getMetadata(itemId)
        await setMetadata({ ...meta, path: itemId, people })
      } catch {
        /* ignore */
      }
      const cur = stateRef.current.media[stateRef.current.index]
      if (cur && cur.id === itemId) setLabels(people)
    },
    []
  )

  const refreshFaces = useCallback(async () => {
    const { media: m, index: i } = stateRef.current
    const it = m[i]
    if (!it) return
    const res = await scanFaces(it.id)
    if (res?.available) {
      setFaces(res.faces)
      await persistFacesAsMetadata(it.id, res.faces)
    }
  }, [persistFacesAsMetadata])

  /** On-demand face detection for the current image (triggered by a button). */
  const detectFaces = useCallback(async () => {
    const { media: m, index: i } = stateRef.current
    const it = m[i]
    if (!it || it.kind !== 'image') return
    if (!faceAvailable) {
      showToast('Face detection unavailable — install the Python sidecar')
      return
    }
    setDetecting(true)
    try {
      const res = await scanFaces(it.id, true)
      if (!res?.available) {
        showToast('Face detection unavailable')
        return
      }
      setFaces(res.faces)
      await persistFacesAsMetadata(it.id, res.faces)
      showToast(
        res.faces.length
          ? `Detected ${res.faces.length} face${res.faces.length === 1 ? '' : 's'}`
          : 'No faces found in this image'
      )
    } finally {
      setDetecting(false)
    }
  }, [faceAvailable, showToast, persistFacesAsMetadata])

  // ---- Preload neighbouring images so transitions show real content ----
  // Without this, an incoming image can still be downloading from the NAS
  // while its layer animates, so swipes/zooms look like a blank "pop" (fade).
  useEffect(() => {
    if (media.length === 0) return
    const preloadAt = (idx: number): void => {
      const it = media[((idx % media.length) + media.length) % media.length]
      if (it && it.kind === 'image') {
        const img = new Image()
        img.src = it.src
      }
    }
    preloadAt(index + 1)
    preloadAt(index - 1)
  }, [index, media])

  const handleRenameFace = useCallback(
    async (face: FaceBox, name: string) => {
      const ok = await relabelFace(face.faceId, name)
      if (ok) {
        showToast(`Labeled as “${name}”`)
        await refreshFaces()
      } else {
        showToast('Could not label face')
      }
    },
    [refreshFaces, showToast]
  )

  // ---- Voice / LLM instruction handling ----
  const applyIntent = useCallback(
    async (intent: ParsedIntent) => {
      const { faces: f, media: m, index: i } = stateRef.current
      const it = m[i]
      switch (intent.action) {
        case 'next':
          go(1)
          setLastVoiceAction('▶ next')
          break
        case 'previous':
          go(-1)
          setLastVoiceAction('◀ previous')
          break
        case 'pause':
          setPlaying(false)
          setLastVoiceAction('⏸ paused')
          break
        case 'play':
          setPlaying(true)
          setLastVoiceAction('▶ playing')
          break
        case 'label_person': {
          if (!intent.name) {
            showToast('No name heard')
            break
          }
          const face = pickTargetFace(intent.target, f)
          if (!face) {
            showToast('No face to label on this image')
            break
          }
          const ok = await relabelFace(face.faceId, intent.name)
          if (ok) {
            showToast(`Labeled as “${intent.name}”`)
            setLastVoiceAction(`🏷 ${intent.name}`)
            await refreshFaces()
          }
          break
        }
        case 'set_metadata': {
          if (!it) break
          const existing = await getMetadata(it.id)
          const merged = {
            ...existing,
            description: intent.description ?? existing.description,
            place: intent.place ?? existing.place,
            year: intent.year ?? existing.year,
            tags: intent.tags
              ? Array.from(new Set([...existing.tags, ...intent.tags]))
              : existing.tags
          }
          await setMetadata({ ...merged, path: it.id })
          showToast('Metadata updated')
          setLastVoiceAction('🏷 metadata')
          break
        }
        default:
          showToast(`Not understood: ${intent.reason || ''}`)
      }
    },
    [go, refreshFaces, showToast]
  )

  const handleTranscript = useCallback(
    async (text: string) => {
      const { settings: s } = stateRef.current
      setVoicePartial('')
      setLastVoiceAction(`“${text}”`)
      const intent = await window.api.parseInstruction(s.ollamaUrl, s.ollamaModel, text)
      await applyIntent(intent)
    },
    [applyIntent]
  )

  const toggleVoice = useCallback(async () => {
    if (voiceOn) {
      voiceRef.current?.stop()
      voiceRef.current = null
      setVoiceOn(false)
      setVoicePartial('')
      return
    }
    if (!voiceAvailable) {
      showToast('Voice model not installed (see python/models)')
      return
    }
    const session = new VoiceSession(
      (p) => setVoicePartial(p),
      (finalText) => handleTranscript(finalText),
      (err) => showToast(err)
    )
    voiceRef.current = session
    await session.start()
    setVoiceOn(true)
  }, [voiceOn, voiceAvailable, handleTranscript, showToast])

  // ---- Keyboard shortcuts ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      switch (e.key) {
        case 'ArrowRight': go(1); break
        case 'ArrowLeft': go(-1); break
        case ' ':
          e.preventDefault()
          setPlaying((p) => !p)
          break
        case 'e': case 'E': setShowMetadata((v) => !v); break
        case 's': case 'S': setShowSettings((v) => !v); break
        case 't': case 'T': setShowTree((v) => !v); break
        case 'v': case 'V': toggleVoice(); break
        case 'f': case 'F': detectFaces(); break
        default: break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, toggleVoice, detectFaces])

  const saveSettings = useCallback(
    async (s: AppSettings) => {
      const saved = await window.api.setSettings(s)
      setSettings(saved)
      setShowSettings(false)
      await doScan(saved)
    },
    [doScan]
  )

  const onTransitionQuick = useCallback(
    async (t: TransitionType) => {
      const s = { ...stateRef.current.settings, transition: t }
      setSettings(s)
      await window.api.setSettings(s)
    },
    []
  )

  // ---- Render ----
  const enter = enterClass(resolvedTransition)
  const leave = leaveClass(resolvedTransition)
  const tms = { ['--tms' as any]: `${settings.transitionMs}ms` } as React.CSSProperties

  return (
    <div className={'app' + (showTree ? ' tree-open' : '')}>
      <FileTree
        items={media}
        currentId={current?.id}
        open={showTree}
        onSelect={goToIndex}
        onToggle={() => setShowTree((v) => !v)}
        onRename={renameItem}
        onSuggestName={suggestName}
      />
      <div className="stage" style={tms}>
        {prevItem && settings.transition !== 'none' && (
          <div className={`layer ${leave}`} key={`prev-${animKey}`}>
            <MediaView
              item={prevItem}
              muted
              videoSeconds={0}
              playing={false}
            />
          </div>
        )}
        {current && (
          <div className={`layer ${enter}`} key={`cur-${animKey}-${current.id}`}>
            <MediaView
              item={current}
              muted={settings.muteVideo}
              videoSeconds={settings.videoSeconds}
              playing={playing}
              faces={faces}
              labels={labels}
              onRename={handleRenameFace}
              onVideoDone={() => go(1)}
            />
          </div>
        )}

        {!current && !scanning && (
          <div className="empty">
            <h1>🖼 NAS Slideshow</h1>
            <p>
              No media loaded. Open Settings (⚙) and point the app at a local
              folder and/or an HTTP directory on your NAS. All subdirectories are
              scanned automatically.
            </p>
            <button className="primary" onClick={() => setShowSettings(true)}>
              Open Settings
            </button>
          </div>
        )}
        {scanning && (
          <div className="empty">
            <h1>Scanning…</h1>
            <p>Reading media from your sources (including subdirectories).</p>
          </div>
        )}
      </div>

      {toast && <div className="toast">{toast}</div>}

      <UpdateToast />

      <VoiceControl
        listening={voiceOn}
        partial={voicePartial}
        lastAction={lastVoiceAction}
      />

      <Controls
        playing={playing}
        current={current}
        index={index}
        total={media.length}
        transition={settings.transition}
        faceAvailable={faceAvailable}
        detecting={detecting}
        labelCount={labels.length}
        voiceOn={voiceOn}
        onPlayPause={() => setPlaying((p) => !p)}
        onPrev={prev}
        onNext={next}
        onTransition={onTransitionQuick}
        onDetectFaces={detectFaces}
        onToggleVoice={toggleVoice}
        onOpenMetadata={() => setShowMetadata(true)}
        onOpenSettings={() => setShowSettings(true)}
      />

      {showSettings && (
        <SettingsPanel
          settings={settings}
          faceAvailable={faceAvailable}
          voiceAvailable={voiceAvailable}
          onSave={saveSettings}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showMetadata && current && (
        <MetadataPanel
          item={current}
          onClose={() => setShowMetadata(false)}
          onSaved={() => showToast('Metadata saved')}
        />
      )}
    </div>
  )
}

/** Resolve which detected face a spoken/typed instruction refers to. */
function pickTargetFace(target: string | undefined, faces: FaceBox[]): FaceBox | null {
  if (faces.length === 0) return null
  if (!target || /current|this|the person|him|her|them/i.test(target)) {
    return faces[0]
  }
  const lower = target.toLowerCase()
  const unknownMatch = lower.match(/unknown\s*(\d+)/)
  if (unknownMatch) {
    const wanted = `unknown ${unknownMatch[1]}`
    const f = faces.find((x) => x.name.toLowerCase() === wanted)
    if (f) return f
  }
  const numMatch = lower.match(/(\d+)/)
  if (numMatch) {
    const idx = parseInt(numMatch[1], 10) - 1
    if (idx >= 0 && idx < faces.length) return faces[idx]
  }
  const byName = faces.find((x) => lower.includes(x.name.toLowerCase()))
  return byName || faces[0]
}
