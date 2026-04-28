import { useState } from 'react'
import { filterManagerNotes } from '../lib/utils'
import PostPreview from './PostPreview'
import styles from './PreviousShiftLogs.module.css'

function fmtDate(d) {
  if (!d) return ''
  const [y, m, day] = d.split('-')
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${months[parseInt(m)-1]} ${parseInt(day)}, ${y}`
}

export default function PreviousShiftLogs({ records, loading, isAdmin = false }) {
  const [open,    setOpen]    = useState(false)
  const [closing, setClosing] = useState(false)

  if (loading) return (
    <div className={styles.card}>
      <div className={styles.loadingRow}>
        <div className="spinner" style={{ width: 13, height: 13, borderWidth: 2 }} />
        <span>Loading previous shift logs…</span>
      </div>
    </div>
  )

  if (!records || records.length === 0) return null

  // Deduplicate: keep most recent per shift type (records already sorted desc by submitted_at)
  const deduped = records.reduce((acc, r) => {
    if (!acc.find(x => x.shift === r.shift)) acc.push(r)
    return acc
  }, [])

  function toggle() {
    if (open) {
      setClosing(true)
      setTimeout(() => { setOpen(false); setClosing(false) }, 220)
    } else {
      setOpen(true)
    }
  }

  return (
    <div className={styles.card}>
      <button className={styles.header} onClick={toggle} aria-expanded={open}>
        <div className={styles.headerLeft}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className={styles.icon}>
            <rect x="1" y="2" width="14" height="13" rx="2" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M1 6h14" stroke="currentColor" strokeWidth="1.2"/>
            <path d="M5 10h6M5 12.5h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
          <span className={styles.title}>Previous Shift Logs</span>
          <span className={styles.badge}>{deduped.length}</span>
        </div>
        <div className={styles.headerRight}>
          <span className={styles.summary}>
            {deduped.map(r => r.shift.replace(' Shift', '').replace('Night Audit', 'Night')).join(' · ')}
          </span>
          <svg
            className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`}
            width="14" height="14" viewBox="0 0 16 16" fill="none"
          >
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </button>

      {(open || closing) && (
        <div className={`${styles.body} ${closing ? styles.slideUp : styles.slideDown}`}>
          {deduped.map((r, i) => {
            const pct = r.total_tasks ? Math.round(r.total_done / r.total_tasks * 100) : 0
            const pctColor = pct === 100 ? 'var(--success)' : pct >= 70 ? 'var(--brand)' : 'var(--warn)'
            return (
              <div key={r.id} className={`${styles.entry} ${i < deduped.length - 1 ? styles.entryDivider : ''}`}>
                <div className={styles.entryHeader}>
                  <div className={styles.entryMeta}>
                    <span className={styles.shiftName}>{r.shift}</span>
                    <span className={styles.dot}>·</span>
                    <span className={styles.agentName}>{r.agent_name}</span>
                    <span className={styles.dot}>·</span>
                    <span className={styles.entryDate}>{fmtDate(r.date)}</span>
                  </div>
                  {isAdmin && (
                    <span className={styles.pct} style={{ color: pctColor }}>
                      {pct}%
                      <span className={styles.pctSub}> ({r.total_done}/{r.total_tasks})</span>
                    </span>
                  )}
                </div>
                {r.post_text
                  ? <PostPreview text={isAdmin ? r.post_text : filterManagerNotes(r.post_text)} />
                  : <div className={styles.noLog}>No shift log post was saved for this record.</div>
                }
                {Array.isArray(r.attachments) && r.attachments.length > 0 && (
                  <div className={styles.attachList}>
                    {r.attachments.map((f, ai) => (
                      <a key={ai} href={f.url} target="_blank" rel="noreferrer" className={styles.attachChip}>
                        📎 {f.name}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
