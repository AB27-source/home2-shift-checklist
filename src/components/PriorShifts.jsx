import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { getShiftRecords } from '../lib/supabase'
import { filterManagerNotes } from '../lib/utils'
import PostPreview from './PostPreview'
import styles from './PriorShifts.module.css'

function fmtDate(str) {
  if (!str) return ''
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m-1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  let h = d.getHours(), m = d.getMinutes()
  const ap = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${h}:${String(m).padStart(2,'0')} ${ap}`
}

export default function PriorShifts({ agent, onClose }) {
  const isAdmin = !!agent?.is_admin
  const [records,  setRecords]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [selected, setSelected] = useState(null)
  const [filterShift, setFilterShift] = useState('')
  const [filterDays,  setFilterDays]  = useState(isAdmin ? '14' : '7')

  useEffect(() => {
    getShiftRecords().then(data => { setRecords(data); setLoading(false) }).catch(console.error)
  }, [])

  function daysSince(str) {
    if (!str) return 999
    return Math.floor((Date.now() - new Date(str)) / 86400000)
  }

  const maxDays = isAdmin ? parseInt(filterDays) : Math.min(parseInt(filterDays), 7)
  const filtered = records.filter(r => {
    if (filterShift && r.shift !== filterShift) return false
    if (daysSince(r.date) > maxDays) return false
    return true
  })

  return createPortal(
    <div className={`${styles.overlay} modal-overlay-enter`} onClick={onClose}>
      <div className={`${styles.panel} modal-enter`} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className={styles.header}>
          <div>
            <div className={styles.title}>Prior Shift Logs</div>
            <div className={styles.sub}>Home2 Suites Las Vegas North — read-only</div>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {selected ? (
          /* ── Shift Detail View ── */
          <>
            <div className={styles.detailHeader}>
              <div>
                <div className={styles.detailTitle}>{selected.agent_name} — {selected.shift}</div>
                <div className={styles.detailSub}>
                  {fmtDate(selected.date)} · {fmtTime(selected.submitted_at)}
                  {isAdmin && ` · ${Math.round(selected.total_done / selected.total_tasks * 100)}% complete`}
                </div>
              </div>
              <button className={styles.backBtn} onClick={() => setSelected(null)}>← All shifts</button>
            </div>

            <div className={styles.detailBody}>
              {selected.post_text
                ? <PostPreview text={isAdmin ? selected.post_text : filterManagerNotes(selected.post_text)} />
                : <div className={styles.empty}>No shift log post saved for this record.</div>
              }
              {Array.isArray(selected.attachments) && selected.attachments.length > 0 && (
                <div className={styles.attachList}>
                  <div className={styles.attachLabel}>📎 Attachments</div>
                  {selected.attachments.map((f, i) => (
                    <a key={i} href={f.url} target="_blank" rel="noreferrer" className={styles.attachChip}>
                      {f.name}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          /* ── Shift List View ── */
          <>
            <div className={styles.filters}>
              <select className={styles.select} value={filterShift} onChange={e => setFilterShift(e.target.value)}>
                <option value="">All shifts</option>
                <option value="Morning Shift">Morning</option>
                <option value="Swing Shift">Swing</option>
                <option value="Night Audit">Night Audit</option>
              </select>
              <select className={styles.select} value={filterDays} onChange={e => setFilterDays(e.target.value)}>
                <option value="7">Last 7 days</option>
                {isAdmin && <option value="14">Last 14 days</option>}
                {isAdmin && <option value="30">Last 30 days</option>}
                {isAdmin && <option value="999">All time</option>}
              </select>
            </div>

            {loading && <div className={styles.empty}>Loading shifts…</div>}

            {!loading && filtered.length === 0 && (
              <div className={styles.empty}>No shift records found for this period.</div>
            )}

            {!loading && filtered.length > 0 && (
              <div className={styles.list}>
                {filtered.map(r => {
                  const pct   = r.total_tasks ? Math.round(r.total_done / r.total_tasks * 100) : 0
                  const color = pct === 100 ? '#2da44e' : pct >= 70 ? '#1B1B6B' : '#cf222e'
                  return (
                    <button key={r.id} className={styles.record} onClick={() => setSelected(r)}>
                      <div className={styles.recordLeft}>
                        <div className={styles.recordDate}>{fmtDate(r.date)}</div>
                        <div className={styles.recordMeta}>
                          <span className={styles.agentName}>{r.agent_name}</span>
                          <span className={styles.shiftBadge}>{r.shift}</span>
                          <span className={styles.submitTime}>{fmtTime(r.submitted_at)}</span>
                          {isAdmin && r.manager_notes && r.manager_notes !== '0' && (
                            <span className={styles.alert}>⚠ {r.manager_notes}</span>
                          )}
                        </div>
                      </div>
                      <div className={styles.recordRight}>
                        {isAdmin && (
                          <>
                            <span style={{ fontWeight: 700, fontSize: 14, color }}>{pct}%</span>
                            <div className={styles.bar}>
                              <div className={styles.barFill} style={{ width: `${pct}%`, background: color }} />
                            </div>
                            <span className={styles.count}>{r.total_done}/{r.total_tasks}</span>
                          </>
                        )}
                        <span className={styles.arrow}>→</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>,
    document.body
  )
}