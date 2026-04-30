import { useState, useEffect } from 'react'
import { getShiftRecords, setHandoff, getTodayVarianceAlerts, subscribeVarianceAlerts, getFeedback } from '../../lib/supabase'
import { VARIANCE_THRESHOLD, PERIOD_LABELS } from '../../data/rateShop'
import FeedbackModal from '../FeedbackModal'
import ShiftHistory      from './ShiftHistory'
import ShiftCalendar     from './ShiftCalendar'
import AgentManager      from './AgentManager'
import ChecklistManager  from './ChecklistManager'
import ShiftLogBrowser   from '../ShiftLogBrowser'
import HotelSnapshot     from './HotelSnapshot'
import RateShopSnapshot  from './RateShopSnapshot'
import RateShopHistory   from './RateShopHistory'
import ThemePicker from '../ThemePicker'
import styles from './Dashboard.module.css'

export default function Dashboard({ agent, agents, sessionToken, onSignOut, showToast, onAgentsChange, handoff, onHandoffUpdate, shiftTasks, onShiftTasksChange, onLogShift }) {
  const [tab, setTab]           = useState('history')
  const [records, setRecords]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [thresholdEdit, setThresholdEdit] = useState(null)

  const handoffKey = handoff?.note
    ? `handoff_ack_${handoff.date}_${handoff.shift}_${handoff.agent_name}`
    : null
  const [handoffAccepted, setHandoffAccepted] = useState(
    () => handoffKey ? sessionStorage.getItem(handoffKey) === '1' : false
  )
  function handleAcceptHandoff() {
    setHandoffAccepted(true)
    if (handoffKey) sessionStorage.setItem(handoffKey, '1')
  }
  const [savingThreshold, setSavingThreshold] = useState(false)
  const [varianceAlerts, setVarianceAlerts] = useState([])
  const [feedbackList, setFeedbackList] = useState([])
  const [showFeedback, setShowFeedback] = useState(false)

  useEffect(() => {
    getFeedback().then(setFeedbackList).catch(() => {})
  }, [])

  useEffect(() => {
    getTodayVarianceAlerts().then(setVarianceAlerts).catch(() => {})
    const channel = subscribeVarianceAlerts(payload => {
      if (payload.new) setVarianceAlerts(prev => [payload.new, ...prev])
    })
    return () => { channel.unsubscribe() }
  }, [])

  const isGM = agent?.is_super_admin || agent?.role === 'General Manager'
  const currentThreshold = handoff?.variance_threshold ?? VARIANCE_THRESHOLD

  async function handleSaveThreshold() {
    const val = parseInt(thresholdEdit, 10)
    if (isNaN(val) || val < 1) return
    setSavingThreshold(true)
    try {
      await setHandoff({ variance_threshold: val })
      onHandoffUpdate?.({ ...handoff, variance_threshold: val })
      showToast(`Variance threshold updated to $${val}`)
      setThresholdEdit(null)
    } catch {
      showToast('Failed to save threshold')
    } finally {
      setSavingThreshold(false)
    }
  }


  useEffect(() => {
    getShiftRecords().then(data => { setRecords(data); setLoading(false) }).catch(console.error)
  }, [])

  const last7 = records.filter(r => daysSince(r.date) <= 7)
  const avgPct = last7.length
    ? Math.round(last7.reduce((s, r) => s + (r.total_done / r.total_tasks * 100), 0) / last7.length)
    : 0
  const perfect = last7.filter(r => r.total_done === r.total_tasks).length

  return (
    <div>
      <div className="topbar">
        <div className="topbar-left">
          <div className="topbar-icon">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <rect x="2" y="3" width="14" height="12" rx="2" stroke="white" strokeWidth="1.4"/>
              <path d="M5 3V1.5M13 3V1.5" stroke="white" strokeWidth="1.4" strokeLinecap="round"/>
              <path d="M2 7h14" stroke="white" strokeWidth="1.2"/>
            </svg>
          </div>
          <div>
            <div className="topbar-title">Manager Dashboard</div>
            <div className="topbar-sub">Home2 Suites Las Vegas North</div>
          </div>
        </div>
        <div className="topbar-right">
          <div className="topbar-agent-badge">⭐ Manager</div>
          <button className="signout-btn" style={{}} onClick={onLogShift}>Log a Shift</button>
          <ThemePicker agentId={agent?.id} />
          {agent?.is_super_admin && <button className="signout-btn" style={{}} onClick={() => setShowFeedback(true)}>Feedback</button>}
          <button className="signout-btn" onClick={onSignOut}>Sign out</button>
        </div>
      </div>

      <div className={styles.wrap}>
        <div className={styles.header}>
          <h2 className={styles.title}>Dashboard</h2>
          <div className={styles.tabs}>
            <button className={`${styles.tab} ${tab === 'history'   ? styles.active : ''}`} onClick={() => setTab('history')}>Shift History</button>
            <button className={`${styles.tab} ${tab === 'rateshop' ? styles.active : ''}`} onClick={() => setTab('rateshop')}>
              Rate Shop{varianceAlerts.length > 0 && <span className={styles.tabBadge}>{varianceAlerts.length}</span>}
            </button>
            <button className={`${styles.tab} ${tab === 'calendar' ? styles.active : ''}`} onClick={() => setTab('calendar')}>Calendar</button>
            <button className={`${styles.tab} ${tab === 'agents'   ? styles.active : ''}`} onClick={() => setTab('agents')}>Agent Profiles</button>
            <button className={`${styles.tab} ${tab === 'checklist' ? styles.active : ''}`} onClick={() => setTab('checklist')}>Checklist</button>
            {agent?.is_super_admin && (
              <button className={`${styles.tab} ${tab === 'feedback' ? styles.active : ''}`} onClick={() => setTab('feedback')}>
                Feedback{feedbackList.length > 0 && <span className={styles.tabBadge}>{feedbackList.length}</span>}
              </button>
            )}
          </div>
        </div>

        {/* Handoff banner */}
        {handoff?.note && (
          <div className={`${styles.handoffBanner} ${handoffAccepted ? styles.handoffBannerAccepted : ''}`}>
            <div className={styles.handoffBody}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
                <rect x="1" y="2" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M1 5h12" stroke="currentColor" strokeWidth="1"/>
                <path d="M4 8h6M4 10h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
              <span>
                <strong>Active Handoff — {handoff.agent_name}</strong>
                {handoff.shift && handoff.date ? ` (${handoff.shift}, ${handoff.date})` : ''}
                {': '}
                {handoff.note}
              </span>
            </div>
            <button
              className={`${styles.handoffBtn} ${handoffAccepted ? styles.handoffBtnAccepted : ''}`}
              onClick={handleAcceptHandoff}
              disabled={handoffAccepted}
            >
              {handoffAccepted ? '✓ Accepted' : 'Accept'}
            </button>
          </div>
        )}

        {/* Stats row */}
        <div className={styles.statsGrid}>
          {[
            { num: records.length, lbl: 'Total shifts logged' },
            { num: last7.length,   lbl: 'Shifts this week' },
            { num: avgPct + '%',   lbl: 'Avg completion (7d)' },
            { num: perfect,        lbl: 'Perfect shifts (7d)' },
            { num: agents.length,  lbl: 'Active agents' },
          ].map((s, i) => (
            <div key={i} className={styles.statCard}>
              <div className={styles.statNum}>{s.num}</div>
              <div className={styles.statLbl}>{s.lbl}</div>
            </div>
          ))}
        </div>

        {/* Snapshot grid — only on Shift History tab */}
        {!loading && tab === 'history' && (
          <div className={styles.snapshotGrid}>
            <HotelSnapshot records={records} />
            <RateShopSnapshot records={records} />
          </div>
        )}

        {/* Tab content */}
        <div className={styles.belowGrid}>
          {tab === 'history' && (
            <>
              <ShiftCalendar records={records} />
              <ShiftHistory
                records={records}
                agents={agents}
                sessionToken={sessionToken}
                loading={loading}
                onDelete={ids => setRecords(prev => prev.filter(r => !ids.includes(r.id)))}
              />
            </>
          )}
          {tab === 'rateshop' && (
            <>
              {varianceAlerts.length > 0 && (
                <div className={styles.alertsPanel}>
                  <div className={styles.alertsPanelHeader}>
                    <span className={styles.alertsPanelTitle}>🚨 Today's Variance Alerts</span>
                    <span className={styles.alertsPanelCount}>{varianceAlerts.length} alert{varianceAlerts.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className={styles.alertsList}>
                    {varianceAlerts.map(a => {
                      const diff = Number(a.new_rate) - Number(a.start_rate)
                      const sign = diff > 0 ? '+' : ''
                      const time = new Date(a.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      return (
                        <div key={a.id} className={styles.alertRow}>
                          <span className={styles.alertHotel}>{a.hotel}</span>
                          <span className={styles.alertPeriod}>{PERIOD_LABELS[a.period]}</span>
                          <span className={styles.alertRates}>
                            ${Number(a.start_rate).toFixed(2)} → ${Number(a.new_rate).toFixed(2)}
                          </span>
                          <span className={`${styles.alertDiff} ${diff > 0 ? styles.alertDiffUp : styles.alertDiffDown}`}>
                            {sign}${Math.abs(diff).toFixed(2)}
                          </span>
                          <span className={styles.alertMeta}>{a.agent_name} · {a.shift} · {time}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
              {isGM && (
                <div className={styles.thresholdBar}>
                  <span className={styles.thresholdLabel}>
                    Variance alert threshold:
                  </span>
                  {thresholdEdit === null ? (
                    <>
                      <strong className={styles.thresholdValue}>${currentThreshold}</strong>
                      <button className="btn-sm" onClick={() => setThresholdEdit(String(currentThreshold))}>Edit</button>
                    </>
                  ) : (
                    <>
                      <span className={styles.thresholdInputWrap}>
                        <span className={styles.thresholdDollar}>$</span>
                        <input
                          type="number"
                          min="1"
                          max="999"
                          value={thresholdEdit}
                          onChange={e => setThresholdEdit(e.target.value)}
                          className={styles.thresholdInput}
                          autoFocus
                        />
                      </span>
                      <button className="btn-sm" onClick={handleSaveThreshold} disabled={savingThreshold}>
                        {savingThreshold ? 'Saving…' : 'Save'}
                      </button>
                      <button className="btn-sm" onClick={() => setThresholdEdit(null)}>Cancel</button>
                    </>
                  )}
                  <span className={styles.thresholdHint}>Staff is alerted when a competitor rate changes by more than this amount between periods</span>
                </div>
              )}
              <RateShopHistory records={records} />
            </>
          )}
          {tab === 'calendar' && <ShiftLogBrowser embedded isAdmin={true} />}
          {tab === 'agents' && (
            <AgentManager
              agents={agents}
              currentAgent={agent}
              sessionToken={sessionToken}
              onAgentsChange={onAgentsChange}
              showToast={showToast}
            />
          )}
          {tab === 'checklist' && (
            <ChecklistManager
              shiftTasks={shiftTasks}
              onShiftTasksChange={onShiftTasksChange}
              showToast={showToast}
            />
          )}
          {tab === 'feedback' && (
            <FeedbackTab items={feedbackList} />
          )}
        </div>
      </div>
      {showFeedback && (
        <FeedbackModal agent={agent} onClose={() => setShowFeedback(false)} />
      )}
    </div>
  )
}

function daysSince(dateStr) {
  if (!dateStr) return 999
  return Math.floor((Date.now() - new Date(dateStr)) / 86400000)
}

const FILE_ICONS = {
  pdf: '📄', doc: '📝', docx: '📝', xls: '📊', xlsx: '📊',
  png: '🖼️', jpg: '🖼️', jpeg: '🖼️', gif: '🖼️', webp: '🖼️',
  txt: '📃', csv: '📃',
}
function getIcon(name) { return FILE_ICONS[(name?.split('.').pop() || '').toLowerCase()] || '📎' }

function FeedbackTab({ items }) {
  if (!items.length) return (
    <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
      No feedback submitted yet.
    </div>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {items.map(item => {
        const time = new Date(item.created_at).toLocaleString([], {
          month: 'short', day: 'numeric', year: 'numeric',
          hour: '2-digit', minute: '2-digit',
        })
        return (
          <div key={item.id} className="card" style={{ padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <strong style={{ fontSize: 13 }}>{item.agent_name}</strong>
                <span style={{ fontSize: 11, color: 'var(--muted)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, padding: '1px 8px' }}>{item.agent_role || 'Staff'}</span>
              </div>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>{time}</span>
            </div>
            <p style={{ fontSize: 13, lineHeight: 1.65, whiteSpace: 'pre-wrap', marginBottom: item.attachments?.length ? 10 : 0 }}>
              {item.message}
            </p>
            {item.attachments?.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {item.attachments.map((a, i) => (
                  <a
                    key={i}
                    href={a.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--brand)', background: 'var(--brand-light)', borderRadius: 20, padding: '3px 10px', textDecoration: 'none' }}
                  >
                    {getIcon(a.name)} {a.name}
                  </a>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
