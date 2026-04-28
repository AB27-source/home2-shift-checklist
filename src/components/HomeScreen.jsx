import { useState, useEffect } from 'react'
import { getTodayAllRecords, getShiftRecords } from '../lib/supabase'
import { SHIFTS } from '../data/shifts'
import { getWindowStatus, PERIOD_LABELS, HOTELS } from '../data/rateShop'
import styles from './HomeScreen.module.css'

function todayStr() { return new Date().toISOString().split('T')[0] }

function getShiftByTime() {
  const h = new Date().getHours()
  if (h >= 6  && h < 14) return 'morning'
  if (h >= 14 && h < 22) return 'swing'
  return 'night'
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function fmtDateLong(d) {
  if (!d) return ''
  const [y, m, day] = d.split('-')
  const months = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December']
  const dow = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
  const date = new Date(y, parseInt(m) - 1, parseInt(day))
  return `${dow[date.getDay()]}, ${months[parseInt(m)-1]} ${parseInt(day)}, ${y}`
}

function fmtTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  let h = d.getHours(), m = d.getMinutes()
  const ap = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${h}:${String(m).padStart(2,'0')} ${ap}`
}

function fmtDateShort(d) {
  if (!d) return ''
  const [y, m, day] = d.split('-')
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${months[parseInt(m)-1]} ${parseInt(day)}`
}

const SHIFT_EMOJI  = { morning: '☀️', swing: '🌅', night: '🌙' }
const SHIFT_KEYS   = ['morning', 'swing', 'night']

