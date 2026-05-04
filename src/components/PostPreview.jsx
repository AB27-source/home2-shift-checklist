import styles from './PostPreview.module.css'
import { normalizePostPreviewText } from '../lib/utils'

// ── Inline renderer: **bold** and [text](url) ──
function renderInline(text) {
  const parts = text.split(/(\*\*[^*]+\*\*|\[[^\]]*\]\([^)]*\))/)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={i}>{part.slice(2, -2)}</strong>
    }
    const lm = part.match(/^\[([^\]]*)\]\(([^)]*)\)$/)
    if (lm) {
      return <a key={i} href={lm[2]} target="_blank" rel="noreferrer" className={styles.link}>{lm[1]}</a>
    }
    return part || null
  })
}

// ── Parse a table block into rows (skip separator rows like |---|) ──
function parseTableRows(lines) {
  return lines
    .map(line =>
      line.split('|')
          .filter((_, i, a) => i > 0 && i < a.length - 1)
          .map(c => c.trim())
    )
    .filter(row => !row.every(c => /^[-: ]+$/.test(c)))
}

export default function PostPreview({ text }) {
  if (!text) return null

  const normalizedText = normalizePostPreviewText(text)
  const lines  = normalizedText.split('\n')
  const nodes  = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // ── ## Main title ──
    if (line.startsWith('## ')) {
      nodes.push(<h2 key={i} className={styles.h2}>{renderInline(line.slice(3))}</h2>)

    // ── ### Section header ──
    } else if (line.startsWith('### ')) {
      nodes.push(<h3 key={i} className={styles.h3}>{renderInline(line.slice(4))}</h3>)

    // ── --- Divider ──
    } else if (line === '---') {
      nodes.push(<hr key={i} className={styles.hr} />)

    // ── | Table block ──
    } else if (line.startsWith('|')) {
      const tableLines = []
      while (i < lines.length && lines[i].startsWith('|')) {
        tableLines.push(lines[i])
        i++
      }
      const rows = parseTableRows(tableLines)
      if (rows.length > 0) {
        const [head, ...body] = rows
        const colCount = head.length
        nodes.push(
          <table key={`t-${i}`} className={styles.table}>
            <thead>
              <tr>{head.map((h, k) => <th key={k} className={styles.th}>{renderInline(h)}</th>)}</tr>
            </thead>
            <tbody>
              {body.map((row, ri) => (
                <tr key={ri} className={ri % 2 === 0 ? styles.trEven : styles.trOdd}>
                  {/* Pad short rows so they fill all columns */}
                  {Array.from({ length: colCount }, (_, ci) => (
                    <td key={ci} className={styles.td}>{renderInline(row[ci] ?? '')}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )
      }
      continue // i already advanced

    // ── - List block ──
    } else if (line.startsWith('- ')) {
      const items = []
      while (i < lines.length && lines[i].startsWith('- ')) {
        items.push(lines[i].slice(2))
        i++
      }
      nodes.push(
        <ul key={`ul-${i}`} className={styles.ul}>
          {items.map((item, k) => <li key={k} className={styles.li}>{renderInline(item)}</li>)}
        </ul>
      )
      continue

    // ── QOTD|quote text|author ──
    } else if (line.startsWith('QOTD|')) {
      const [, quoteText, author] = line.split('|')
      nodes.push(
        <div key={i} className={styles.quoteBlock}>
          <div className={styles.quoteLabel}>💬 Quote of the Day</div>
          <div className={styles.quoteText}>"{quoteText}"</div>
          {author && <div className={styles.quoteAuthor}>– {author}</div>}
        </div>
      )

    // ── **Bold label line** (e.g. **Guest Request Details:**) ──
    } else if (/^\*\*[^*]+\*\*:?\s*$/.test(line)) {
      nodes.push(<p key={i} className={styles.boldLabel}>{renderInline(line)}</p>)

    // ── **key:** value (agent line, etc.) ──
    } else if (line === '') {
      // skip blank lines

    } else {
      nodes.push(<p key={i} className={styles.p}>{renderInline(line)}</p>)
    }

    i++
  }

  return <div className={styles.preview}>{nodes}</div>
}
