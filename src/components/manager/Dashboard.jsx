import { useState, useEffect } from 'react'
import { getShiftRecords, setHandoff } from '../../lib/supabase'
import ShiftHistory      from './ShiftHistory'
import ShiftCalendar     from './ShiftCalendar'
import AgentManager      from './AgentManager'
import ShiftLogBrowser   from '../ShiftLogBrowser'
import HotelSnapshot     from './HotelSnapshot'
import RateShopSnapshot  from './RateShopSnapshot'
import RateShopHistory   from './RateShopHistory'
import styles from './Dashboard.module.css'

export default function Dashboard({ agents, sessionToken, onSignOut, showToast, onAgentsChange, handoff, onHandoffUpdate }) {
  const [tab, setTab]           = useState('history')
  const [records, setRecords]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [clearingHandoff, setClearingHandoff] = useState(false)

  async function handleClearHandoff() {
    if (!confirm('Clear the current handoff note? Agents will no longer see it.')) return
    setClearingHandoff(true)
    try {
      await setHandoff({ note: '', agent_name: '', shift: '', date: '' })
      onHandoffUpdate?.({ note: '', agent_name: '', shift: '', date: '' })
      showToast('Handoff note cleared')
    } catch (e) {
      showToast('Failed to clear handoff')
    } finally {
      setClearingHandoff(false)
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
          <div className="topbar-agent-badge" style={{ background: 'rgba(255,200,100,0.25)' }}>⭐ Manager</div>
          <button className="signout-btn" onClick={onSignOut}>Sign out</button>
        </div>
      </div>

      <div className={styles.wrap}>
        <div className={styles.header}>
          <h2 className={styles.title}>Dashboard</h2>
          <div className={styles.tabs}>
            <button className={`${styles.tab} ${tab === 'history'   ? styles.active : ''}`} onClick={() => setTab('history')}>Shift History</button>
            <button className={`${styles.tab} ${tab === 'rateshop' ? styles.active : ''}`} onClick={() => setTab('rateshop')}>Rate Shop</button>
            <button className={`${styles.tab} ${tab === 'calendar' ? styles.active : ''}`} onClick={() => setTab('calendar')}>Calendar</button>
            <button className={`${styles.tab} ${tab === 'agents'   ? styles.active : ''}`} onClick={() => setTab('agents')}>Agent Profiles</button>
          </div>
        </div>

        {/* Handoff banner */}
        {handoff?.note && (
          <div className={styles.handoffBanner}>
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
            <button className={styles.handoffClear} onClick={handleClearHandoff} disabled={clearingHandoff}>
              {clearingHandoff ? 'Clearing…' : 'Clear'}
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
          {tab === 'rateshop' && <RateShopHistory records={records} />}
          {tab === 'calendar' && <ShiftLogBrowser embedded isAdmin={true} />}
          {tab === 'agents' && (
            <AgentManager
              agents={agents}
              sessionToken={sessionToken}
              onAgentsChange={onAgentsChange}
              showToast={showToast}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function daysSince(dateStr) {
  if (!dateStr) return 999
  return Math.floor((Date.now() - new Date(dateStr)) / 86400000)
}
