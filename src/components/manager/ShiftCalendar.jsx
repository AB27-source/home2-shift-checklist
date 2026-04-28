import { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import styles from './ShiftCalendar.module.css'

const SHIFTS_PER_DAY = 3

function getColorClass(count) {
  if (count === 0)                   return styles.cEmpty
  if (count >= SHIFTS_PER_DAY)       return styles.cFull
  if (count / SHIFTS_PER_DAY >= 0.5) return styles.cPartial
  return styles.cLow
}

function isoToLocal(str) {
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function fmtDate(str) {
  return isoToLocal(str).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

function fmtDateShort(str) {
  return isoToLocal(str).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  let h = d.getHours(), m = d.getMinutes()
  const ap = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${h}:${String(m).padStart(2,'0')} ${ap}`
}

export default function ShiftCalendar({ records }) {
  const [tooltip,    setTooltip]    = useState(null)
  const [dayModal,   setDayModal]   = useState(null)
  const [shiftModal, setShiftModal] = useState(null)

  const byDate = useMemo(() => {
    const map = {}
    records.forEach(r => {
      if (!r.date) return
      if (!map[r.date]) map[r.date] = []
      map[r.date].push(r)
    })
    return map
  }, [records])

  const weeks = useMemo(() => {
    const today = new Date(); today.setHours(0,0,0,0)
    const start = new Date(today)
    start.setDate(start.getDate() - start.getDay() - 15 * 7)
    const arr = []
    for (let w = 0; w < 17; w++) {
      const week = []
      for (let d = 0; d < 7; d++) {
        const day = new Date(start)
        day.setDate(start.getDate() + w * 7 + d)
        if (day > today) { week.push(null); continue }
        const dateStr = day.toISOString().split('T')[0]
        week.push({ dateStr, records: byDate[dateStr] || [] })
      }
      arr.push(week)
    }
    return arr
  }, [byDate])

  const monthLabels = useMemo(() => {
    const labels = []; let last = -1
    weeks.forEach((week, wi) => {
      const first = week.find(d => d)
      if (!first) return
      const m = isoToLocal(first.dateStr).getMonth()
      if (m !== last) {
        labels.push({ wi, label: isoToLocal(first.dateStr).toLocaleDateString('en-US', { month: 'short' }) })
        last = m
      }
    })
    return labels
  }, [weeks])

  const DAY_LABELS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

  return (
    <>
      <div className={styles.wrap}>
        <div className={styles.header}>
          <div className={styles.title}>Shift Coverage Calendar</div>
          <div className={styles.legend}>
            <span className={styles.lgLbl}>Less</span>
            <div className={`${styles.lgCell} ${styles.cEmpty}`} />
            <div className={`${styles.lgCell} ${styles.cLow}`} />
            <div className={`${styles.lgCell} ${styles.cPartial}`} />
            <div className={`${styles.lgCell} ${styles.cFull}`} />
            <span className={styles.lgLbl}>More</span>
            <span className={styles.lgHint}>· Green = all 3 shifts · Yellow = 2 shifts · Red = 1 shift</span>
          </div>
        </div>

        <div className={styles.calWrap}>
          <div className={styles.dayLabels}>
            {DAY_LABELS.map((d, i) => (
              <div key={d} className={styles.dayLbl}>{i % 2 === 1 ? d : ''}</div>
            ))}
          </div>
          <div className={styles.gridArea}>
            <div className={styles.monthRow}>
              {monthLabels.map((m, i) => (
                <div key={i} className={styles.monthLbl} style={{ left: m.wi * 17 }}>{m.label}</div>
              ))}
            </div>
            <div className={styles.cells}>
              {weeks.map((week, wi) => (
                <div key={wi} className={styles.week}>
                  {week.map((day, di) => {
                    if (!day) return <div key={di} className={`${styles.cell} ${styles.cEmpty}`} />
                    const colorCls = getColorClass(day.records.length)
                    return (
                      <div
                        key={di}
                        className={`${styles.cell} ${colorCls}`}
                        onClick={() => setDayModal({ dateStr: day.dateStr, records: day.records })}
                        onMouseEnter={e => setTooltip({ day, x: e.clientX, y: e.clientY })}
                        onMouseLeave={() => setTooltip(null)}
                      />
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {tooltip && (
        <div className={styles.tooltip} style={{ left: tooltip.x + 12, top: tooltip.y - 48 }}>
          <strong>{fmtDate(tooltip.day.dateStr)}</strong><br />
          {tooltip.day.records.length === 0 ? 'No shifts logged' : `${tooltip.day.records.length} of ${SHIFTS_PER_DAY} shifts logged`}
        </div>
      )}

      {dayModal && !shiftModal && createPortal(
        <div className={`${styles.overlay} modal-overlay-enter`} onClick={() => setDayModal(null)}>
          <div className={`${styles.modal} modal-enter`} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <div className={styles.modalTitle}>{fmtDate(dayModal.dateStr)}</div>
                <div className={styles.modalSub}>{dayModal.records.length} of {SHIFTS_PER_DAY} shifts logged</div>
              </div>
              <button className={styles.closeBtn} onClick={() => setDayModal(null)}>✕</button>
            </div>

            {(() => {
              const logged = dayModal.records.map(r => r.shift)
              const missing = ['Morning Shift','Swing Shift','Night Audit'].filter(s => !logged.includes(s))
              return missing.length > 0 && (
                <div className={styles.missingBanner}>⚠ Not logged: {missing.join(', ')}</div>
              )
            })()}

            {dayModal.records.length === 0
              ? <div className={styles.emptyState}>No shifts were logged on this day.</div>
              : <div className={`${styles.shiftCards} stagger-list`}>
                  {dayModal.records.map(r => {
                    const pct = Math.round(r.total_done / r.total_tasks * 100)
                    const color = pct === 100 ? '#2da44e' : pct >= 70 ? '#1B1B6B' : '#cf222e'
                    return (
                      <div key={r.id} className={`${styles.shiftCard} stagger-enter`}
                        onClick={() => setShiftModal(r)}>
                        <div className={styles.shiftCardLeft}>
                          <div className={styles.shiftCardName}>{r.agent_name}</div>
                          <div className={styles.shiftCardMeta}>
                            <span className={styles.shiftBadge}>{r.shift}</span>
                            <span className={styles.shiftTime}>{fmtTime(r.submitted_at)}</span>
                            {r.manager_notes && r.manager_notes !== '0' && (
                              <span className={styles.shiftAlert}>⚠ {r.manager_notes}</span>
                            )}
                          </div>
                        </div>
                        <div className={styles.shiftCardRight}>
                          <span style={{ fontSize: 14, fontWeight: 700, color }}>{pct}%</span>
                          <div className={styles.miniBar}>
                            <div className={styles.miniBarFill} style={{ width: `${pct}%`, background: color }} />
                          </div>
                          <span className={styles.shiftCount}>{r.total_done}/{r.total_tasks}</span>
                          <span className={styles.reviewLink}>Review →</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
            }
          </div>
        </div>,
        document.body
      )}

      {shiftModal && createPortal(
        <div className={`${styles.overlay} modal-overlay-enter`} onClick={() => setShiftModal(null)}>
          <div className={`${styles.modal} ${styles.detailModal} modal-enter`} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <div className={styles.modalTitle}>{shiftModal.agent_name} — {shiftModal.shift}</div>
                <div className={styles.modalSub}>
                  {fmtDateShort(shiftModal.date)} · {Math.round(shiftModal.total_done / shiftModal.total_tasks * 100)}% complete ({shiftModal.total_done}/{shiftModal.total_tasks})
                </div>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button className={styles.backBtn} onClick={() => setShiftModal(null)}>← Back</button>
                <button className={styles.closeBtn} onClick={() => { setShiftModal(null); setDayModal(null) }}>✕</button>
              </div>
            </div>
            <ShiftDetail record={shiftModal} />
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

function ShiftDetail({ record }) {
  const [view, setView] = useState('checklist')
  const tasks = record.tasks || []

  return (
    <>
      <div className={styles.viewTabs}>
        <button className={`${styles.viewTab} ${view === 'checklist' ? styles.viewTabActive : ''}`} onClick={() => setView('checklist')}>Checklist Detail</button>
        <button className={`${styles.viewTab} ${view === 'log'       ? styles.viewTabActive : ''}`} onClick={() => setView('log')}>Shift Log Post</button>
      </div>
      <div className={styles.detailBody}>
        {view === 'checklist' && (
          <div className={styles.taskList}>
            {tasks.map(t => (
              <div key={t.id} className={styles.taskRow}>
                <span className={t.done ? styles.taskDone : styles.taskSkip}>{t.done ? '✓' : '✗'}</span>
                <div className={styles.taskInfo}>
                  <span className={styles.taskName}>{t.name}</span>
                  <span className={styles.taskTimeLbl}> ({t.time})</span>
                  {t.timestamp && <span className={styles.taskTs}>⏱ {t.timestamp}</span>}
                  {t.note && <div className={styles.taskNote}>↳ {t.note}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
        {view === 'log' && (
          record.post_text
            ? <pre className={styles.logPost}>{record.post_text}</pre>
            : <div className={styles.emptyState}>No shift log post saved for this record.</div>
        )}
      </div>
    </>
  )
}