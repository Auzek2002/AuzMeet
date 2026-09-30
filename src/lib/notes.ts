import { MeetingNotes, TranscriptEntry } from '@/types'

/** Plain "Name: what they said" text, which is what the model reads. */
export function transcriptToText(entries: TranscriptEntry[]): string {
  return entries
    .map((entry) => {
      const time = new Date(entry.timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })
      return `[${time}] ${entry.speakerName}: ${entry.text}`
    })
    .join('\n')
}

const ACTION_CUES =
  /\b(?:i(?:'| a)?ll|we(?:'| wi)?ll|let(?:'|')?s|can you|could you|please|need to|needs to|going to|will send|follow up|action item|todo|to-do|assign)\b/i
const DECISION_CUES =
  /\b(?:we(?:'| ha)?ve decided|decision|agreed|we agree|let(?:'|')?s go with|final(?:ly|ised|ized)?|settled on|conclusion)\b/i

/**
 * Notes without an LLM.
 *
 * Deliberately extractive rather than inventive: it quotes real lines that look
 * like decisions or commitments instead of paraphrasing, because a wrong
 * paraphrase in meeting notes is worse than a slightly clumsy quote.
 */
export function localNotes(entries: TranscriptEntry[]): MeetingNotes {
  const speakers = new Map<string, number>()
  for (const entry of entries) {
    speakers.set(entry.speakerName, (speakers.get(entry.speakerName) ?? 0) + entry.text.length)
  }

  const ranked = Array.from(speakers.entries()).sort((a, b) => b[1] - a[1])
  const total = ranked.reduce((sum, [, chars]) => sum + chars, 0) || 1

  const decisions: string[] = []
  const actionItems: { text: string; owner?: string }[] = []
  const keyPoints: string[] = []

  for (const entry of entries) {
    if (entry.text.length < 25) continue
    if (DECISION_CUES.test(entry.text) && decisions.length < 10) {
      decisions.push(`${entry.speakerName}: ${entry.text}`)
    } else if (ACTION_CUES.test(entry.text) && actionItems.length < 15) {
      actionItems.push({ text: entry.text, owner: entry.speakerName })
    } else if (entry.text.length > 80 && keyPoints.length < 12) {
      keyPoints.push(`${entry.speakerName}: ${entry.text}`)
    }
  }

  const participation = ranked
    .map(([name, chars]) => `${name} (${Math.round((chars / total) * 100)}%)`)
    .join(', ')

  const summary = entries.length
    ? `Meeting with ${ranked.length} ${ranked.length === 1 ? 'speaker' : 'speakers'} and ` +
      `${entries.length} spoken segments. Share of talking: ${participation}. ` +
      `These notes were extracted from the transcript without an AI model, so they quote ` +
      `what was actually said rather than summarising it.`
    : 'No speech was captured, so there is nothing to summarise.'

  return {
    summary,
    keyPoints,
    decisions,
    actionItems,
    generatedBy: 'local',
    generatedAt: new Date().toISOString(),
  }
}

/** Notes as a Markdown file, for download or pasting into a doc. */
export function notesToMarkdown(
  notes: MeetingNotes,
  meta: { roomId: string; entries: TranscriptEntry[]; includeTranscript?: boolean }
): string {
  const lines: string[] = []
  const when = new Date(notes.generatedAt)

  lines.push(`# Meeting notes — ${meta.roomId}`)
  lines.push('')
  lines.push(`*${when.toLocaleString()}*`)
  lines.push('')

  const speakers = Array.from(new Set(meta.entries.map((e) => e.speakerName)))
  if (speakers.length > 0) {
    lines.push(`**Participants:** ${speakers.join(', ')}`)
    lines.push('')
  }

  lines.push('## Summary')
  lines.push('')
  lines.push(notes.summary || '_No summary._')
  lines.push('')

  if (notes.keyPoints.length > 0) {
    lines.push('## Key points')
    lines.push('')
    notes.keyPoints.forEach((point) => lines.push(`- ${point}`))
    lines.push('')
  }

  if (notes.decisions.length > 0) {
    lines.push('## Decisions')
    lines.push('')
    notes.decisions.forEach((decision) => lines.push(`- ${decision}`))
    lines.push('')
  }

  if (notes.actionItems.length > 0) {
    lines.push('## Action items')
    lines.push('')
    notes.actionItems.forEach((item) =>
      lines.push(`- [ ] ${item.owner ? `**${item.owner}** — ` : ''}${item.text}`)
    )
    lines.push('')
  }

  if (meta.includeTranscript && meta.entries.length > 0) {
    lines.push('## Full transcript')
    lines.push('')
    lines.push('```')
    lines.push(transcriptToText(meta.entries))
    lines.push('```')
    lines.push('')
  }

  lines.push('---')
  lines.push(
    notes.generatedBy === 'local'
      ? '_Extracted from the transcript by AuzMeet, without an AI model._'
      : `_Written by ${notes.generatedBy} via Groq, from the AuzMeet transcript. Worth a read-through before sharing._`
  )

  return lines.join('\n')
}

export function downloadMarkdown(markdown: string, filename: string): void {
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // Give the download a moment to start before releasing the blob.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
