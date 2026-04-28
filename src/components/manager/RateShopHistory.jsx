import { useState, useEffect, useMemo } from 'react'
import { getLiveRateShops } from '../../lib/supabase'
import { HOTELS, PERIOD_LABELS } from '../../data/rateShop'
import styles from './RateShopHistory.module.css'

const PERIODS = ['start', 'mid', 'end']

const SHIFT_COLORS = {
  'Morning Shift': '#1B1B6B',
  'Swing Shift':   '#B45309',
  'Night Audit':   '#7C3AED',
}

const FILTERS = [
  { label: '7 days',  days: 7 },
  { label: '14 days', days: 14 },
  { label: '30 days', days: 30 },
  { label: 'All time', days: Infinity },
]

function today() { return new Date().toISOString().split('T')[0] }

function fmtTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  let h = d.getHours(), m = d.getMinutes()
  const ap = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${h}:${String(m).padStart(2, '0')} ${ap}`
}

function fmtDateHeading(dateStr) {
  if (!dateStr) return ''
  const [y, mo, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, mo - 1, d)
  const todayStr = today()
  if (dateStr === todayStr) return 'Today'
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1)
  if (dateStr === yesterday.toISOString().split('T')[0]) return 'Yesterday'
  return dt.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}

function CellValue({ entry }) {
  if (!entry) return <span className={styles.cellEmpty}>—</span>
  if (entry.soldOut) return (
    <span className={styles.cellSoldOut}>
      Sold Out
      {entry.note && <span className={styles.cellNote}>{entry.note}</span>}
    </span>
  )
  if (!entry.rate) return <span className={styles.cellEmpty}>—</span>
  return (
    <span className={styles.cellRate}>
      ${Number(entry.rate).toFixed(2)}
      {entry.note && <span className={styles.cellNote}>{entry.note}</span>}
    </span>
  )
}

function hasRateShopData(rs) {
  if (!rs) return false
  return HOTELS.some(h => PERIODS.some(p => rs[p]?.[h.id]?.rate || rs[p]?.[h.id]?.soldOut))
}

export default function RateShopHistory({ records }) {
  const [liveData, setLiveData]   = useState([])
  const [filterIdx, setFilterIdx] = useState(0)

  useEffect(() => {
    getLiveRateShops({ todayOnly: false }).then(setLiveData).catch(() => {})
  }, [])

  const cutoff = useMemo(() => {
    const days = FILTERS[filterIdx].days
    if (days === Infinity) return null
    const d = new Date()
    d.setDate(d.getDate() - days)
    return d.toISOString().split('T')[0]
  }, [filterIdx])

  // Merge live (today only) + submitted records, deduplicate same agent+shift+date
  const allEntries = useMemo(() => {
    const submitted = (records || [])
      .filter(r => hasRateShopData(r.rate_shops))
      .map(r => ({ ...r, isLive: false, ts: r.submitted_at }))

    const submittedKeys = new Set(submitted.map(r => `${r.agent_id}|${r.shift}|${r.date}`))

    const todayStr = today()
    const live = liveData
      .filter(r => hasRateShopData(r.rate_shops) && !submittedKeys.has(`${r.agent_id}|${r.shift}|${r.date}`))
      .map(r => ({ ...r, isLive: r.date === todayStr, ts: r.updated_at, date: r.date || todayStr }))

    return [...live, ...submitted].sort((a, b) => new Date(b.ts) - new Date(a.ts))
  }, [records, liveData])

  const filtered = useMemo(() =>
    cutoff ? allEntries.filter(e => e.date >= cutoff) : allEntries,
    [allEntries, cutoff]
  )

  // Group by date
  const grouped = useMemo(() => {
    const map = new Map()
    for (const entry of filtered) {
      const key = entry.date || today()
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(entry)
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]))
  }, [filtered])

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <span className={styles.toolbarLabel}>Showing</span>
        <div className={styles.filterGroup}>
          {FILTERS.map((f, i) => (
            <button
              key={f.label}
              className={`${styles.filterBtn} ${filterIdx === i ? styles.filterActive : ''}`}
              onClick={() => setFilterIdx(i)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <span className={styles.toolbarCount}>
          {filtered.length} shift{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {grouped.length === 0 && (
        <div className={styles.empty}>No rate shop data for this period.</div>
      )}

      {grouped.map(([dateStr, entries]) => (
        <div key={dateStr} className={styles.dateGroup}>
          <div className={styles.dateHeading}>{fmtDateHeading(dateStr)}</div>
          {entries.map((entry, i) => (
            <ShiftEntry key={entry.id ?? `${dateStr}-${i}`} entry={entry} />
          ))}
        </div>
      ))}
    </div>
  )
}

function ShiftEntry({ entry }) {
  const rs    = entry.rate_shops || {}
  const color = SHIFT_COLORS[entry.shift] || 'var(--brand)'

  return (
    <div className={styles.entry}>
      <div className={styles.entryHeader}>
        <span className={styles.shiftBadge} style={{ background: color }}>{entry.shift}</span>
        {entry.isLive && <span className={styles.livePill}>● Live · In progress</span>}
        <span className={styles.entryMeta}>
          {entry.agent_name} · {fmtTime(entry.ts)}
        </span>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.thHotel}>Competitor</th>
              {PERIODS.map(p => (
                <th key={p} className={styles.thPeriod}>{PERIOD_LABELS[p]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {HOTELS.map(h => (
              <tr key={h.id} className={styles.row}>
                <td className={styles.tdHotel}>{h.name}</td>
                {PERIODS.map(p => (
                  <td key={p} className={styles.tdRate}>
                    <CellValue entry={rs[p]?.[h.id]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
