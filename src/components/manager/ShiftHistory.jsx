import { useState } from 'react'
import { deleteShiftRecords } from '../../lib/supabase'
import PostPreview from '../PostPreview'
import styles from './ShiftHistory.module.css'

function fmtDate(d) {
  if (!d) return ''
  const [y, m, day] = d.split('-')
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${months[parseInt(m)-1]} ${parseInt(day)}, ${y}`
}

function fmtTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  let h = d.getHours(), m = d.getMinutes()
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${h}:${String(m).padStart(2,'0')} ${ampm}`
}

function daysSince(dateStr) {
  if (!dateStr) return 999
  return Math.floor((Date.now() - new Date(dateStr)) / 86400000)
}

function exportToCSV(records) {
  const headers = ['Date','Shift','Agent','Completion %','Tasks Done','Total Tasks','Manager Notes','Guest Requests','Rate Adj/Refunds','Submitted At','Post Text']
  const escape = (v) => `"${String(v ?? '').replace(/"/g, '""').replace(/\n/g, ' | ')}"`
  const rows = records.map(r => [
    r.date,
    r.shift,
    r.agent_name,
    r.total_tasks > 0 ? Math.round(r.total_done / r.total_tasks * 100) + '%' : '—',
    r.total_done,
    r.total_tasks,
    r.manager_notes || '',
    r.occupancy    || '',
    r.adr          || '',
    r.submitted_at ? new Date(r.submitted_at).toLocaleString() : '',
    r.post_text    || '',
  ])
  const csv = [headers.map(escape), ...rows.map(row => row.map(escape))].map(r => r.join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = Object.assign(document.createElement('a'), {
    href: url,
    download: `shift-logs-${new Date().toISOString().split('T')[0]}.csv`,
  })
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function DetailRow({ record, tasks, expandedView, setExpandedView, rowId, isClosing, isSelected }) {
  const view    = expandedView[rowId] || 'checklist'
  const setView = (v) => setExpandedView(prev => ({ ...prev, [rowId]: v }))

  return (
    <tr className={`${styles.detailRow} ${isSelected ? styles.detailRowSelected : ''}`}>
      <td colSpan={7}>
        <div className={`${styles.detailContent} ${isClosing ? styles.slideUp : styles.slideDown}`}>
          <div className={styles.detailInner}>
            <div className={styles.detailTabs}>
              <button
                className={`${styles.detailTab} ${view === 'checklist' ? styles.detailTabActive : ''}`}
                onClick={() => setView('checklist')}
              >Checklist Detail</button>
              <button
                className={`${styles.detailTab} ${view === 'log' ? styles.detailTabActive : ''}`}
                onClick={() => setView('log')}
              >Shift Log Post</button>
            </div>

            {view === 'checklist' && (
              <div>
                {tasks.map(t => (
                  <div key={t.id} className={styles.taskRow}>
                    <span style={{ color: t.done ? 'var(--success)' : 'var(--warn)' }}>{t.done ? '✓' : '✗'}</span>
                    <span className={styles.taskName}>{t.name} <span className={styles.subtext}>({t.time})</span></span>
                    {t.timestamp && <span className={styles.ts}>⏱ {t.timestamp}</span>}
                    {t.note && <span className={styles.noteText}>↳ {t.note}</span>}
                  </div>
                ))}
              </div>
            )}

            {view === 'log' && (
              record.post_text
                ? <PostPreview text={record.post_text} />
                : <div className={styles.noLog}>No shift log post was saved for this record.</div>
            )}
          </div>
        </div>
      </td>
    </tr>
  )
}

const CLOSE_DURATION = 200

export default function ShiftHistory({ records, agents, sessionToken, loading, onDelete }) {
  const [filterAgent, setFilterAgent]   = useState('')
  const [filterShift, setFilterShift]   = useState('')
  const [filterDays,  setFilterDays]    = useState('7')
  const [expanded,    setExpanded]      = useState(null)
  const [closing,     setClosing]       = useState(null)
  const [expandedView, setExpandedView] = useState({})

  // ── Multi-select state ───────────────────────────────────────────────────
  const [selected,  setSelected]  = useState(new Set())
  const [deleting,  setDeleting]  = useState(false)

  const filtered = records.filter(r => {
    if (filterAgent && r.agent_id !== filterAgent) return false
    if (filterShift && r.shift   !== filterShift)  return false
    if (daysSince(r.date) > parseInt(filterDays))  return false
    return true
  })

  // Selection helpers
  const allFilteredIds   = filtered.map(r => r.id)
  const allSelected      = allFilteredIds.length > 0 && allFilteredIds.every(id => selected.has(id))
  const someSelected     = allFilteredIds.some(id => selected.has(id))
  const selectedInView   = filtered.filter(r => selected.has(r.id))

  function toggleOne(id) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (allSelected) {
      // Deselect all filtered rows (keep selections outside the filter)
      setSelected(prev => {
        const next = new Set(prev)
        allFilteredIds.forEach(id => next.delete(id))
        return next
      })
    } else {
      setSelected(prev => new Set([...prev, ...allFilteredIds]))
    }
  }

  function clearSelection() { setSelected(new Set()) }

  async function handleDelete() {
    const ids = [...selected]
    if (!window.confirm(`Permanently delete ${ids.length} shift record${ids.length === 1 ? '' : 's'}? This cannot be undone.`)) return
    setDeleting(true)
    try {
      await deleteShiftRecords(sessionToken, ids)
      onDelete?.(ids)      // update parent (Dashboard) state
      setSelected(new Set())
      // Close any expanded rows that were deleted
      if (expanded && ids.includes(expanded.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5'))) {
        setExpanded(null); setClosing(null)
      }
    } catch (e) {
      console.error(e)
      alert('Failed to delete records. Please try again.')
    }
    setDeleting(false)
  }

  function handleExport() {
    exportToCSV(selectedInView)
  }

  // Row expand/collapse
  function handleToggle(rowId) {
    if (expanded === rowId) {
      setClosing(rowId)
      setTimeout(() => { setExpanded(null); setClosing(null) }, CLOSE_DURATION)
    } else {
      if (expanded !== null) {
        const prev = expanded
        setClosing(prev)
        setTimeout(() => setClosing(null), CLOSE_DURATION)
      }
      setExpanded(rowId)
    }
  }

  if (loading) return <div style={{ padding: 20, color: 'var(--muted)', fontSize: 13 }}>Loading history…</div>

  return (
    <div>
      {/* ── Filters ── */}
      <div className={styles.filters}>
        <select className={styles.select} value={filterAgent} onChange={e => { setFilterAgent(e.target.value); clearSelection() }}>
          <option value="">All agents</option>
          {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select className={styles.select} value={filterShift} onChange={e => { setFilterShift(e.target.value); clearSelection() }}>
          <option value="">All shifts</option>
          <option value="Morning Shift">Morning</option>
          <option value="Swing Shift">Swing</option>
          <option value="Night Audit">Night Audit</option>
        </select>
        <select className={styles.select} value={filterDays} onChange={e => { setFilterDays(e.target.value); clearSelection() }}>
          <option value="7">Last 7 days</option>
          <option value="14">Last 14 days</option>
          <option value="30">Last 30 days</option>
          <option value="999">All time</option>
        </select>
      </div>

      {/* ── Selection action bar ── */}
      <div className={`${styles.actionBar} ${selected.size > 0 ? styles.actionBarVisible : ''}`}>
        <div className={styles.actionBarLeft}>
          <button className={styles.actionBarClear} onClick={clearSelection} title="Clear selection">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>
          <span className={styles.actionBarCount}>
            <strong>{selected.size}</strong> record{selected.size === 1 ? '' : 's'} selected
          </span>
        </div>
        <div className={styles.actionBarRight}>
          <button className={styles.actionBtnExport} onClick={handleExport} title="Export selected as CSV">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 1v8M4 6l3 3 3-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 10v2a1 1 0 001 1h8a1 1 0 001-1v-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
            Export CSV
          </button>
          <button className={styles.actionBtnDelete} onClick={handleDelete} disabled={deleting}>
            {deleting ? (
              <div className="spinner" style={{ width: 12, height: 12, borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }} />
            ) : (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 4h10M5 4V2.5a.5.5 0 01.5-.5h3a.5.5 0 01.5.5V4M5.5 6.5v4M8.5 6.5v4M3 4l.7 7.3A1 1 0 004.7 12h4.6a1 1 0 001-.7L11 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
            Delete
          </button>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {!filtered.length
          ? <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
              No shift records found. Records appear after agents complete their checklists.
            </div>
          : <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.checkCol}>
                    <label className={styles.checkLabel}>
                      <input
                        type="checkbox"
                        className={styles.checkInput}
                        checked={allSelected}
                        ref={el => { if (el) el.indeterminate = someSelected && !allSelected }}
                        onChange={toggleAll}
                      />
                      <span className={styles.checkBox} />
                    </label>
                  </th>
                  <th>Date</th>
                  <th>Agent</th>
                  <th>Shift</th>
                  <th>Completion</th>
                  <th>Notes</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => {
                  const pct      = Math.round(r.total_done / r.total_tasks * 100)
                  const tasks    = r.tasks || []
                  const rowId    = r.id?.replace(/-/g, '')
                  const isOpen   = expanded === rowId
                  const isClose  = closing  === rowId
                  const isSel    = selected.has(r.id)

                  return [
                    <tr key={r.id} className={`${styles.row} ${isSel ? styles.rowSelected : ''}`}>
                      <td className={styles.checkCol} onClick={e => e.stopPropagation()}>
                        <label className={styles.checkLabel}>
                          <input
                            type="checkbox"
                            className={styles.checkInput}
                            checked={isSel}
                            onChange={() => toggleOne(r.id)}
                          />
                          <span className={styles.checkBox} />
                        </label>
                      </td>
                      <td>
                        {fmtDate(r.date)}
                        <div className={styles.subtext}>{fmtTime(r.submitted_at)}</div>
                      </td>
                      <td><strong>{r.agent_name}</strong></td>
                      <td>{r.shift}</td>
                      <td>
                        <span className={styles.pct} style={{ color: pct === 100 ? 'var(--success)' : pct >= 70 ? 'var(--brand)' : 'var(--warn)' }}>
                          {pct}%
                        </span>
                        <span className={styles.subtext}> ({r.total_done}/{r.total_tasks})</span>
                        <div className={styles.bar}>
                          <div className={styles.barFill} style={{ width: `${pct}%`, background: pct === 100 ? 'var(--success)' : pct >= 70 ? 'var(--brand)' : 'var(--warn)' }} />
                        </div>
                      </td>
                      <td>
                        {r.manager_notes && r.manager_notes !== '0'
                          ? <span style={{ fontSize: 12, color: 'var(--warn)' }}>⚠ {r.manager_notes}</span>
                          : tasks.some(t => t.note)
                            ? <span className={styles.subtext}>Has notes</span>
                            : <span className={styles.subtext}>—</span>
                        }
                      </td>
                      <td>
                        <button className="btn-sm" onClick={() => handleToggle(rowId)}>
                          {isOpen ? 'Close' : 'Details'}
                        </button>
                      </td>
                    </tr>,
                    (isOpen || isClose) && (
                      <DetailRow
                        key={r.id + '-detail'}
                        record={r} tasks={tasks}
                        expandedView={expandedView} setExpandedView={setExpandedView}
                        rowId={rowId} isClosing={isClose} isSelected={isSel}
                      />
                    )
                  ]
                })}
              </tbody>
            </table>
        }
      </div>
    </div>
  )
}
