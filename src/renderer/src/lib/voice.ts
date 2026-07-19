import { sidecarBase } from './sidecar'

/**
 * Captures microphone audio, resamples it to 16 kHz mono PCM16 and streams the
 * frames to the Python sidecar's /voice WebSocket (Vosk). Emits partial and
 * final transcripts.
 */
export class VoiceSession {
  private ws: WebSocket | null = null
  private ctx: AudioContext | null = null
  private processor: ScriptProcessorNode | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private stream: MediaStream | null = null
  private onPartial: (t: string) => void
  private onFinal: (t: string) => void
  private onError: (msg: string) => void

  constructor(
    onPartial: (t: string) => void,
    onFinal: (t: string) => void,
    onError: (msg: string) => void
  ) {
    this.onPartial = onPartial
    this.onFinal = onFinal
    this.onError = onError
  }

  async start(): Promise<void> {
    const wsUrl = sidecarBase().replace(/^http/, 'ws') + '/voice'
    this.ws = new WebSocket(wsUrl)
    this.ws.binaryType = 'arraybuffer'
    this.ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data)
        if (msg.partial) this.onPartial(msg.partial)
        else if (msg.final) this.onFinal(msg.final)
        else if (msg.error) this.onError(msg.error)
      } catch {
        /* ignore */
      }
    }
    this.ws.onerror = () => this.onError('voice connection error')

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (e: any) {
      this.onError('microphone access denied')
      return
    }

    this.ctx = new AudioContext()
    this.source = this.ctx.createMediaStreamSource(this.stream)
    this.processor = this.ctx.createScriptProcessor(4096, 1, 1)
    const inRate = this.ctx.sampleRate

    this.processor.onaudioprocess = (e) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
      const input = e.inputBuffer.getChannelData(0)
      const pcm = downsampleTo16k(input, inRate)
      this.ws.send(pcm.buffer)
    }

    this.source.connect(this.processor)
    this.processor.connect(this.ctx.destination)
  }

  stop(): void {
    try {
      this.processor?.disconnect()
      this.source?.disconnect()
      this.ctx?.close()
      this.stream?.getTracks().forEach((t) => t.stop())
      this.ws?.close()
    } catch {
      /* ignore */
    }
    this.processor = null
    this.source = null
    this.ctx = null
    this.stream = null
    this.ws = null
  }
}

/** Linear resample float32 [-1,1] audio to 16 kHz Int16 PCM. */
function downsampleTo16k(input: Float32Array, inRate: number): Int16Array {
  const outRate = 16000
  if (inRate === outRate) {
    return floatToInt16(input)
  }
  const ratio = inRate / outRate
  const outLen = Math.floor(input.length / ratio)
  const out = new Int16Array(outLen)
  for (let i = 0; i < outLen; i++) {
    const idx = i * ratio
    const i0 = Math.floor(idx)
    const i1 = Math.min(i0 + 1, input.length - 1)
    const frac = idx - i0
    const sample = input[i0] * (1 - frac) + input[i1] * frac
    const s = Math.max(-1, Math.min(1, sample))
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return out
}

function floatToInt16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length)
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]))
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return out
}
