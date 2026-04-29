import styles from './NightAuditForm.module.css'

const NA_TABLE_ROWS = [
  { key: 'occ',    label: 'Occupancy',         placeholder: 'e.g. 86.81%' },
  { key: 'adr',    label: 'ADR',               placeholder: 'e.g. 158.00' },
  { key: 'revpar', label: 'RevPAR',            placeholder: 'e.g. 137.27' },
  { key: 'dep',    label: "Today's Departures", placeholder: '—' },
  { key: 'arr',    label: "Today's Arrivals",   placeholder: '—' },
  { key: 'pend',   label: 'Pending Arrivals',   placeholder: '—' },
  { key: 'avail',  label: 'Available Rooms',    placeholder: '—' },
  { key: 'walkin', label: 'Walk-In',            placeholder: '—' },
]

export default function NightAuditForm({ meta, onMetaChange }) {
  const f  = (key)  => meta[key] || ''
  const ch = (key)  => (e) => onMetaChange(key, e.target.value)

  const cancelCt        = parseInt(meta.na_cancel_ct) || 0
  const maintCt         = parseInt(meta.na_maint_ct)  || 0
  const outOfOrderCount = parseInt(meta.na_ooo)        || 0
  const guestReqCount   = parseInt(meta.na_guest_req)  || 0

  return (
    <div className={styles.wrap}>

      {/* Date */}
      <div className="field" style={{ maxWidth: 200, marginBottom: 14 }}>
        <label>Date</label>
        <input type="date" value={f('date')} onChange={ch('date')} />
      </div>

      {/* ── Hotel Statistics table ── */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <rect x="1" y="1" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.3"/>
            <rect x="7.5" y="1" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.3"/>
            <rect x="1" y="7.5" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.3"/>
            <rect x="7.5" y="7.5" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.3"/>
          </svg>
          Hotel Statistics
        </div>
        <div className={styles.tableWrap}>
          {/* Header row */}
          <div className={styles.tableHead}>
            <div className={styles.labelCorner} />
            <div className={styles.colHead}>Start Shift</div>
            <div className={styles.colHead}>Ending Day</div>
            <div className={`${styles.colHead} ${styles.newCol}`}>New Business Day</div>
          </div>
          {/* Data rows */}
          {NA_TABLE_ROWS.map(row => (
            <div key={row.key} className={styles.tableRow}>
              <div className={styles.rowLabel}>{row.label}</div>
              {['s', 'e', 'n'].map(col => (
                <input
                  key={col}
                  className={`${styles.tableInput}${col === 'n' ? ' ' + styles.newInput : ''}`}
                  type="text"
                  placeholder={row.placeholder}
                  value={f(`na_${row.key}_${col}`)}
                  onChange={ch(`na_${row.key}_${col}`)}
                />
              ))}
            </div>
          ))}
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

        {/* Quick-count row */}
        <div className={styles.actGrid}>
          <div className="field">
            <label>Declined Payments</label>
            <input type="number" min="0" placeholder="0" value={f('na_declined')} onChange={ch('na_declined')} />
          </div>
          <div className="field">
            <label>Out of Order Room Count</label>
            <input type="number" min="0" placeholder="0" value={f('na_ooo')} onChange={ch('na_ooo')} />
          </div>
          <div className="field">
            <label>Walk-in Reservations</label>
            <input type="number" min="0" placeholder="0" value={f('na_walkin_res')} onChange={ch('na_walkin_res')} />
          </div>
          <div className="field">
            <label>GTD No-Show</label>
            <input type="number" min="0" placeholder="0" value={f('na_gtd_noshow')} onChange={ch('na_gtd_noshow')} />
          </div>
          <div className="field">
            <label>Rate Adj / Refunds</label>
            <input type="number" min="0" placeholder="0" value={f('na_rate_adj')} onChange={ch('na_rate_adj')} />
          </div>
          <div className="field">
            <label>Guest Requests</label>
            <input type="number" min="0" placeholder="0" value={f('na_guest_req')} onChange={ch('na_guest_req')} />
          </div>
        </div>

        {guestReqCount > 0 && (
          <div className="field">
            <label>Guest Request Details</label>
            <textarea
              className={styles.textarea}
              rows={Math.max(3, guestReqCount)}
              placeholder={"Late checkout request\nExtra towels delivered\nRoom move requested"}
              value={f('na_guest_req_detail')}
              onChange={ch('na_guest_req_detail')}
            />
          </div>
        )}

        {outOfOrderCount > 0 && (
          <div className="field">
            <label>Out of Order Room Details</label>
            <textarea
              className={styles.textarea}
              rows={Math.max(3, outOfOrderCount)}
              placeholder={"Room 415 - thermostat issue\nRoom 111 - barn door stuck"}
              value={f('na_ooo_detail')}
              onChange={ch('na_ooo_detail')}
            />
          </div>
        )}

        {/* Cancellations */}
        <div className={styles.countGroup}>
          <div className={`field ${styles.countField}`}>
            <label>Cancellations</label>
            <input type="number" min="0" placeholder="0" value={f('na_cancel_ct')} onChange={ch('na_cancel_ct')} />
          </div>
          {cancelCt > 0 && (
            <div className={`field ${styles.detailField}`}>
              <label>Cancellation Details (one per line)</label>
              <textarea
                className={styles.textarea}
                rows={Math.max(2, cancelCt)}
                placeholder={"Guest called to cancel\nNo reason given"}
                value={f('na_cancel_detail')}
                onChange={ch('na_cancel_detail')}
              />
            </div>
          )}
        </div>

        {/* Maintenance Pass */}
        <div className={styles.countGroup}>
          <div className={`field ${styles.countField}`}>
            <label>Maintenance Pass</label>
            <input type="number" min="0" placeholder="0" value={f('na_maint_ct')} onChange={ch('na_maint_ct')} />
          </div>
          {maintCt > 0 && (
            <div className={`field ${styles.detailField}`}>
              <label>Maintenance Details (one per line)</label>
              <textarea
                className={styles.textarea}
                rows={Math.max(2, maintCt)}
                placeholder={"Room 215 - HVAC issue\nRoom 301 - Leaky faucet"}
                value={f('na_maint_detail')}
                onChange={ch('na_maint_detail')}
              />
            </div>
          )}
        </div>

        {/* Security Onsite */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="field" style={{ maxWidth: 160, marginBottom: 0 }}>
            <label>Security Onsite</label>
            <select value={f('na_security')} onChange={ch('na_security')}>
              <option value="">Select…</option>
              <option value="Yes">Yes</option>
              <option value="No">No</option>
            </select>
          </div>
          {f('na_security') === 'Yes' && (
            <div className="field" style={{ flex: 1, minWidth: 180, marginBottom: 0 }}>
              <label>Security Guard Name</label>
              <input
                type="text"
                placeholder="e.g. John Smith"
                value={f('na_security_name')}
                onChange={ch('na_security_name')}
              />
            </div>
          )}
        </div>

        {/* General Comments */}
        <div className="field">
          <label>General Comments</label>
          <textarea
            className={styles.textarea}
            rows={2}
            placeholder="Overall shift notes…"
            value={f('na_comments')}
            onChange={ch('na_comments')}
          />
        </div>

        {/* Guest Issues */}
        <div className="field">
          <label>Guest Issues / Incidents / Concerns</label>
          <textarea
            className={styles.textarea}
            rows={2}
            placeholder="Any guest issues to flag…"
            value={f('na_guest_issues')}
            onChange={ch('na_guest_issues')}
          />
        </div>

        {/* High Balances */}
        <div className="field">
          <label>High Balances</label>
          <textarea
            className={styles.textarea}
            rows={2}
            placeholder="Room number and balance…"
            value={f('na_high_bal')}
            onChange={ch('na_high_bal')}
          />
        </div>

        {/* Call Outs */}
        <div className="field">
          <label>Call Outs</label>
          <input type="text" placeholder="Agent name(s)…" value={f('na_callouts')} onChange={ch('na_callouts')} />
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
            placeholder="Any escalations or important notes…"
            value={f('manager_notes')}
            onChange={ch('manager_notes')}
          />
        </div>
        <div className="field">
          <label>Handoff Note for Morning Shift</label>
          <textarea
            className={styles.textarea}
            rows={4}
            placeholder="Anything the Morning shift should know…"
            value={f('handoff_note')}
            onChange={ch('handoff_note')}
          />
        </div>
      </div>
    </div>
  )
}
