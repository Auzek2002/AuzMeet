import { NextResponse } from 'next/server'
import { CatchUpBrief, TranscriptEntry } from '@/types'
import { groqChat, groqConfigured } from '@/lib/groq'
import { transcriptToText } from '@/lib/notes'

export const dynamic = 'force-dynamic'
export const maxDuration = 45

/**
 * Deliberately not the same prompt as the meeting notes.
 *
 * Notes are a record written after the fact. A catch-up is orientation written
 * for someone walking into a conversation already in progress: they need to
 * know where things stand and what is being talked about *right now*, far more
 * than they need a tidy history.
 */
const SYSTEM = `Someone has just joined a meeting that was already underway, or
stepped away and come back. Brief them on what they missed.

The transcript comes from live speech recognition, so expect mis-heard words and
broken sentences. Read through the noise. Never invent anything: if the
transcript does not say it, leave it out.

Write for someone who needs to start participating in the next few seconds. Be
direct and brief. No preamble, no "in this meeting".

Reply with ONLY a JSON object, no markdown fence, shaped as:
{
  "headline": "one sentence on what this meeting is about",
  "missed": ["the few things that actually matter from what they missed, most important first"],
  "currentTopic": "what is being discussed right now, in one sentence",
  "openQuestions": ["anything left unresolved or awaiting an answer"],
  "mentionsOfYou": ["anything addressed to them by name, or empty"]
}

Keep "missed" to at most 5 items. Prefer decisions and commitments over
chatter. If almost nothing of substance was said, say so plainly in the
headline and return empty arrays.`

const asStrings = (value: unknown, limit: number): string[] =>
  Array.isArray(value)
    ? value
        .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
        .map((v) => v.trim())
        .slice(0, limit)
    : []

export async function POST(request: Request) {
  let entries: TranscriptEntry[] = []
  let viewerName = ''
  try {
    const body = (await request.json()) as { entries?: TranscriptEntry[]; viewerName?: string }
    entries = Array.isArray(body.entries) ? body.entries : []
    viewerName = typeof body.viewerName === 'string' ? body.viewerName : ''
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  if (entries.length === 0) {
    return NextResponse.json(
      { error: 'Nothing was captured before you joined, so there is nothing to catch up on.' },
      { status: 400 }
    )
  }

  if (!groqConfigured()) {
    return NextResponse.json(
      {
        error:
          'Catch-up needs an AI model. Set GROQ_API_KEY on the server, or read the transcript in the Notes panel.',
      },
      { status: 503 }
    )
  }

  const transcript = transcriptToText(entries)
  // The end of the transcript is what matters most for orientation, so when a
  // meeting is long, keep the most recent part rather than the beginning.
  const MAX_CHARS = 40_000
  const trimmed =
    transcript.length > MAX_CHARS
      ? `[earlier discussion omitted]\n${transcript.slice(-MAX_CHARS)}`
      : transcript

  try {
    const { text, model } = await groqChat({
      system: SYSTEM,
      user: viewerName
        ? `The person being briefed is called "${viewerName}".\n\nTranscript:\n\n${trimmed}`
        : `Transcript:\n\n${trimmed}`,
      maxTokens: 1024,
      temperature: 0.2,
    })

    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    const candidate = (fenced ? fenced[1] : text).trim()
    const start = candidate.indexOf('{')
    const end = candidate.lastIndexOf('}')
    if (start === -1 || end <= start) {
      return NextResponse.json(
        { error: 'The model did not return a usable brief. Try again.' },
        { status: 502 }
      )
    }

    const parsed = JSON.parse(candidate.slice(start, end + 1)) as Partial<CatchUpBrief>

    const brief: CatchUpBrief = {
      headline: typeof parsed.headline === 'string' ? parsed.headline.trim() : '',
      missed: asStrings(parsed.missed, 5),
      currentTopic: typeof parsed.currentTopic === 'string' ? parsed.currentTopic.trim() : '',
      openQuestions: asStrings(parsed.openQuestions, 5),
      mentionsOfYou: asStrings(parsed.mentionsOfYou, 3),
      coveredEntries: entries.length,
      generatedBy: model,
      generatedAt: new Date().toISOString(),
    }

    return NextResponse.json({ brief })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[CatchUp] failed:', message)
    return NextResponse.json(
      { error: `Could not generate the brief (${message.slice(0, 160)}).` },
      { status: 502 }
    )
  }
}
