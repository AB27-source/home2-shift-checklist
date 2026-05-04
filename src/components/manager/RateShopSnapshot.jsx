import { useState, useEffect, useMemo } from 'react'
import { getLiveRateShops, subscribeLiveRateShops } from '../../lib/supabase'
import { HOTELS, PERIOD_LABELS } from '../../data/rateShop'
import styles from './RateShopSnapshot.module.css'

const PERIODS = ['start', 'mid', 'end']

const SHIFT_COLORS = {
  'Morning Shift': '#1B1B6B',
  'Swing Shift':   '#B45309',
  'Night Audit':   '#7C3AED',
}

function fmtTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  let h = d.getHours(), m = d.getMinutes()
  const ap = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${h}:${String(m).padStart(2, '0')} ${ap}`
}

function fmtDate(str) {
  if (!str) return ''
  const [y, mo, d] = str.split('-')
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${months[parseInt(mo)-1]} ${parseInt(d)}, ${y}`
}

function today() { return new Date().toISOString().split('T')[0] }

function fmtShortDate(str) {
  if (!str) return ''
  const todayStr = today()
  if (str === todayStr) return 'Today'
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1)
  if (str === yesterday.toISOString().split('T')[0]) return 'Yesterday'
  const [, mo, d] = str.split('-')
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${months[parseInt(mo)-1]} ${parseInt(d)}`
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

// Merge live (rate_shop_live) + submitted (shift_records) into one sorted list
function buildAllEntries(liveData, records) {
  const todayStr = today()

  const submitted = (records || [])
    .filter(r => {
      const rs = r.rate_shops
      if (!rs) return false
      return HOTELS.some(h => PERIODS.some(p => rs[p]?.[h.id]?.rate || rs[p]?.[h.id]?.soldOut))
    })
    .map(r => ({ ...r, isLive: false, ts: r.submitted_at, rate_shops: r.rate_shops }))

  // Exclude live rows that already have a matching submitted record
  // (same agent + shift + date), so we don't show duplicates
  const submittedKeys = new Set(submitted.map(r => `${r.agent_id}|${r.shift}|${r.date}`))

  const live = (liveData || [])
    .filter(r => {
      const rs = r.rate_shops
      if (!rs) return false
      const hasData = HOTELS.some(h => PERIODS.some(p => rs[p]?.[h.id]?.rate || rs[p]?.[h.id]?.soldOut))
      return hasData && !submittedKeys.has(`${r.agent_id}|${r.shift}|${r.date}`)
    })
    .map(r => ({ ...r, isLive: true, ts: r.updated_at, date: typeof r.date === 'string' ? r.date : todayStr }))

  return [...live, ...submitted].sort((a, b) => new Date(b.ts) - new Date(a.ts))
}

export default function RateShopSnapshot({ records }) {
  const [liveData,  setLiveData]  = useState([])
  const [liveLoaded, setLiveLoaded] = useState(false)

  // Initial fetch
  useEffect(() => {
    getLiveRateShops({ todayOnly: true })
      .then(data => { setLiveData(data); setLiveLoaded(true) })
      .catch(() => setLiveLoaded(true))
  }, [])

  // Real-time subscription — refresh live data on any change
  useEffect(() => {
    const channel = subscribeLiveRateShops(() => {
      getLiveRateShops({ todayOnly: true }).then(setLiveData).catch(() => {})
    })
    return () => { channel.unsubscribe() }
  }, [])

  const allEntries = useMemo(() => buildAllEntries(liveData, records), [liveData, records])

  // Most recent value per [hotel, period] across all entries
  const latestCells = useMemo(() => {
    const result = {}
    for (const entry of allEntries) {
      for (const h of HOTELS) {
        for (const p of PERIODS) {
          const key = `${h.id}|${p}`
          if (result[key]) continue
          const cell = entry.rate_shops?.[p]?.[h.id]
          if (cell?.rate || cell?.soldOut) {
            result[key] = { ...cell, _entry: entry }
          }
        }
      }
    }
    return result
  }, [allEntries])

  if (!liveLoaded || allEntries.length === 0) return null

  const newest     = allEntries[0]
  const isToday    = newest.date === today()
  const liveCount  = allEntries.filter(e => e.isLive).length

  return (
    <div className={styles.card}>
      {/* ── Header ── */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.icon}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 12V6l6-4 6 4v6a1 1 0 01-1 1H3a1 1 0 01-1-1z" stroke="white" strokeWidth="1.4" strokeLinejoin="round"/>
              <path d="M5 13V9h6v4" stroke="white" strokeWidth="1.4" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <div className={styles.title}>
              Rate Shop
              {liveCount > 0 && <span className={styles.livePill}>● Live</span>}
            </div>
            <div className={styles.subtitle}>
              <span className={styles.shiftBadge} style={{ background: SHIFT_COLORS[newest.shift] || 'var(--brand)' }}>
                {newest.shift}
              </span>
              <span className={styles.meta}>
                {newest.agent_name} · {isToday ? 'Today' : fmtDate(newest.date)} at {fmtTime(newest.ts)}
                {newest.isLive && <span className={styles.inProgressLabel}> · In progress</span>}
              </span>
            </div>
          </div>
        </div>
        <div className={styles.headerRight}>
          <span className={styles.histCount}>{allEntries.length} shift{allEntries.length !== 1 ? 's' : ''} with data</span>
        </div>
      </div>

      {/* ── Latest snapshot table ── */}
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
                {PERIODS.map(p => {
                  const cell = latestCells[`${h.id}|${p}`]
                  return (
                    <td key={p} className={styles.tdRate}>
                      <CellValue entry={cell} />
                      {cell?._entry && (
                        <span className={`${styles.cellFrom} ${cell._entry.isLive ? styles.cellFromLive : ''}`}>
                          {cell._entry.isLive ? '● Live · ' : ''}{cell._entry.shift.replace(' Shift','').replace('Night Audit','Night')} · {fmtShortDate(cell._entry.date)} · {fmtTime(cell._entry.ts)}
                        </span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  )
}
