import { ParsedIntent } from '../shared/types'

const SYSTEM_PROMPT = `You are the command parser for a photo/video slideshow app.
The user speaks or types short instructions. Convert the instruction into a single JSON object.

Allowed "action" values:
- "label_person": user wants to name/label a person in the current image.
    Fields: "name" (the person's name), "target" (which person, e.g. "unknown 1",
    "the man on the left", "person 2"; omit or use "current" if only one/unspecified).
- "set_metadata": user wants to add info about the current image.
    Optional fields: "description", "place", "year", "tags" (array of strings).
- "next": advance to next media.
- "previous": go to previous media.
- "pause": pause the slideshow.
- "play": resume the slideshow.
- "unknown": instruction not understood.

Respond ONLY with the JSON object, no prose. Include a short "reason".
Examples:
Input: "that's my grandmother Alice" -> {"action":"label_person","name":"Alice","target":"current","reason":"naming a person"}
Input: "label unknown 2 as Bob" -> {"action":"label_person","name":"Bob","target":"unknown 2","reason":"naming person"}
Input: "this was taken in Paris in 1998" -> {"action":"set_metadata","place":"Paris","year":"1998","reason":"location and year"}
Input: "add description: birthday party at the lake" -> {"action":"set_metadata","description":"birthday party at the lake","reason":"description"}
Input: "next photo" -> {"action":"next","reason":"advance"}`

interface OllamaChatResponse {
  message?: { content?: string }
  response?: string
}

/** Call Ollama to parse a natural-language instruction into a structured intent. */
export async function parseInstruction(
  ollamaUrl: string,
  model: string,
  text: string
): Promise<ParsedIntent> {
  const body = {
    model,
    stream: false,
    format: 'json',
    options: { temperature: 0 },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: text }
    ]
  }
  try {
    const res = await fetch(`${ollamaUrl.replace(/\/$/, '')}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    })
    if (!res.ok) {
      return { action: 'unknown', reason: `Ollama HTTP ${res.status}` }
    }
    const data = (await res.json()) as OllamaChatResponse
    const content = data.message?.content ?? data.response ?? ''
    const parsed = extractJson(content)
    if (!parsed) return { action: 'unknown', reason: 'Could not parse LLM output' }
    return normalizeIntent(parsed)
  } catch (err: any) {
    return { action: 'unknown', reason: `Ollama unreachable: ${err?.message ?? err}` }
  }
}

function extractJson(content: string): any | null {
  const trimmed = content.trim()
  try {
    return JSON.parse(trimmed)
  } catch {
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1))
      } catch {
        return null
      }
    }
    return null
  }
}

function normalizeIntent(obj: any): ParsedIntent {
  const allowed = [
    'label_person', 'set_metadata', 'next', 'previous', 'pause', 'play', 'unknown'
  ]
  const action = allowed.includes(obj?.action) ? obj.action : 'unknown'
  const intent: ParsedIntent = { action, reason: obj?.reason }
  if (obj?.name) intent.name = String(obj.name)
  if (obj?.target) intent.target = String(obj.target)
  if (obj?.description) intent.description = String(obj.description)
  if (obj?.place) intent.place = String(obj.place)
  if (obj?.year) intent.year = String(obj.year)
  if (Array.isArray(obj?.tags)) intent.tags = obj.tags.map((t: any) => String(t))
  return intent
}

/** Simple health check for the Ollama server. */
export async function ollamaHealth(ollamaUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${ollamaUrl.replace(/\/$/, '')}/api/tags`)
    return res.ok
  } catch {
    return false
  }
}
