/**
 * Groq client for meeting notes.
 *
 * Groq retires models fairly often (llama-3.1-70b-versatile, mixtral-8x7b-32768
 * and gemma-7b-it have all been decommissioned), and a hardcoded id turns into
 * a 404 the day that happens. So the model is *discovered* at runtime from the
 * live /models list and chosen by preference, with GROQ_MODEL as an override.
 */

const GROQ_BASE = 'https://api.groq.com/openai/v1'

/** Never usable for chat completions, whatever the list returns. */
const NOT_A_CHAT_MODEL = /whisper|tts|guard|embed|moderation|distil-whisper/i

/**
 * Ranked preferences, matched as patterns rather than exact ids so a newer
 * point release of the same family is picked up without a code change.
 * Highest score wins among whatever the account actually has access to.
 */
const PREFERENCES: { pattern: RegExp; score: number }[] = [
  { pattern: /kimi-k2/i, score: 100 },
  { pattern: /llama-3\.3-70b/i, score: 95 },
  { pattern: /gpt-oss-120b/i, score: 92 },
  { pattern: /llama-4-maverick/i, score: 88 },
  { pattern: /qwen3-32b/i, score: 84 },
  { pattern: /llama-4-scout/i, score: 80 },
  { pattern: /gpt-oss-20b/i, score: 76 },
  { pattern: /deepseek-r1-distill/i, score: 70 },
  { pattern: /llama-3\.1-8b-instant/i, score: 40 },
]

interface GroqModel {
  id: string
  active?: boolean
  context_window?: number
}

let modelCache: { ids: string[]; fetchedAt: number } | null = null
const MODEL_CACHE_MS = 10 * 60 * 1000

export function groqConfigured(): boolean {
  return !!process.env.GROQ_API_KEY?.trim()
}

function apiKey(): string {
  const key = process.env.GROQ_API_KEY?.trim()
  if (!key) throw new Error('GROQ_API_KEY is not set')
  return key
}

/** Chat-capable model ids this account can use, best first. */
async function listChatModels(): Promise<string[]> {
  if (modelCache && Date.now() - modelCache.fetchedAt < MODEL_CACHE_MS) {
    return modelCache.ids
  }

  const res = await fetch(`${GROQ_BASE}/models`, {
    headers: { Authorization: `Bearer ${apiKey()}` },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`Groq /models responded ${res.status}: ${await res.text().catch(() => '')}`)
  }

  const body = (await res.json()) as { data?: GroqModel[] }
  const usable = (body.data ?? [])
    .filter((m) => m.id && m.active !== false && !NOT_A_CHAT_MODEL.test(m.id))
    .map((m) => {
      const match = PREFERENCES.find((p) => p.pattern.test(m.id))
      return { id: m.id, score: match ? match.score : 10 }
    })
    .sort((a, b) => b.score - a.score)
    .map((m) => m.id)

  if (usable.length === 0) throw new Error('Groq returned no usable chat models')

  modelCache = { ids: usable, fetchedAt: Date.now() }
  return usable
}

/** Candidate models to try, honouring an explicit GROQ_MODEL first. */
async function candidates(): Promise<string[]> {
  const pinned = process.env.GROQ_MODEL?.trim()
  const discovered = await listChatModels()
  if (!pinned) return discovered
  // Keep the rest as fallbacks: a pinned model can be decommissioned too.
  return [pinned, ...discovered.filter((id) => id !== pinned)]
}

/** A model-level rejection, as opposed to a transient or auth failure. */
function isModelRejection(status: number, body: string): boolean {
  if (status === 404) return true
  if (status !== 400) return false
  return /decommission|deprecat|does not exist|not found|invalid model|unsupported model/i.test(
    body
  )
}

export interface GroqChatResult {
  text: string
  model: string
}

/**
 * One chat completion, retrying down the candidate list when a model turns out
 * to be gone. Returns which model actually answered so the UI can show it.
 */
export async function groqChat(options: {
  system: string
  user: string
  maxTokens?: number
  temperature?: number
}): Promise<GroqChatResult> {
  const models = await candidates()
  const errors: string[] = []

  // Try at most three: enough to ride out a retirement, not enough to hang.
  for (const model of models.slice(0, 3)) {
    const res = await fetch(`${GROQ_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      body: JSON.stringify({
        model,
        temperature: options.temperature ?? 0.2,
        max_tokens: options.maxTokens ?? 2048,
        messages: [
          { role: 'system', content: options.system },
          { role: 'user', content: options.user },
        ],
      }),
    })

    if (res.ok) {
      const body = (await res.json()) as {
        choices?: { message?: { content?: string } }[]
      }
      const text = body.choices?.[0]?.message?.content?.trim()
      if (text) return { text, model }
      errors.push(`${model}: empty response`)
      continue
    }

    const detail = await res.text().catch(() => '')
    errors.push(`${model}: ${res.status} ${detail.slice(0, 200)}`)

    if (isModelRejection(res.status, detail)) {
      // This model is gone - forget the cached list and try the next one.
      modelCache = null
      continue
    }
    // Auth, rate limit, or server error: retrying another model will not help.
    throw new Error(`Groq request failed (${res.status}): ${detail.slice(0, 300)}`)
  }

  throw new Error(`No Groq model accepted the request. Tried:\n${errors.join('\n')}`)
}
