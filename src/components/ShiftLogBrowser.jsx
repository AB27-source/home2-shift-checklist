import { useState, useEffect, useRef } from 'react'
import { getShiftRecordsByDateRange } from '../lib/supabase'
import { filterManagerNotes } from '../lib/utils'
import PostPreview from './PostPreview'
import styles from './ShiftLogBrowser.module.css'

const SHIFT_META = {
  'Morning Shift': { color: '#1B1B6B', label: 'AM' },
  'Swing Shift':   { color: '#B45309', label: 'SW' },
  'Night Audit':   { color: '#7C3AED', label: 'NA' },
}

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

// Avoid timezone pitfalls when parsing YYYY-MM-DD
function isoToLocal(str) {
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function fmtDateFull(str) {
  return isoToLocal(str).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })
}

function fmtTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  let h = d.getHours(), m = d.getMinutes()
  const ap = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${h}:${String(m).padStart(2, '0')} ${ap}`
}

function pad(n) { return String(n).padStart(2, '0') }

function attachmentIcon(name) {
  const ext = (name?.split('.').pop() || '').toLowerCase()
  const map = {
    pdf: '📄',
    doc: '📝', docx: '📝',
    xls: '📊', xlsx: '📊',
    ppt: '📑', pptx: '📑',
    png: '🖼️', jpg: '🖼️', jpeg: '🖼️', gif: '🖼️', webp: '🖼️',
    txt: '📃', csv: '📃',
  }
  return map[ext] || '📎'
}

// embedded=true → skip the topbar (used inside Dashboard)
// isAdmin prop overrides agent.is_admin (useful when embedded)
export default function ShiftLogBrowser({ agent, onBack, embedded = false, isAdmin: isAdminProp }) {
  const isAdmin = isAdminProp !== undefined ? isAdminProp : !!agent?.is_admin

  const today = new Date(); today.setHours(0, 0, 0, 0)
  const todayStr = today.toISOString().split('T')[0]

  // Non-admins can only view the last 7 days
  const earliest = isAdmin ? null : (() => {
    const d = new Date(today)
    d.setDate(d.getDate() - 7)
    return d.toISOString().split('T')[0]
  })()

  const [viewYear,  setViewYear]  = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth()) // 0-indexed
  const [records,   setRecords]   = useState([])
  const [loading,   setLoading]   = useState(true)
  const [selectedDate,   setSelectedDate]   = useState(null)
  const [selectedRecord, setSelectedRecord] = useState(null)
  const logsRef = useRef(null)

  useEffect(() => {
    let active = true

    queueMicrotask(async () => {
      if (!active) return

      setLoading(true)
      const start   = `${viewYear}-${pad(viewMonth + 1)}-01`
      const lastDay = new Date(viewYear, viewMonth + 1, 0).getDate()
      const end     = `${viewYear}-${pad(viewMonth + 1)}-${pad(lastDay)}`

      try {
        const data = await getShiftRecordsByDateRange(start, end)
        if (active) setRecords(data || [])
      } catch {
        if (active) setRecords([])
      } finally {
        if (active) setLoading(false)
      }
    })

    return () => {
      active = false
    }
  }, [viewYear, viewMonth])

  const isCurrentMonth = viewYear === today.getFullYear() && viewMonth === today.getMonth()

  // Prev month is blocked if its last day would be before the earliest allowed date
  const isPrevMonthBlocked = (() => {
    if (!earliest) return false
    let y = viewYear, m = viewMonth - 1
    if (m < 0) { y--; m = 11 }
    const lastDay = new Date(y, m + 1, 0)
    return lastDay.toISOString().split('T')[0] < earliest
  })()

  function goMonth(dir) {
    if (dir === 1 && isCurrentMonth) return
    if (dir === -1 && isPrevMonthBlocked) return
    setSelectedDate(null); setSelectedRecord(null)
    let y = viewYear, m = viewMonth + dir
    if (m < 0)  { y--; m = 11 }
    if (m > 11) { y++; m = 0  }
    setViewYear(y); setViewMonth(m)
  }

  // Build calendar grid (empty cells + day numbers, padded to full weeks)
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const firstDow    = new Date(viewYear, viewMonth, 1).getDay() // 0 = Sunday
  const cells = []
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  // Index records by date
  const byDate = {}
  records.forEach(r => {
    if (!byDate[r.date]) byDate[r.date] = []
    byDate[r.date].push(r)
  })

  function ds(day) {
    return `${viewYear}-${pad(viewMonth + 1)}-${pad(day)}`
  }

  function handleDayClick(day) {
    const d = ds(day)
    if (d > todayStr) return
    setSelectedRecord(null)
    setSelectedDate(prev => (prev === d ? null : d))
    setTimeout(() => logsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  const dayRecords = selectedDate ? (byDate[selectedDate] || []) : []

  return (
    <div>
      {/* ── Topbar — hidden when embedded inside Dashboard ── */}
      {!embedded && (
        <div className="topbar">
          <div className="topbar-left">
            <button className={styles.backBtn} onClick={onBack}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M9 2L4 7l5 5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Home
            </button>
            <div>
              <div className="topbar-title">Shift Logs</div>
              <div className="topbar-sub">Home2 Suites Las Vegas North</div>
            </div>
          </div>
          <div className="topbar-right">
            <div className="topbar-agent-badge">{agent?.name}</div>
          </div>
        </div>
      )}

      <div className={embedded ? styles.embeddedWrap : 'main'}>
        {/* ── Record detail view ── */}
        {selectedRecord ? (
          <RecordDetail
            record={selectedRecord}
            isAdmin={isAdmin}
            onBack={() => setSelectedRecord(null)}
            styles={styles}
          />
        ) : (
          <>
            {/* ── Calendar card ── */}
            <div className="card">

              {/* Month navigation */}
              <div className={styles.monthNav}>
                <button className={`${styles.monthBtn} ${isPrevMonthBlocked ? styles.monthBtnDisabled : ''}`} onClick={() => goMonth(-1)} disabled={isPrevMonthBlocked} aria-label="Previous month">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                <span className={styles.monthLabel}>{MONTHS[viewMonth]} {viewYear}</span>
                <button
                  className={`${styles.monthBtn} ${isCurrentMonth ? styles.monthBtnDisabled : ''}`}
                  onClick={() => goMonth(1)}
                  disabled={isCurrentMonth}
                  aria-label="Next month"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M5 2l5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>

              {/* Day-of-week headers */}
              <div className={styles.dayHeaders}>
                {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
                  <div key={d} className={styles.dayHeader}>{d}</div>
                ))}
              </div>

              {/* Calendar cells */}
              <div className={styles.calGrid}>
                {cells.map((day, i) => {
                  if (!day) return <div key={`e-${i}`} className={styles.cellEmpty} />
                  const d         = ds(day)
                  const isFuture  = d > todayStr
                  const isBlocked = !isFuture && !!earliest && d < earliest
                  const isToday   = d === todayStr
                  const isSel     = d === selectedDate
                  const recs      = byDate[d] || []
                  return (
                    <div
                      key={day}
                      className={[
                        styles.cell,
                        isFuture || isBlocked ? styles.cellFuture   : styles.cellClickable,
                        isToday  ? styles.cellToday    : '',
                        isSel    ? styles.cellSelected : '',
                      ].filter(Boolean).join(' ')}
                      onClick={() => !isFuture && !isBlocked && handleDayClick(day)}
                    >
                      <span className={styles.cellNum}>{day}</span>
                      <div className={styles.cellPips}>
                        {recs.map(r => (
                          <span
                            key={r.id}
                            className={styles.pip}
                            style={{ background: SHIFT_META[r.shift]?.color || '#888' }}
                            title={r.shift}
                          />
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Loading overlay (month switch) */}
              {loading && (
                <div className={styles.calLoading}>
                  <div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
                </div>
              )}

              {/* Legend */}
              <div className={styles.legend}>
                {Object.entries(SHIFT_META).map(([name, { color }]) => (
                  <span key={name} className={styles.legendItem}>
                    <span className={styles.legendDot} style={{ background: color }} />
                    {name}
                  </span>
                ))}
              </div>
            </div>

            {/* ── Selected day logs ── */}
            {selectedDate && (
              <div className="card" ref={logsRef}>
                <div className={styles.dayTitle}>{fmtDateFull(selectedDate)}</div>

                {loading ? (
                  <div className={styles.emptyState}>
                    <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                    Loading…
                  </div>
                ) : dayRecords.length === 0 ? (
                  <div className={styles.emptyState}>No shift logs were recorded on this day.</div>
                ) : (
                  <div className={styles.logList}>
                    {dayRecords.map(r => (
                      <button key={r.id} className={styles.logCard} onClick={() => setSelectedRecord(r)}>
                        <span
                          className={styles.logBadge}
                          style={{ background: SHIFT_META[r.shift]?.color || '#888' }}
                        >
                          {SHIFT_META[r.shift]?.label || '?'}
                        </span>
                        <div className={styles.logInfo}>
                          <span className={styles.logShift}>{r.shift}</span>
                          <span className={styles.logAgent}>{r.agent_name} · {fmtTime(r.submitted_at)}</span>
                        </div>
                        {isAdmin && r.total_tasks > 0 && (
                          <div className={styles.logPct}>
                            <span className={styles.logPctNum} style={{
                              color: r.total_done === r.total_tasks ? '#2da44e'
                                   : r.total_done / r.total_tasks >= 0.7 ? 'var(--brand)'
                                   : 'var(--danger)'
                            }}>
                              {Math.round(r.total_done / r.total_tasks * 100)}%
                            </span>
                            <span className={styles.logPctSub}>{r.total_done}/{r.total_tasks}</span>
                          </div>
                        )}
                        <svg className={styles.logArrow} width="16" height="16" viewBox="0 0 16 16" fill="none">
                          <path d="M4 8h8M8 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Record detail sub-component ──────────────────────────────────────────────
function RecordDetail({ record, isAdmin, onBack, styles }) {
  const [view, setView] = useState('log') // 'checklist' | 'log'
  const [showHistory, setShowHistory] = useState(false)
  const editHistory = record.edit_history || []
  const tasks = record.tasks || []
  const pct   = record.total_tasks > 0
    ? Math.round(record.total_done / record.total_tasks * 100) : 0
  const pctColor = record.total_done === record.total_tasks ? '#2da44e'
                 : pct >= 70 ? 'var(--brand)' : 'var(--danger)'

  return (
    <div className="card">
      {/* Back link */}
      <button className={styles.detailBackBtn} onClick={onBack}>
        ← Back to {fmtDateFull(record.date)}
      </button>

      {/* Header */}
      <div className={styles.detailTitle}>
        <span
          className={styles.detailBadge}
          style={{ background: SHIFT_META[record.shift]?.color || '#888' }}
        >
          {SHIFT_META[record.shift]?.label || '?'}
        </span>
        <div style={{ flex: 1 }}>
          <div className={styles.detailShiftName}>{record.shift}</div>
          <div className={styles.detailMeta}>
            {record.agent_name} · {fmtTime(record.submitted_at)}
            {isAdmin && record.total_tasks > 0 && (
              <span className={styles.detailCompletion} style={{ color: pctColor }}>
                {' '}· {pct}% ({record.total_done}/{record.total_tasks} tasks)
              </span>
            )}
          </div>
        </div>
        {/* Completion ring — admin only */}
        {isAdmin && record.total_tasks > 0 && (
          <div className={styles.pctRing} style={{ '--pct-color': pctColor }}>
            <svg width="44" height="44" viewBox="0 0 44 44">
              <circle cx="22" cy="22" r="18" fill="none" stroke="var(--border)" strokeWidth="4"/>
              <circle
                cx="22" cy="22" r="18" fill="none"
                stroke={pctColor} strokeWidth="4"
                strokeDasharray={`${2 * Math.PI * 18}`}
                strokeDashoffset={`${2 * Math.PI * 18 * (1 - pct / 100)}`}
                strokeLinecap="round"
                transform="rotate(-90 22 22)"
                style={{ transition: 'stroke-dashoffset 600ms var(--spring)' }}
              />
            </svg>
            <span className={styles.pctRingNum} style={{ color: pctColor }}>{pct}%</span>
          </div>
        )}
      </div>

      {/* View tabs — admin sees both; non-admin only sees the log */}
      {isAdmin && (
        <div className={styles.viewTabs}>
          <button
            className={`${styles.viewTab} ${view === 'checklist' ? styles.viewTabActive : ''}`}
            onClick={() => setView('checklist')}
          >
            ✓ Checklist
          </button>
          <button
            className={`${styles.viewTab} ${view === 'log' ? styles.viewTabActive : ''}`}
            onClick={() => setView('log')}
          >
            📋 Shift Log Post
          </button>
        </div>
      )}

      {/* Checklist detail — admin only */}
      {isAdmin && view === 'checklist' && (
        tasks.length === 0 ? (
          <div className={styles.emptyState}>No task data saved for this record.</div>
        ) : (
          <div className={styles.taskList}>
            {tasks.map(t => (
              <div key={t.id} className={styles.taskRow}>
                <span className={t.done ? styles.taskDone : styles.taskSkip}>
                  {t.done ? '✓' : '✗'}
                </span>
                <div className={styles.taskInfo}>
                  <span className={styles.taskName}>{t.name}</span>
                  <span className={styles.taskTime}> ({t.time})</span>
                  {t.timestamp && (
                    <span className={styles.taskTs}>⏱ {t.timestamp}</span>
                  )}
                  {t.note && (
                    <div className={styles.taskNote}>↳ {t.note}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* Shift log post text */}
      {(!isAdmin || view === 'log') && (
        <>
          <div className={styles.logPost}>
            <PostPreview text={isAdmin ? record.post_text : filterManagerNotes(record.post_text)} />
          </div>

          {/* Edited indicator — iMessage style */}
          {editHistory.length > 0 && (
            <div className={styles.editedWrap}>
              <button className={styles.editedBtn} onClick={() => setShowHistory(v => !v)}>
                ✎ Edited · {fmtTime(editHistory[0].replaced_at)}
                <svg
                  className={`${styles.editedChevron} ${showHistory ? styles.editedChevronOpen : ''}`}
                  width="10" height="10" viewBox="0 0 10 10" fill="none"
                >
                  <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>

              {showHistory && (
                <div className={styles.historyList}>
                  {editHistory.map((snap, i) => (
                    <div key={i} className={styles.historyEntry}>
                      <div className={styles.historyMeta}>
                        {i === editHistory.length - 1 ? 'Original' : `Version ${editHistory.length - i}`}
                        {' · '}{fmtTime(snap.submitted_at)}
                        <span className={styles.historyReplaced}> · replaced {fmtTime(snap.replaced_at)}</span>
                      </div>
                      <div className={styles.historyPost}>
                        <PostPreview text={isAdmin ? snap.post_text : filterManagerNotes(snap.post_text)} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {Array.isArray(record.attachments) && record.attachments.length > 0 && (
            <div className={styles.attachList}>
              <div className={styles.attachLabel}>📎 Attachments</div>
              {record.attachments.map((file, index) => (
                <a
                  key={`${file.url || file.name || 'file'}-${index}`}
                  href={file.url}
                  target="_blank"
                  rel="noreferrer"
                  className={styles.attachChip}
                >
                  {attachmentIcon(file.name)} {file.name}
                </a>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
