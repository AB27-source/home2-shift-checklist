// ─────────────────────────────────────────────────────────────────────────────
// Markdown -> Adaptive Card converter (Deno / Edge Function version).
//
// Mirrors src/lib/adaptiveCard.js but without the `normalizePostPreviewText`
// import, since the client only sends new-format markdown that already starts
// with `## `. If you change one file, mirror the change in the other.
// ─────────────────────────────────────────────────────────────────────────────

const SCHEMA = 'http://adaptivecards.io/schemas/adaptive-card.json'
const VERSION = '1.5'
const ADAPTIVE_CONTENT_TYPE = 'application/vnd.microsoft.card.adaptive'

function stripBold(text: string): string {
  return String(text || '').replace(/^\*\*|\*\*$/g, '').trim()
}

function parseTableRows(lines: string[]): string[][] {
  return lines
    .map(line =>
      line.split('|')
        .filter((_, i, a) => i > 0 && i < a.length - 1)
        .map(cell => cell.trim())
    )
    .filter(row => !row.every(cell => /^[-: ]+$/.test(cell)))
}

function heading(text: string, opts: { large?: boolean } = {}) {
  const large = opts.large === true
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

function renderTable(headers: string[], rows: string[][]) {
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
  const bodyRows = rows.map(row => ({
    type: 'ColumnSet',
    separator: true,
    spacing: 'Small',
    columns: Array.from({ length: colCount }, (_, k) => ({
      type: 'Column',
      width: 'stretch',
      items: [{
        type: 'TextBlock',
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

export function buildCardBody(postText: string) {
  if (!postText) return []
  const lines = String(postText).split('\n')
  const body: unknown[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.startsWith('## ')) {
      body.push(heading(line.slice(3), { large: true }))
      i++; continue
    }

    // Collapsible full checklist section
    if (line.startsWith('### ') && line.includes('Full Checklist')) {
      i++
      // Grab the summary line (e.g. "Completed **X / Y** tasks")
      while (i < lines.length && lines[i] === '') i++
      let summaryLine = ''
      if (i < lines.length && !lines[i].startsWith('###') && lines[i] !== '---') {
        summaryLine = lines[i]
        i++
      }
      // Collect all task lines until next section or end
      const taskItems: unknown[] = []
      while (i < lines.length && !lines[i].startsWith('### ') && lines[i] !== '---') {
        const l = lines[i]
        if (l !== '') {
          taskItems.push({
            type: 'TextBlock',
            text: l,
            wrap: true,
            spacing: 'Small',
            fontType: 'Default',
          })
        }
        i++
      }
      const containerId = 'checklist-detail'
      body.push(heading('✅ Full Checklist'))
      if (summaryLine) {
        body.push({ type: 'TextBlock', text: summaryLine, wrap: true, spacing: 'Small' })
      }
      body.push({
        type: 'ActionSet',
        spacing: 'Small',
        actions: [{
          type: 'Action.ToggleVisibility',
          title: 'Show / Hide Checklist',
          targetElements: [containerId],
        }],
      })
      body.push({
        type: 'Container',
        id: containerId,
        isVisible: false,
        items: taskItems,
      })
      continue
    }

    if (line.startsWith('### ')) {
      body.push(heading(line.slice(4)))
      i++; continue
    }

    if (line === '---') { i++; continue }

    if (line.startsWith('|')) {
      const tableLines: string[] = []
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

    if (line.startsWith('- ')) {
      const items: string[] = []
      while (i < lines.length && lines[i].startsWith('- ')) {
        items.push(lines[i].slice(2))
        i++
      }
      body.push({
        type: 'TextBlock',
        text: items.map(it => `- ${it}`).join('\n'),
        wrap: true,
        spacing: 'Small',
      })
      continue
    }

    if (/^\*\*[^*]+\*\*:?\s*$/.test(line)) {
      body.push({
        type: 'TextBlock',
        text: stripBold(line.replace(/:\s*$/, '')) + ':',
        weight: 'Bolder',
        wrap: true,
        spacing: 'Small',
      })
      i++; continue
    }

    if (line === '') { i++; continue }

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

export function buildAdaptiveCard(postText: string) {
  return {
    type: 'AdaptiveCard',
    $schema: SCHEMA,
    version: VERSION,
    body: buildCardBody(postText),
    msteams: { width: 'Full' },
  }
}

export function buildTeamsMessage(postText: string) {
  return {
    type: 'message',
    attachments: [
      {
        contentType: ADAPTIVE_CONTENT_TYPE,
        contentUrl: null,
        content: buildAdaptiveCard(postText),
      },
    ],
  }
}
