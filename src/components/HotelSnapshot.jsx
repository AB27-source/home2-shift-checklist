import { useMemo } from 'react'
import { parseNightAuditFromPostText, parseMetaFromPostText, isNightAuditPost } from '../lib/utils'
import styles from './HotelSnapshot.module.css'

function fmtDateTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  let h = d.getHours(), m = d.getMinutes()
  const ap = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} at ${h}:${String(m).padStart(2,'0')} ${ap}`
}

function today() { return new Date().toISOString().split('T')[0] }

function StatBig({ label, value }) {
  return (
    <div className={styles.statBig}>
      <div className={styles.statBigVal}>{value || '—'}</div>
      <div className={styles.statBigLbl}>{label}</div>
    </div>
  )
}

function StatSm({ label, value, highlight }) {
  const empty = !value || value === '—' || value === '0' || value === ''
  return (
    <div className={styles.statSm}>
      <div className={`${styles.statSmVal} ${!empty && highlight ? styles.statSmHighlight : ''}`}>
        {empty ? '0' : value}
      </div>
      <div className={styles.statSmLbl}>{label}</div>
    </div>
  )
}

const SHIFT_COLORS = {
  'Night Audit':   '#7C3AED',
  'Morning Shift': '#1B1B6B',
  'Swing Shift':   '#B45309',
}

export default function HotelSnapshot({ record }) {
  const isNA = useMemo(() => isNightAuditPost(record?.post_text || ''), [record?.post_text])
  const data  = useMemo(() => {
    if (!record) return {}
    const parsed = record.post_text
      ? (isNA ? parseNightAuditFromPostText(record.post_text) : parseMetaFromPostText(record.post_text))
      : {}
    if (isNA) return parsed
    // For regular shifts, prefer direct DB columns over parsed post text
    return {
      ...parsed,
      occ: record.occupancy || parsed.occ,
      adr: (record.adr || parsed.adr || '').toString().replace(/^\$/, ''),
      declined: record.declined_payments || parsed.declined,
    }
  }, [record, isNA])

  if (!record) return null

  const isOld     = record.date !== today()
  const badgeColor = SHIFT_COLORS[record.shift] || '#1B1B6B'

  return (
    <div className={styles.card}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.icon}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <rect x="2" y="2" width="16" height="16" rx="3" stroke="white" strokeWidth="1.6"/>
              <path d="M6 7h8M6 10h8M6 13h5" stroke="white" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
          </div>
          <div>
            <div className={styles.title}>Hotel Snapshot</div>
            <div className={styles.meta}>
              <span className={styles.shiftBadge} style={{ background: badgeColor }}>
                {record.shift}
              </span>
              <span className={styles.agentName}>{record.agent_name}</span>
              <span className={styles.dot}>·</span>
              <span className={styles.time}>{fmtDateTime(record.submitted_at)}</span>
            </div>
          </div>
        </div>
        {isOld && <span className={styles.oldBadge}>Not from today</span>}
      </div>

      {isNA ? <NightAuditStats data={data} /> : <RegularStats data={data} />}
    </div>
  )
}

function NightAuditStats({ data }) {
  const adr = data.na_adr_n || data.na_adr_s || ''
  const revpar = data.na_revpar_n || data.na_revpar_s || ''
  return (
    <>
      <div className={styles.bigRow}>
        <StatBig label="OCCUPANCY (NEW BIZ DAY)" value={(data.na_occ_n || data.na_occ_s) ? `${data.na_occ_n || data.na_occ_s}%` : '—'} />
        <StatBig label="ADR"                      value={adr ? `$${adr}` : '—'} />
        <StatBig label="REVPAR (NEW BIZ DAY)"     value={revpar ? `$${revpar}` : '—'} />
        <StatBig label="TODAY'S ARRIVALS (START)" value={data.na_arr_s} />
      </div>
      <div className={styles.divider} />
      <div className={styles.smRow}>
        <StatSm label="PENDING ARRIVALS"   value={data.na_pend_s || data.na_pend_n} />
        <StatSm label="DECLINED PAYMENTS"  value={data.na_declined} highlight />
        <StatSm label="OUT OF ORDER ROOMS" value={data.na_ooo}      highlight />
        <StatSm label="WALK-IN RES"        value={data.na_walkin_res} />
        <StatSm label="GTD NO-SHOW"        value={data.na_gtd_noshow} highlight />
        <StatSm label="CANCELLATIONS"      value={data.na_cancel_ct} />
        <StatSm label="MAINTENANCE PASS"   value={data.na_maint_ct}  highlight />
        <StatSm label="SECURITY ONSITE"    value={data.na_security} />
      </div>
      {(data.na_callouts || data.na_high_bal) && (
        <>
          <div className={styles.divider} />
          <div className={styles.smRow}>
            <StatSm label="CALL OUTS"    value={data.na_callouts} highlight />
            <StatSm label="HIGH BALANCES" value={data.na_high_bal} highlight />
          </div>
        </>
      )}
    </>
  )
}

function RegularStats({ data }) {
  return (
    <>
      <div className={styles.bigRow}>
        <StatBig label="OCCUPANCY"        value={data.occ ? `${data.occ}%` : '—'} />
        <StatBig label="ADR"              value={data.adr ? `$${data.adr}` : '—'} />
        <StatBig label="TODAY'S ARRIVALS" value={data.arrivals} />
        <StatBig label="DEPARTURES"       value={data.departures} />
      </div>
      <div className={styles.divider} />
      <div className={styles.smRow}>
        <StatSm label="PENDING ARRIVALS"    value={data.pending} />
        <StatSm label="DECLINED PAYMENTS"   value={data.declined}  highlight />
        <StatSm label="OUT OF ORDER ROOMS"  value={data.ooo}       highlight />
        <StatSm label="GUEST REQUESTS"      value={data.guest_req} highlight />
        <StatSm label="RATE ADJ / REFUNDS"  value={data.refunds}   highlight />
      </div>
    </>
  )
}
