import { useEffect, useRef, useState } from 'react'
import { HOTELS, VARIANCE_THRESHOLD, PERIOD_LABELS, getWindowStatus } from '../data/rateShop'
import styles from './RateShopSection.module.css'

const PERIODS = ['start', 'mid', 'end']


function fmtTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  let h = d.getHours(), m = d.getMinutes()
  const ap = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${h}:${String(m).padStart(2, '0')} ${ap}`
}

/**
 * RateShopSection
 *
 * Props:
 *   shiftKey       – 'morning' | 'swing' | 'night'
 *   rateShops      – { start: {}, mid: {}, end: {} }  (keyed by hotelId → { rate, ts })
 *   onChange(next) – called with updated rateShops object
 *   onVarianceAlert(alerts) – called when a rate exceeds the variance threshold
 *                             alerts: [{ hotel, period, startRate, newRate }]
 */
export default function RateShopSection({ shiftKey, rateShops, onChange, onVarianceAlert, varianceThreshold, adminOverride }) {
  const threshold = varianceThreshold ?? VARIANCE_THRESHOLD
  const [status, setStatus] = useState(() => getWindowStatus(shiftKey))

  // Refresh window status every minute
  useEffect(() => {
    const id = setInterval(() => setStatus(getWindowStatus(shiftKey)), 60_000)
    return () => clearInterval(id)
  }, [shiftKey])

  // Recalculate immediately when shift type changes
  useEffect(() => {
    setStatus(getWindowStatus(shiftKey))
  }, [shiftKey])

  // Track which (hotelId, period) combinations have already fired an alert this session
  const alertedRef = useRef(new Set())

  function updateEntry(hotelId, period, patch) {
    const prev = rateShops[period]?.[hotelId] || {}
    const updated = {
      ...rateShops,
      [period]: {
        ...(rateShops[period] || {}),
        [hotelId]: { ...prev, ...patch, ts: new Date().toISOString() },
      },
    }
    onChange(updated)
  }

  function handleChange(hotelId, period, value) {
    updateEntry(hotelId, period, { rate: value })
  }

  function handleSoldOut(hotelId, period) {
    const current = rateShops[period]?.[hotelId] || {}
    updateEntry(hotelId, period, { soldOut: !current.soldOut, rate: '' })
  }

  function handleNote(hotelId, period, note) {
    updateEntry(hotelId, period, { note })
  }

  function handleBlur(hotelId, period, value) {
    if (period === 'start' || !value) return
    const key = `${hotelId}|${period}`
    if (alertedRef.current.has(key)) return

    const startRate = parseFloat(rateShops.start?.[hotelId]?.rate)
    const newRate = parseFloat(value)
    if (isNaN(startRate) || isNaN(newRate)) return

    if (Math.abs(newRate - startRate) >= threshold) {
      alertedRef.current.add(key)
      const hotel = HOTELS.find(h => h.id === hotelId)
      onVarianceAlert([{ hotel: hotel?.name ?? hotelId, period, startRate, newRate }])
    }
  }

  const { active, message } = adminOverride
    ? { active: '__all__', message: null }
    : status

  return (
    <div className={styles.section}>
      {/* ── Header ── */}
      <div className={styles.header}>
        <div className={styles.title}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M7 4v3l2 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Rate Shop
        </div>
        <div className={`${styles.statusPill} ${active ? styles.pillActive : styles.pillClosed}`}>
          <span className={styles.pillDot} />
          {active === '__all__' ? 'All windows open' : active ? `${PERIOD_LABELS[active]} open` : 'Window closed'}
        </div>
      </div>

      {/* ── Window hint ── */}
      {message && (
        <div className={`${styles.windowHint} ${active ? styles.windowHintActive : ''}`}>
          {message}
        </div>
      )}


      {/* ── Hotel cards ── */}
      <div className={styles.hotelList}>
        {HOTELS.map(hotel => (
          <div key={hotel.id} className={styles.hotelCard}>
            <div className={styles.hotelHeader}>
              <span className={styles.hotelName}>{hotel.name}</span>
              {hotel.url ? (
                <a
                  href={hotel.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.bookLink}
                >
                  Check Rate
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                    <path d="M2 8L8 2M8 2H4M8 2v4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </a>
              ) : (
                <span className={styles.bookLinkPlaceholder}>URL not set</span>
              )}
            </div>

            <div className={styles.rateGrid}>
              {PERIODS.map(period => {
                const isActive = active === '__all__' || active === period
                const entry = rateShops[period]?.[hotel.id]
                const hasValue = entry?.rate !== undefined && entry?.rate !== ''
                const isVariant = (() => {
                  if (period === 'start' || !hasValue) return false
                  const s = parseFloat(rateShops.start?.[hotel.id]?.rate)
                  const v = parseFloat(entry?.rate)
                  return !isNaN(s) && !isNaN(v) && Math.abs(v - s) >= threshold
                })()

                const isSoldOut = !!entry?.soldOut

                return (
                  <div
                    key={period}
                    className={[
                      styles.rateCol,
                      isActive   ? styles.rateColActive   : '',
                      !isActive  ? styles.rateColDisabled : '',
                      isVariant  ? styles.rateColVariant  : '',
                      isSoldOut  ? styles.rateColSoldOut  : '',
                    ].filter(Boolean).join(' ')}
                  >
                    <div className={styles.periodLabelRow}>
                      <span className={styles.periodLabel}>{PERIOD_LABELS[period]}</span>
                      {isActive && (
                        <button
                          className={`${styles.soldOutToggle} ${isSoldOut ? styles.soldOutToggleOn : ''}`}
                          onClick={() => handleSoldOut(hotel.id, period)}
                          title={isSoldOut ? 'Mark as available' : 'Mark as sold out'}
                          type="button"
                        >
                          {isSoldOut ? '✕ Sold Out' : 'Sold Out?'}
                        </button>
                      )}
                    </div>

                    {isSoldOut ? (
                      <div className={styles.soldOutBadge}>No Rooms Available</div>
                    ) : (
                      <div className={styles.inputWrap}>
                        <span className={styles.dollarSign}>$</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="—"
                          disabled={!isActive}
                          value={entry?.rate ?? ''}
                          onChange={e => handleChange(hotel.id, period, e.target.value)}
                          onBlur={e => handleBlur(hotel.id, period, e.target.value)}
                          className={styles.rateInput}
                          aria-label={`${hotel.name} ${PERIOD_LABELS[period]} rate`}
                        />
                      </div>
                    )}

                    {!isSoldOut && hasValue && entry?.ts && (
                      <div className={styles.rateTs}>{fmtTime(entry.ts)}</div>
                    )}

                    {isVariant && (
                      <div className={styles.variantBadge}>
                        {(() => {
                          const s = parseFloat(rateShops.start?.[hotel.id]?.rate)
                          const v = parseFloat(entry?.rate)
                          const diff = v - s
                          return `${diff > 0 ? '+' : ''}$${Math.abs(diff).toFixed(0)} vs start`
                        })()}
                      </div>
                    )}

                    {isActive && (
                      <input
                        type="text"
                        placeholder="Add note…"
                        maxLength={80}
                        value={entry?.note ?? ''}
                        onChange={e => handleNote(hotel.id, period, e.target.value)}
                        className={styles.noteInput}
                        aria-label={`${hotel.name} ${PERIOD_LABELS[period]} note`}
                      />
                    )}

                    {!isActive && entry?.note && (
                      <div className={styles.noteReadOnly}>{entry.note}</div>
                    )}

                    {!isActive && !hasValue && !isSoldOut && (
                      <div className={styles.lockIcon} aria-hidden="true">
                        <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                          <rect x="2" y="4.5" width="7" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
                          <path d="M3.5 4.5V3a2 2 0 014 0v1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                        </svg>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <p className={styles.footer}>
        Variance threshold: <strong>${threshold}</strong> — manager is notified when any rate changes by more than this amount
      </p>
    </div>
  )
}
