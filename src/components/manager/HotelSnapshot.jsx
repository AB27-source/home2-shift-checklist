import { useMemo } from 'react'
import { parseMetaFromPostText, parseNightAuditFromPostText } from '../../lib/utils'
import styles from './HotelSnapshot.module.css'

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

export default function HotelSnapshot({ records }) {
  const latest = records?.[0] ?? null

  const isNightAudit = latest?.shift === 'Night Audit'

  const data = useMemo(() => {
    if (!latest) return null
    if (isNightAudit) {
      const na = parseNightAuditFromPostText(latest.post_text || '')
      return {
        isNA:         true,
        occ:          latest.occupancy || na.na_occ_n || na.na_occ_s || '—',
        adr:          latest.adr       || na.na_adr_n || na.na_adr_s || '—',
        revpar:       na.na_revpar_n   || na.na_revpar_s || '—',
        arrivals:     na.na_arr_s      || '—',
        departures:   na.na_dep_s      || '—',
        pending:      na.na_pend_s     || '0',
        declined:     latest.declined_payments || na.na_declined || '0',
        ooo:          na.na_ooo || '0',
        oooDetail:    na.na_ooo_detail || '',
        walkinRes:    na.na_walkin_res  || '0',
        gtdNoShow:    na.na_gtd_noshow  || '0',
        cancellations: na.na_cancel_ct  || '0',
        cancelDetail:  na.na_cancel_detail || '',
        maintenance:  na.na_maint_ct   || '0',
        maintDetail:  na.na_maint_detail || '',
        security:     na.na_security   || '—',
        callouts:     na.na_callouts   || 'None',
        highBal:      na.na_high_bal   || 'None',
        guestIssues:  na.na_guest_issues || 'None',
        notes:        latest.manager_notes || na.manager_notes,
      }
    }
    const parsed = parseMetaFromPostText(latest.post_text || '')
    return {
      isNA:        false,
      occ:         latest.occupancy        || parsed.occ         || '—',
      adr:         latest.adr              || parsed.adr         || '—',
      arrivals:    parsed.arrivals                               || '—',
      departures:  parsed.departures                             || '—',
      pending:     parsed.pending                                || '0',
      declined:    latest.declined_payments || parsed.declined   || '0',
      ooo:         parsed.ooo                                    || '0',
      oooDetail:   parsed.ooo_detail                             || '',
      guestReq:    parsed.guest_req                              || '0',
      guestDetail: parsed.guest_req_detail                       || '',
      refunds:     parsed.refunds                                || '0',
      maintenance: parsed.maint_passdown                         || '',
      notes:       latest.manager_notes,
    }
  }, [latest, isNightAudit])

  if (!latest || !data) return null

  const isToday    = latest.date === new Date().toISOString().split('T')[0]
  const hasNotes   = data.notes && data.notes !== '0'
  const shiftColor = SHIFT_COLORS[latest.shift] || 'var(--brand)'

  // Regular-shift derived values
  const declined = parseInt(data.declined) || 0
  const ooo      = parseInt(data.ooo) || 0
  const guestReq = parseInt(data.guestReq) || 0
  const refunds  = parseInt(data.refunds) || 0

  // Night Audit derived values
  const naCancellations = parseInt(data.cancellations) || 0
  const naMaintenance   = parseInt(data.maintenance) || 0
  const naWalkinRes     = parseInt(data.walkinRes) || 0
  const naGtdNoShow     = parseInt(data.gtdNoShow) || 0

  return (
    <div className={styles.card}>

      {/* ── Header ── */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.headerIcon}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <rect x="1" y="1" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
              <rect x="10" y="1" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
              <rect x="1" y="10" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
              <rect x="10" y="10" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
            </svg>
          </div>
          <div>
            <div className={styles.title}>Hotel Snapshot</div>
            <div className={styles.subtitle}>
              <span className={styles.shiftBadge} style={{ background: shiftColor }}>
                {latest.shift}
              </span>
              <span className={styles.agentName}>{latest.agent_name}</span>
              <span className={styles.sep}>·</span>
              <span className={styles.timestamp}>
                {isToday ? 'Today' : fmtDate(latest.date)} at {fmtTime(latest.submitted_at)}
              </span>
            </div>
          </div>
        </div>
        {!isToday && (
          <div className={styles.stalePill}>Not from today</div>
        )}
      </div>

      {/* ── Manager notes alert ── */}
      {hasNotes && (
        <div className={styles.notesAlert}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
            <path d="M7 1L1 13h12L7 1z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
            <path d="M7 5.5v3M7 10v.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          <span><strong>Manager note: </strong>{data.notes}</span>
        </div>
      )}

      {/* ── Primary metrics ── */}
      <div className={styles.primaryGrid}>
        <PrimaryMetric label={isNightAudit ? 'Occupancy (New Biz Day)' : 'Occupancy'} value={data.occ && data.occ !== '—' ? `${data.occ}%` : data.occ} />
        <PrimaryMetric label="ADR"              value={data.adr !== '—' ? `$${data.adr}` : '—'} />
        {isNightAudit
          ? <PrimaryMetric label="RevPAR (New Biz Day)" value={data.revpar !== '—' ? `$${data.revpar}` : '—'} />
          : <PrimaryMetric label="Today's Arrivals"    value={data.arrivals} />
        }
        <PrimaryMetric label={isNightAudit ? "Today's Arrivals (Start)" : 'Departures'} value={isNightAudit ? data.arrivals : data.departures} />
      </div>

      {/* ── Secondary metrics ── */}
      {isNightAudit ? (
        <div className={styles.secondaryGrid}>
          <SecMetric label="Pending Arrivals"  value={data.pending}       warn={parseInt(data.pending) > 0} />
          <SecMetric label="Declined Payments" value={data.declined}      alert={parseInt(data.declined) > 0} />
          <SecMetric label="Out of Order Rooms" value={data.ooo}          warn={parseInt(data.ooo) > 0} detail={parseInt(data.ooo) > 0 && data.oooDetail ? data.oooDetail : null} />
          <SecMetric label="Walk-in Res"        value={data.walkinRes}     warn={naWalkinRes > 0} />
          <SecMetric label="GTD No-Show"        value={data.gtdNoShow}     warn={naGtdNoShow > 0} />
          <SecMetric label="Cancellations"      value={data.cancellations} alert={naCancellations > 0} detail={naCancellations > 0 && data.cancelDetail ? data.cancelDetail : null} />
          <SecMetric label="Maintenance Pass"   value={data.maintenance}   warn={naMaintenance > 0} detail={naMaintenance > 0 && data.maintDetail ? data.maintDetail : null} />
          <SecMetric label="Security Onsite"    value={data.security} />
          <SecMetric label="Call Outs"          value={data.callouts !== 'None' ? data.callouts : '—'} warn={data.callouts !== 'None' && data.callouts !== '—'} />
          <SecMetric label="High Balances"      value={data.highBal !== 'None' ? '⚠' : '—'} warn={data.highBal !== 'None'} detail={data.highBal !== 'None' ? data.highBal : null} />
        </div>
      ) : (
        <div className={styles.secondaryGrid}>
          <SecMetric label="Pending Arrivals"   value={data.pending}    warn={parseInt(data.pending) > 0} />
          <SecMetric label="Declined Payments"  value={data.declined}   alert={declined > 0} />
          <SecMetric label="Out of Order Rooms" value={data.ooo}        warn={ooo > 0} detail={ooo > 0 && data.oooDetail ? data.oooDetail : null} />
          <SecMetric label="Guest Requests"     value={data.guestReq}   detail={guestReq > 0 && data.guestDetail ? data.guestDetail : null} warn={guestReq > 0} />
          <SecMetric label="Rate Adj / Refunds" value={data.refunds}    alert={refunds > 0} />
          <SecMetric label="Maintenance / Passdown" value={data.maintenance ? '⚠' : '—'} warn={!!data.maintenance} detail={data.maintenance || null} />
        </div>
      )}
    </div>
  )
}

function PrimaryMetric({ label, value }) {
  return (
    <div className={styles.primaryMetric}>
      <div className={styles.primaryValue}>{value}</div>
      <div className={styles.primaryLabel}>{label}</div>
    </div>
  )
}

function SecMetric({ label, value, alert, warn, detail }) {
  const cls = alert ? styles.secAlert : warn ? styles.secWarn : ''
  return (
    <div className={`${styles.secMetric} ${cls}`}>
      <span className={styles.secValue}>{value}</span>
      <span className={styles.secLabel}>{label}</span>
      {detail && <span className={styles.secDetail}>↳ {detail}</span>}
    </div>
  )
}