export default function HomeScreen({ agent, handoff, onStartShift, onViewLogs, onSignOut }) {
  const currentShift = getShiftByTime()

  const [todayRecs,  setTodayRecs]  = useState([])
  const [recentRecs, setRecentRecs] = useState([])
  const [dataLoaded, setDataLoaded] = useState(false)
  const [windowStatus, setWindowStatus] = useState(() => getWindowStatus(currentShift))

  // Refresh rate-shop window status every minute
  useEffect(() => {
    const id = setInterval(() => setWindowStatus(getWindowStatus(currentShift)), 60_000)
    return () => clearInterval(id)
  }, [currentShift])

  // Load today's coverage + this agent's recent shifts
  useEffect(() => {
    Promise.all([
      getTodayAllRecords(todayStr()),
      getShiftRecords({ agentId: agent.id, days: 14 }),
    ]).then(([todayData, recentData]) => {
      setTodayRecs(todayData  || [])
      setRecentRecs((recentData || []).slice(0, 5))
      setDataLoaded(true)
    }).catch(() => setDataLoaded(true))
  }, [agent.id])

  // Map shift label → key
  function shiftKeyFor(label) {
    return Object.keys(SHIFTS).find(k => SHIFTS[k].label === label) || 'morning'
  }

  return (
    <div>
      {/* ── Topbar ── */}
      <div className="topbar">
        <div className="topbar-left">
          <div className="topbar-icon">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <rect x="2" y="3" width="14" height="12" rx="2" stroke="white" strokeWidth="1.4"/>
              <path d="M5 3V1.5M13 3V1.5" stroke="white" strokeWidth="1.4" strokeLinecap="round"/>
              <path d="M2 7h14" stroke="white" strokeWidth="1.2"/>
              <path d="M6 11l2 2 4-4" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <div className="topbar-title">Home2 Suites · Front Desk</div>
            <div className="topbar-sub">Las Vegas North</div>
          </div>
        </div>
        <div className="topbar-right">
          <div className="topbar-agent-badge">{agent.name}</div>
          {agent.role && (
            <div className="topbar-agent-badge" style={{ background: 'rgba(255,255,255,0.10)', fontSize: 11 }}>
              {agent.role}
            </div>
          )}
          <button className="signout-btn" onClick={onSignOut}>Sign out</button>
        </div>
      </div>

      {/* ── Page content ── */}
      <div className={styles.wrap}>

        {/* ── Greeting row ── */}
        <div className={styles.greetRow}>
          <div>
            <div className={styles.greetSub}>{getGreeting()},</div>
            <div className={styles.greetName}>{agent.name}</div>
          </div>
          <div className={styles.greetDate}>{fmtDateLong(todayStr())}</div>
        </div>

        {/* ── Handoff banner ── */}
        {handoff?.note && (
          <div className={styles.handoff}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
              <rect x="1" y="2" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
              <path d="M1 5h12" stroke="currentColor" strokeWidth="1"/>
              <path d="M4 8h6M4 10h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            <div>
              <span className={styles.handoffLabel}>Handoff from {handoff.agent_name}</span>
              {handoff.shift && handoff.date && (
                <span className={styles.handoffMeta}> — {handoff.shift}, {handoff.date}</span>
              )}
              <div className={styles.handoffNote}>{handoff.note}</div>
            </div>
          </div>
        )}

        {/* ── Today's shift coverage ── */}
        <div className={styles.sectionLabel}>Today's Shift Coverage</div>
        <div className={styles.shiftTiles}>
          {SHIFT_KEYS.map(key => {
            const record   = todayRecs.find(r => r.shift === SHIFTS[key].label)
            const isMine   = record?.agent_id === agent.id
            const isActive = key === currentShift
            return (
              <div
                key={key}
                className={[
                  styles.shiftTile,
                  record   ? styles.tileDone    : '',
                  isActive ? styles.tileCurrent : '',
                ].join(' ')}
              >
                <div className={styles.tileEmoji}>{SHIFT_EMOJI[key]}</div>
                <div className={styles.tileLabel}>{SHIFTS[key].label}</div>
                <div className={styles.tileInfo}>
                  {record ? (
                    <>
                      <span className={styles.chipDone}>✓ Logged</span>
                      <span className={styles.tileMeta}>
                        {isMine ? 'by you' : record.agent_name} · {fmtTime(record.submitted_at)}
                      </span>
                    </>
                  ) : (
                    <span className={isActive ? styles.chipActive : styles.chipOpen}>
                      {isActive ? 'Your shift' : 'Open'}
                    </span>
                  )}
                </div>
                {isActive && !record && (
                  <button className={styles.tileStartBtn} onClick={onStartShift}>
                    Start →
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {/* ── Main dashboard grid ── */}
        <div className={styles.grid}>

          {/* LEFT: primary CTA + rate shop */}
          <div className={styles.gridLeft}>

            {/* Primary start-shift CTA */}
            <button className={styles.ctaCard} onClick={onStartShift}>
              <div className={styles.ctaInner}>
                <div className={styles.ctaIcon}>{SHIFT_EMOJI[currentShift]}</div>
                <div>
                  <div className={styles.ctaTitle}>Start Your Shift</div>
                  <div className={styles.ctaSub}>
                    {SHIFTS[currentShift].label} · {SHIFTS[currentShift].tasks.length} tasks · includes rate shop
                  </div>
                </div>
              </div>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className={styles.ctaArrow}>
                <path d="M5 10h10M11 6l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>

            {/* Rate shop status card */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div className={styles.rateHeader}>
                <div className={styles.rateTitle}>
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                    <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.3"/>
                    <path d="M6.5 4v3l1.5 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Rate Shop — {SHIFTS[currentShift].label}
                </div>
                <div className={`${styles.windowPill} ${windowStatus.active ? styles.pillOpen : styles.pillClosed}`}>
                  <span className={styles.pillDot} />
                  {windowStatus.active ? `${PERIOD_LABELS[windowStatus.active]} open` : 'Window closed'}
                </div>
              </div>

              {windowStatus.message && (
                <div className={`${styles.windowMsg} ${windowStatus.active ? styles.windowMsgActive : ''}`}>
                  {windowStatus.message}
                </div>
              )}

              {/* Rate table preview */}
              <div className={styles.rateTableWrap}>
                <div className={styles.rateTableHead}>
                  <span>Competitor</span>
                  <span>Start of Shift</span>
                  <span>Mid Shift</span>
                  <span>End of Shift</span>
                </div>
                {HOTELS.map(hotel => (
                  <div key={hotel.id} className={styles.rateTableRow}>
                    <span className={styles.rateHotel}>
                      {hotel.name}
                      {hotel.url && (
                        <a
                          href={hotel.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.rateLink}
                          onClick={e => e.stopPropagation()}
                        >
                          ↗
                        </a>
                      )}
                    </span>
                    <span className={styles.rateEmpty}>—</span>
                    <span className={styles.rateEmpty}>—</span>
                    <span className={styles.rateEmpty}>—</span>
                  </div>
                ))}
              </div>

              <button className={styles.rateFooterBtn} onClick={onStartShift}>
                Enter rates in your shift log
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M3 6h6M7 4l2 2-2 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>

          </div>{/* /gridLeft */}

          {/* RIGHT: recent shifts + shift task reference */}
          <div className={styles.gridRight}>

            {/* Recent shifts */}
            <div className="card">
              <div className={styles.sectionHead}>
                <span className={styles.sectionTitle}>My Recent Shifts</span>
                <button className="btn-sm" onClick={onViewLogs}>View all</button>
              </div>

              {!dataLoaded ? (
                <div className={styles.placeholder}>Loading…</div>
              ) : recentRecs.length === 0 ? (
                <div className={styles.placeholder}>No shifts logged yet — submit your first shift log!</div>
              ) : (
                <div className={styles.recentList}>
                  {recentRecs.map(r => {
                    const pct = Math.round(r.total_done / r.total_tasks * 100)
                    const key = shiftKeyFor(r.shift)
                    return (
                      <div key={r.id} className={styles.recentRow}>
                        <span className={styles.recentEmoji}>{SHIFT_EMOJI[key] || '📋'}</span>
                        <div className={styles.recentInfo}>
                          <div className={styles.recentShift}>{r.shift}</div>
                          <div className={styles.recentMeta}>{fmtDateShort(r.date)} · {r.total_done}/{r.total_tasks} tasks</div>
                        </div>
                        <div
                          className={`${styles.recentPct} ${pct === 100 ? styles.pctPerfect : pct >= 75 ? styles.pctGood : styles.pctWarn}`}
                        >
                          {pct}%
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Shift task reference */}
            <div className="card">
              <div className={styles.sectionHead}>
                <span className={styles.sectionTitle}>Shift Task Summary</span>
              </div>
              <div className={styles.taskRefList}>
                {SHIFT_KEYS.map(key => (
                  <div
                    key={key}
                    className={`${styles.taskRefRow} ${key === currentShift ? styles.taskRefActive : ''}`}
                  >
                    <span className={styles.taskRefEmoji}>{SHIFT_EMOJI[key]}</span>
                    <div className={styles.taskRefInfo}>
                      <span className={styles.taskRefName}>{SHIFTS[key].label}</span>
                      {key === currentShift && <span className={styles.taskRefYours}>Your shift</span>}
                    </div>
                    <span className={styles.taskRefCount}>{SHIFTS[key].tasks.length} tasks</span>
                  </div>
                ))}
              </div>
              <button className={styles.taskRefBtn} onClick={onStartShift}>
                Open checklist to check off tasks →
              </button>
            </div>

            {/* View logs shortcut */}
            <button className={styles.logsCard} onClick={onViewLogs}>
              <div className={styles.logsInner}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <rect x="2" y="1.5" width="14" height="15" rx="2" stroke="currentColor" strokeWidth="1.4"/>
                  <path d="M5 6h8M5 9h8M5 12h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                </svg>
                <div>
                  <div className={styles.logsTitle}>Shift Log Archive</div>
                  <div className={styles.logsSub}>Browse all past shift logs by date</div>
                </div>
              </div>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M4 8h8M9 5l3 3-3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>

          </div>{/* /gridRight */}
        </div>{/* /grid */}
      </div>
    </div>
  )
}
