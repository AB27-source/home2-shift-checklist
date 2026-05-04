import styles from './RegularShiftForm.module.css'

export default function RegularShiftForm({ meta, onMetaChange, shiftLabel }) {
  const f  = (key) => meta[key] || ''
  const ch = (key) => (e) => onMetaChange(key, e.target.value)
  const chStrip   = (key, char) => (e) => onMetaChange(key, e.target.value.split(char).join(''))
  const chNumeric = (key)       => (e) => onMetaChange(key, e.target.value.replace(/[^0-9.]/g, ''))
  const chInt     = (key)       => (e) => onMetaChange(key, e.target.value.replace(/[^0-9]/g, ''))
  const chOcc     = (key)       => (e) => onMetaChange(key, e.target.value.replace(/[^0-9.\/ O]/g, ''))

  const outOfOrderCount = parseInt(meta.ooo) || 0
  const guestReqCount = parseInt(meta.guest_req) || 0
  const refundCount = parseInt(meta.refunds) || 0
  const handoffTarget = shiftLabel === 'Morning Shift' ? 'Swing Shift' : 'Night Audit'

  return (
    <div className={styles.wrap}>

      {/* Date */}
      <div className="field" style={{ maxWidth: 200, marginBottom: 14 }}>
        <label>Date</label>
        <input type="date" value={f('date')} onChange={ch('date')} />
      </div>

      {/* ── Hotel Statistics ── */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <rect x="1" y="5" width="11" height="7" rx="1" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M4 5V3.5a2.5 2.5 0 015 0V5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          Hotel Statistics
        </div>
        <div className={styles.statsGrid}>
          <div className={`field ${styles.occField}`}>
            <label>Occupancy %</label>
            <div className={styles.inputWrap}>
              <input
                type="text"
                placeholder="e.g. 63.64 / 61.54 OOO"
                value={f('occ')}
                onChange={chOcc('occ')}
                style={{ paddingRight: 24 }}
              />
              <span className={`${styles.inputSymbol} ${styles.inputSymbolRight}`}>%</span>
            </div>
          </div>
          <div className="field">
            <label>ADR ($)</label>
            <div className={styles.inputWrap}>
              <span className={`${styles.inputSymbol} ${styles.inputSymbolLeft}`}>$</span>
              <input
                type="text"
                placeholder=""
                value={f('adr')}
                onChange={chNumeric('adr')}
                style={{ paddingLeft: 22 }}
              />
            </div>
          </div>
          <div className="field">
            <label>Pending Arrivals</label>
            <input type="text" inputMode="numeric" placeholder="0" value={f('pending')} onChange={chInt('pending')} />
          </div>
          <div className="field">
            <label>Today's Arrivals</label>
            <input type="text" inputMode="numeric" placeholder="0" value={f('arrivals')} onChange={chInt('arrivals')} />
          </div>
          <div className="field">
            <label>Departures</label>
            <input type="text" inputMode="numeric" placeholder="0" value={f('departures')} onChange={chInt('departures')} />
          </div>
        </div>
      </div>

      {/* ── Activity & Incidents ── */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M6.5 1L1 12h11L6.5 1z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
            <path d="M6.5 5v2.5M6.5 9.5v.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          Activity &amp; Incidents
        </div>
        <div className={styles.actGrid}>
          <div className="field">
            <label>Declined Payments</label>
            <input type="text" inputMode="numeric" placeholder="0" value={f('declined')} onChange={chInt('declined')} />
          </div>
          <div className="field">
            <label>Out of Order Room Count</label>
            <input type="text" inputMode="numeric" placeholder="0" value={f('ooo')} onChange={chInt('ooo')} />
          </div>
          <div className="field">
            <label>Guest Requests</label>
            <input type="text" inputMode="numeric" placeholder="0" value={f('guest_req')} onChange={chInt('guest_req')} />
          </div>
          <div className="field">
            <label>Rate Adj / Refunds</label>
            <input type="text" inputMode="numeric" placeholder="0" value={f('refunds')} onChange={chInt('refunds')} />
          </div>
        </div>
        {/* Out of Order Room detail - expands when count > 0 */}
        {outOfOrderCount > 0 && (
            <div className={`field ${styles.guestDetail}`}>
            <label>Room(s) Out of Order</label>
            <textarea
              className={styles.textarea}
              rows={Math.max(3, outOfOrderCount)}
              placeholder={"Room 415: A/C Thermostat not working\nRoom 111: Barn door stuck"}
              value={f('ooo_detail')}
              onChange={ch('ooo_detail')}
            />
          </div>
        )}

        {/* Rate adj / refund detail — expands when count > 1 */}
        {refundCount > 1 && (
          <div className={`field ${styles.guestDetail}`}>
            <label>Rate Adj / Refund Details</label>
            <textarea
              className={styles.textarea}
              rows={Math.max(3, refundCount)}
              placeholder={"Room 205: Rate corrected from $189 to $159 — manager approved"}
              value={f('refunds_detail')}
              onChange={ch('refunds_detail')}
            />
          </div>
        )}

        {/* Guest request detail — expands when count > 0 */}
        {guestReqCount > 0 && (
          <div className={`field ${styles.guestDetail}`}>
            <label>Guest Request Details</label>
            <textarea
              className={styles.textarea}
              rows={Math.max(3, guestReqCount)}
              placeholder={"Late checkout request\nExtra towels delivered\nRoom move requested"}
              value={f('guest_req_detail')}
              onChange={ch('guest_req_detail')}
            />
          </div>
        )}

        <div className={`field ${styles.guestDetail}`}>
          <label>Maintenance / Engineering Passdown</label>
          <textarea
            className={styles.textarea}
            rows={4}
            placeholder={"Room 415: thermostat issue still pending\nIce machine on 3rd floor needs follow-up"}
            value={f('maint_passdown')}
            onChange={ch('maint_passdown')}
          />
        </div>
      </div>

      {/* ── Notes & Handoff ── */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <rect x="2" y="1" width="9" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M4 4.5h5M4 6.5h5M4 8.5h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          Notes &amp; Handoff
        </div>
        <div className="field">
          <label>Notes to Manager</label>
          <textarea
            className={styles.textarea}
            rows={4}
            placeholder="Escalations, follow-up items, or anything leadership should review…"
            value={f('manager_notes')}
            onChange={ch('manager_notes')}
          />
        </div>
        <div className="field">
          <label>Handoff Note for {handoffTarget}</label>
          <textarea
            className={styles.textarea}
            rows={4}
            placeholder={`Anything the ${handoffTarget} should know before taking over…`}
            value={f('handoff_note')}
            onChange={ch('handoff_note')}
          />
        </div>
      </div>
    </div>
  )
}
