// ─────────────────────────────────────────────────────────────────────────────
// adaptiveCard.js
// ─────────────────────────────────────────────────────────────────────────────
// Converts a shift-log markdown string (as produced by Checklist.buildPost /
// buildNightAuditPost) into an Adaptive Card 1.5 payload, wrapped in the
// Teams Workflows envelope that the "Post to a channel when a webhook request
// is received" flow expects.
//
// The same markdown subset supported by PostPreview.jsx is supported here:
//   ## Title
//   ### Section header
//   ---                         (divider, mostly dropped — headers carry spacing)
//   **Bold label only line**
//   **Key:** value              (inline bold)
//   - bullet item
//   | col | col |               (pipe tables, skip |---|)
//   [text](url)                 (markdown links — pass through, AC TextBlock
//                                renders basic markdown)
// ─────────────────────────────────────────────────────────────────────────────

import { normalizePostPreviewText } from './utils'

const ADAPTIVE_CARD_SCHEMA = 'http://adaptivecards.io/schemas/adaptive-card.json'
const ADAPTIVE_CARD_VERSION = '1.5'
const ADAPTIVE_CARD_CONTENT_TYPE = 'application/vnd.microsoft.card.adaptive'

/** Strip leading/trailing markdown bold markers so we can emphasize via AC. */
function stripBold(text) {
  return String(text || '').replace(/^\*\*|\*\*$/g, '').trim()
}

/** Split a markdown pipe-table block into trimmed cell rows, skipping |---|. */
function parseTableRows(lines) {
  return lines
    .map(line =>
      line.split('|')
        .filter((_, i, a) => i > 0 && i < a.length - 1)
        .map(cell => cell.trim())
    )
    .filter(row => !row.every(cell => /^[-: ]+$/.test(cell)))
}

/** Build a header TextBlock — used for ## / ### lines. */
function heading(text, { large = false } = {}) {
  return {
    type: 'TextBlock',
    text: stripBold(text),
    size: large ? 'Large' : 'Medium',
    weight: 'Bolder',
    color: 'Accent',
    wrap: true,
    separator: !large,
    spacing: large ? 'None' : 'Medium',
  }
}

/** Render a pipe-table as a ColumnSet-based table with a shaded header row. */
function renderTable(headers, rows) {
  const colCount = headers.length

  const headerRow = {
    type: 'ColumnSet',
    style: 'emphasis',
    columns: headers.map(h => ({
      type: 'Column',
      width: 'stretch',
      items: [{
        type: 'TextBlock',
        text: stripBold(h) || ' ',
        weight: 'Bolder',
        wrap: true,
      }],
    })),
  }

  const bodyRows = rows.map((row, i) => ({
    type: 'ColumnSet',
    separator: true,
    spacing: 'Small',
    columns: Array.from({ length: colCount }, (_, k) => ({
      type: 'Column',
      width: 'stretch',
      items: [{
        type: 'TextBlock',
        // Pass through — AC TextBlock renders **bold**, _italic_, [link](url).
        text: (row[k] ?? '').trim() || ' ',
        wrap: true,
      }],
    })),
  }))

  return {
    type: 'Container',
    spacing: 'Small',
    items: [headerRow, ...bodyRows],
  }
}

/** Build the Adaptive Card `body` array from normalized shift-log markdown. */
export function buildCardBody(postText) {
  if (!postText) return []

  const normalized = normalizePostPreviewText(postText)
  const lines = normalized.split('\n')
  const body = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // ── ## Main title ──────────────────────────────────────────────────────
    if (line.startsWith('## ')) {
      body.push(heading(line.slice(3), { large: true }))
      i++
      continue
    }

    // ── ### Section header ─────────────────────────────────────────────────
    if (line.startsWith('### ')) {
      body.push(heading(line.slice(4)))
      i++
      continue
    }

    // ── --- divider — skip (headers + ColumnSet spacing carry visual weight)
    if (line === '---') {
      i++
      continue
    }

    // ── | table block | ────────────────────────────────────────────────────
    if (line.startsWith('|')) {
      const tableLines = []
      while (i < lines.length && lines[i].startsWith('|')) {
        tableLines.push(lines[i])
        i++
      }
      const rows = parseTableRows(tableLines)
      if (rows.length > 0) {
        const [head, ...rest] = rows
        body.push(renderTable(head, rest))
      }
      continue
    }

    // ── - bullet list block ────────────────────────────────────────────────
    if (line.startsWith('- ')) {
      const items = []
      while (i < lines.length && lines[i].startsWith('- ')) {
        items.push(lines[i].slice(2))
        i++
      }
      // TextBlock's markdown understands `- item` bullets when rendered in
      // Teams, so emit the whole block as one wrapping TextBlock.
      body.push({
        type: 'TextBlock',
        text: items.map(it => `- ${it}`).join('\n'),
        wrap: true,
        spacing: 'Small',
      })
      continue
    }

    // ── **Bold-only label line** e.g. "**Guest Request Details:**" ─────────
    if (/^\*\*[^*]+\*\*:?\s*$/.test(line)) {
      body.push({
        type: 'TextBlock',
        text: stripBold(line.replace(/:\s*$/, '')) + ':',
        weight: 'Bolder',
        wrap: true,
        spacing: 'Small',
      })
      i++
      continue
    }

    // ── blank line — skip ──────────────────────────────────────────────────
    if (line === '') {
      i++
      continue
    }

    // ── Default: paragraph TextBlock (markdown inlines are preserved) ──────
    body.push({
      type: 'TextBlock',
      text: line,
      wrap: true,
      spacing: 'Small',
    })
    i++
  }

  return body
}

/** Build a full Adaptive Card JSON object (ready to drop into an attachment). */
export function buildAdaptiveCard(postText) {
  return {
    type: 'AdaptiveCard',
    $schema: ADAPTIVE_CARD_SCHEMA,
    version: ADAPTIVE_CARD_VERSION,
    body: buildCardBody(postText),
    msteams: { width: 'Full' },
  }
}

/**
 * Wrap an Adaptive Card in the Teams Workflows message envelope.
 * The "Post to a channel when a webhook request is received" flow template
 * accepts exactly this shape and posts the card to the channel.
 */
export function buildTeamsMessage(postText) {
  return {
    type: 'message',
    attachments: [
      {
        contentType: ADAPTIVE_CARD_CONTENT_TYPE,
        contentUrl: null,
        content: buildAdaptiveCard(postText),
      },
    ],
  }
}
