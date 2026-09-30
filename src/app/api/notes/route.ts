import { NextResponse } from 'next/server'
import { MeetingNotes, TranscriptEntry } from '@/types'
import { groqChat, groqConfigured } from '@/lib/groq'
import { localNotes, transcriptToText } from '@/lib/notes'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const SYSTEM = `You write meeting notes from a raw transcript.

The transcript comes from live speech recognition, so expect mis-heard words,
missing punctuation and broken sentences. Read through the noise, but never
invent content: if something was not discussed, leave it out. If a section has
nothing in it, return an empty array rather than filling it.

Reply with ONLY a JSON object, no markdown fence and no commentary, shaped as:
{
  "summary": "2-4 sentences on what the meeting was about and where it landed",
  "keyPoints": ["the substantive points discussed"],
  "decisions": ["things explicitly decided or agreed"],
  "actionItems": [{"text": "what needs doing", "owner": "name, or omit if unclear"}]
}

Attribute an action item to someone only when the transcript makes the owner
clear. Write plainly, in the past tense, without filler.`

/** Pulls the JSON object out of a reply, tolerating a stray fence or preamble. */
function parseNotes(raw: string): Partial<MeetingNotes> | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = (fenced ? fenced[1] : raw).trim()
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as Partial<MeetingNotes>
  } catch {
    return null
  }
}

const asStrings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    : []

export async function POST(request: Request) {
  let entries: TranscriptEntry[] = []
  try {
    const body = (await request.json()) as { entries?: TranscriptEntry[] }
    entries = Array.isArray(body.entries) ? body.entries : []
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  if (entries.length === 0) {
    return NextResponse.json(
      { error: 'There is no transcript to work from yet.' },
      { status: 400 }
    )
  }

  // No key configured: still return useful notes rather than an error.
  if (!groqConfigured()) {
    return NextResponse.json({
      notes: localNotes(entries),
      fallback: true,
      reason: 'GROQ_API_KEY is not set, so notes were extracted without an AI model.',
    })
  }

  const transcript = transcriptToText(entries)
  // Groq context windows are large, but a long meeting can still overrun; keep
  // the most recent portion, which is where decisions and actions live.
  const MAX_CHARS = 60_000
  const trimmed =
    transcript.length > MAX_CHARS
      ? `[earlier discussion omitted]\n${transcript.slice(-MAX_CHARS)}`
      : transcript

  try {
    const { text, model } = await groqChat({
      system: SYSTEM,
      user: `Transcript:\n\n${trimmed}`,
      maxTokens: 2048,
      temperature: 0.2,
    })

    const parsed = parseNotes(text)
    if (!parsed) {
      return NextResponse.json({
        notes: localNotes(entries),
        fallback: true,
        reason: 'The model did not return usable JSON, so notes were extracted locally.',
      })
    }

    // The model is told to return objects, but a plain string list is a common
    // and harmless deviation — accept both rather than dropping the section.
    type Action = { text: string; owner?: string }
    const actionItems: Action[] = []
    if (Array.isArray(parsed.actionItems)) {
      for (const raw of parsed.actionItems as unknown[]) {
        if (typeof raw === 'string' && raw.trim()) {
          actionItems.push({ text: raw.trim() })
          continue
        }
        if (raw && typeof raw === 'object') {
          const item = raw as { text?: unknown; owner?: unknown }
          if (typeof item.text === 'string' && item.text.trim()) {
            actionItems.push({
              text: item.text.trim(),
              owner: typeof item.owner === 'string' && item.owner.trim() ? item.owner.trim() : undefined,
            })
          }
        }
      }
    }

    const notes: MeetingNotes = {
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
      keyPoints: asStrings(parsed.keyPoints),
      decisions: asStrings(parsed.decisions),
      actionItems,
      generatedBy: model,
      generatedAt: new Date().toISOString(),
    }

    return NextResponse.json({ notes, fallback: false })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[Notes] Groq request failed:', message)
    // A failed model call should not cost the user their notes.
    return NextResponse.json({
      notes: localNotes(entries),
      fallback: true,
      reason: `Groq could not be reached (${message.slice(0, 160)}), so notes were extracted locally.`,
    })
  }
}
