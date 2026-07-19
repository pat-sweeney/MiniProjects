import { spawn, ChildProcess } from 'child_process'
import { join } from 'path'
import { app } from 'electron'
import { existsSync } from 'fs'

let child: ChildProcess | null = null
let sidecarPort = 8756

function pythonCandidates(): string[] {
  // Prefer a bundled venv if present, then system interpreters.
  const venvWin = join(process.cwd(), 'python', '.venv', 'Scripts', 'python.exe')
  const venvNix = join(process.cwd(), 'python', '.venv', 'bin', 'python')
  const list = [venvWin, venvNix, 'python', 'python3']
  return list
}

/** Path to a self-contained PyInstaller-built sidecar, if bundled with the app. */
function bundledExePath(): string | null {
  const exe = process.platform === 'win32' ? 'sidecar.exe' : 'sidecar'
  const candidates = [
    join(process.resourcesPath || '', 'python', exe),
    join(process.resourcesPath || '', 'sidecar', exe),
    join(process.cwd(), 'dist-sidecar', exe)
  ]
  for (const c of candidates) {
    if (c && existsSync(c)) return c
  }
  return null
}

function sidecarScriptPath(): string {
  // In dev the script lives in ./python; when packaged it is under resources.
  const devPath = join(process.cwd(), 'python', 'sidecar.py')
  if (existsSync(devPath)) return devPath
  return join(process.resourcesPath || process.cwd(), 'python', 'sidecar.py')
}

export function getSidecarPort(): number {
  return sidecarPort
}

/**
 * Spawn the Python FastAPI sidecar. Failure is non-fatal: the app still runs
 * as a plain slideshow, and face/voice features report as unavailable.
 */
export async function startSidecar(port = 8756): Promise<boolean> {
  sidecarPort = port

  // Build the ordered list of launch attempts: a self-contained bundled
  // executable first, then a Python interpreter running the script.
  const attempts: { cmd: string; args: string[] }[] = []
  const exe = bundledExePath()
  if (exe) attempts.push({ cmd: exe, args: ['--port', String(port)] })

  const script = sidecarScriptPath()
  if (existsSync(script)) {
    for (const py of pythonCandidates()) {
      attempts.push({ cmd: py, args: [script, '--port', String(port)] })
    }
  }

  if (attempts.length === 0) {
    console.warn('[sidecar] no bundled exe or script found')
    return false
  }

  const cwd = existsSync(join(process.cwd(), 'python'))
    ? join(process.cwd(), 'python')
    : process.cwd()

  for (const attempt of attempts) {
    try {
      const proc = spawn(attempt.cmd, attempt.args, {
        cwd,
        env: { ...process.env, PYTHONUNBUFFERED: '1' },
        stdio: ['ignore', 'pipe', 'pipe']
      })
      let started = false
      proc.stdout?.on('data', (d) => process.stdout.write(`[sidecar] ${d}`))
      proc.stderr?.on('data', (d) => process.stderr.write(`[sidecar] ${d}`))
      const ok = await new Promise<boolean>((resolve) => {
        const to = setTimeout(() => resolve(false), 1500)
        proc.on('error', () => {
          clearTimeout(to)
          resolve(false)
        })
        proc.on('exit', (code) => {
          if (!started) {
            clearTimeout(to)
            resolve(false)
          }
          console.warn('[sidecar] exited with code', code)
        })
        // Give the process a moment to not immediately die.
        setTimeout(() => {
          started = true
          clearTimeout(to)
          resolve(true)
        }, 800)
      })
      if (ok) {
        child = proc
        // Wait until the HTTP server answers /health.
        const healthy = await waitForHealth(port, 25000)
        return healthy
      } else {
        proc.kill()
      }
    } catch {
      // try next candidate
    }
  }
  console.warn('[sidecar] no working sidecar launcher found')
  return false
}

async function waitForHealth(port: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`)
      if (res.ok) return true
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}

export function stopSidecar(): void {
  if (child && !child.killed) {
    child.kill()
    child = null
  }
}

app.on('will-quit', stopSidecar)
