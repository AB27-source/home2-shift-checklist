import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { SHIFTS } from '../data/shifts'
import { saveShiftRecord, updateShiftRecord, getAgentTodayRecords, getTodayAllRecords, postToTeams, setHandoff, getPreviousShiftLogs, MANAGER_WEBHOOK } from '../lib/supabase'
import { postShiftLogToTeams } from '../lib/teamsClient'
import { filterManagerNotes, parseMetaFromPostText, isNightAuditPost, parseNightAuditFromPostText } from '../lib/utils'
import NightAuditForm from './NightAuditForm'
import RegularShiftForm from './RegularShiftForm'
import RateShopSection from './RateShopSection'
import FileAttachments from './FileAttachments'
import PostPreview from './PostPreview'
import TaskItem from './TaskItem'
import PriorShifts from './PriorShifts'
import PreviousShiftLogs from './PreviousShiftLogs'
import { HOTELS, PERIOD_LABELS, getActivePeriod } from '../data/rateShop'
import styles from './Checklist.module.css'

const SESSION_PREFIX = 'home2_session_'

function today() { return new Date().toISOString().split('T')[0] }

function getShiftByTime() {
  const hour = new Date().getHours()
  if (hour >= 6 && hour < 14)  return 'morning'
  if (hour >= 14 && hour < 22) return 'swing'
  return 'night'
}

function fmtDate(d) {
  if (!d) return new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  const [y, m, day] = d.split('-')
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December']
  return `${months[parseInt(m)-1]} ${parseInt(day)}, ${y}`
}

function fmtTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  let h = d.getHours(), m = d.getMinutes()
  const ap = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${h}:${String(m).padStart(2,'0')} ${ap}`
}

function splitLines(value) {
  return String(value || '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
}

function formatInlineValue(value, fallback = '—') {
  const lines = splitLines(value)
  return lines.length ? lines.join(' | ') : fallback
}

function hasDisplayValue(value) {
  const normalized = String(value ?? '').trim()
  return normalized !== '' && normalized !== '—' && normalized !== 'None'
}

function hasPositiveNumber(value) {
  return (parseInt(value, 10) || 0) > 0
}

// parseMetaFromPostText is imported from lib/utils

const EMPTY_RATE_SHOPS = () => ({ start: {}, mid: {}, end: {} })

// Shift end times in minutes-since-midnight, plus a 10-minute edit grace period.
const SHIFT_EDIT_CLOSE = {
  'Morning Shift': 14 * 60 + 10, // 2:10 PM
  'Swing Shift':   22 * 60 + 10, // 10:10 PM
  'Night Audit':    6 * 60 + 10, //  6:10 AM
}

function isEditWindowOpen(shiftLabel) {
  const now = new Date()
  const mins = now.getHours() * 60 + now.getMinutes()
  const close = SHIFT_EDIT_CLOSE[shiftLabel]
  if (close === undefined) return false
  // Night Audit window is early morning only
  if (shiftLabel === 'Night Audit') return mins <= close
  // Morning / Swing: any time up to their close minute
  return mins <= close
}

function editWindowCloseLabel(shiftLabel) {
  if (shiftLabel === 'Morning Shift') return '2:10 PM'
  if (shiftLabel === 'Swing Shift')   return '10:10 PM'
  if (shiftLabel === 'Night Audit')   return '6:10 AM'
  return ''
}

// Returns a readable list of what changed between two form snapshots.
function computeFormDiff(origMeta, newMeta, origTaskState, newTaskState, tasks) {
  const changes = []

  const metaLabels = {
    occ: 'Occupancy', adr: 'ADR', declined: 'Declined Payments',
    ooo: 'OOO Rooms', guest_req: 'Guest Requests', refunds: 'Rate Adj/Refunds',
    pending: 'Pending Arrivals', arrivals: "Today's Arrivals", departures: 'Departures',
    handoff_note: 'Handoff Note', manager_notes: 'Notes to Manager',
    ooo_detail: 'OOO Details', guest_req_detail: 'Guest Request Details',
    maint_passdown: 'Maintenance/Passdown',
    na_occ_s: 'Occ (Start)', na_occ_e: 'Occ (End)', na_occ_n: 'Occ (New Day)',
    na_adr_s: 'ADR (Start)', na_adr_e: 'ADR (End)', na_adr_n: 'ADR (New Day)',
    na_dep_s: 'Departures (Start)', na_arr_s: 'Arrivals (Start)',
    na_comments: 'General Comments', na_guest_issues: 'Guest Issues',
    na_high_bal: 'High Balances', na_callouts: 'Call Outs',
    na_declined: 'Declined Payments', na_cancel_detail: 'Cancellation Details',
    na_maint_detail: 'Maintenance Details', na_guest_req_detail: 'Guest Request Details',
    na_ooo_detail: 'OOO Details',
  }

  Object.keys(metaLabels).forEach(key => {
    const orig = String(origMeta[key] ?? '').trim()
    const next = String(newMeta[key] ?? '').trim()
    if (orig === next) return
    const label = metaLabels[key]
    if (!orig)       changes.push(`${label}: (added) ${next}`)
    else if (!next)  changes.push(`${label}: (removed)`)
    else             changes.push(`${label}: ${orig} → ${next}`)
  })

  tasks.forEach(t => {
    const o = origTaskState[t.id] || {}
    const n = newTaskState[t.id] || {}
    if (o.done !== n.done) {
      changes.push(`Task "${t.name}": ${o.done ? 'Done → Skipped' : 'Skipped → Done'}`)
    }
    const oNote = String(o.note ?? '').trim()
    const nNote = String(n.note ?? '').trim()
    if (oNote !== nNote) {
      if (!oNote)      changes.push(`Task "${t.name}" note: (added) ${nNote}`)
      else if (!nNote) changes.push(`Task "${t.name}" note: (removed)`)
      else             changes.push(`Task "${t.name}" note: "${oNote}" → "${nNote}"`)
    }
  })

  return changes
}

export default function Checklist({ agent, handoff, onHome, onSignOut, showToast, onHandoffUpdate }) {
  const sessionKey = SESSION_PREFIX + agent.id

  const [shift, setShift]           = useState(getShiftByTime)
  const [taskState, setTaskState]   = useState({})
  const [meta, setMeta]             = useState({ date: today() })
  const [postText, setPostText]     = useState('')
  const [showOutput, setShowOutput] = useState(false)
  const [postStatus, setPostStatus] = useState(null)
  const [posted, setPosted]         = useState(false)
  const [showPrior, setShowPrior]   = useState(false)
  const [prevLogs, setPrevLogs]             = useState([])
  const [prevLogsLoading, setPrevLogsLoading] = useState(true)

  // Feature: edit existing / cover flow
  const [choiceRecords, setChoiceRecords]       = useState(null) // null | array of today's records
  const [editRecordId, setEditRecordId]         = useState(null) // null | string id
  const [postedRecordId, setPostedRecordId]     = useState(null) // id of last successfully saved record
  const [originalFormState, setOriginalFormState] = useState(null) // snapshot when edit-from-success starts
  const [postVersion, setPostVersion]           = useState(1) // increments with each edit post

  // Shift-conflict detection: all records for today (all agents)
  const [todayAllRecords, setTodayAllRecords] = useState([])

  // File attachments
  const [attachments, setAttachments] = useState([])

  // Rate shop
  const [rateShops, setRateShops]         = useState(EMPTY_RATE_SHOPS)
  const [rateShopReminder, setRateShopReminder] = useState(null) // active period key
  const prevRatePeriodRef                 = useRef(null)
  // Track which variance alerts have already been sent this session
  const sentVarianceRef = useRef(new Set())

  // ── Session restore + "already submitted today?" check ──────────────────
  useEffect(() => {
    async function init() {
      try {
        const raw = localStorage.getItem(sessionKey)
        if (raw) {
          const saved = JSON.parse(raw)
          if (saved.meta?.date === today()) {
            if (saved.shift)      setShift(saved.shift)
            if (saved.taskState)  setTaskState(saved.taskState)
            if (saved.meta)       setMeta(saved.meta)
            if (saved.rateShops)  setRateShops(saved.rateShops)
            showToast('✓ Progress restored')
            return // in-progress session found — skip DB check
          }
          localStorage.removeItem(sessionKey)
        }
      } catch(e) {}

      setShift(getShiftByTime())

      // No in-progress session — check DB for this agent AND load all-agent records in parallel
      try {
        const [agentRecs, allRecs] = await Promise.all([
          getAgentTodayRecords(agent.id, today()),
          getTodayAllRecords(today()),
        ])
        if (allRecs)   setTodayAllRecords(allRecs)
        if (agentRecs && agentRecs.length > 0) setChoiceRecords(agentRecs)
      } catch(e) { /* non-fatal — just start fresh */ }
    }
    init()
  }, [])

  // ── Load previous shift logs when active shift changes ──────────────────
  useEffect(() => {
    setPrevLogsLoading(true)
    setPrevLogs([])
    const todayStr = today()
    const d = new Date(); d.setDate(d.getDate() - 1)
    const yesterdayStr = d.toISOString().split('T')[0]

    let labels, dates
    if (shift === 'morning') {
      labels = ['Night Audit'];  dates = [yesterdayStr, todayStr]
    } else if (shift === 'swing') {
      labels = ['Morning Shift']; dates = [todayStr]
    } else {
      labels = ['Swing Shift', 'Morning Shift']; dates = [todayStr]
    }

    getPreviousShiftLogs(labels, dates)
      .then(data => { setPrevLogs(data); setPrevLogsLoading(false) })
      .catch(() => setPrevLogsLoading(false))
  }, [shift])

  // ── Rate shop window reminder ────────────────────────────────────────────
  useEffect(() => {
    function checkWindow() {
      const active = getActivePeriod(shift)
      const prev   = prevRatePeriodRef.current
      prevRatePeriodRef.current = active

      // Chime fires once per window — gated by localStorage
      if (active && active !== prev) {
        const key = `rateShop_notified_${shift}_${today()}_${active}`
        if (!localStorage.getItem(key)) {
          localStorage.setItem(key, '1')
          try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)()
            ;[523.25, 659.25, 783.99].forEach((freq, i) => {
              const osc = ctx.createOscillator(), gain = ctx.createGain()
              osc.connect(gain); gain.connect(ctx.destination)
              osc.type = 'sine'; osc.frequency.value = freq
              const t = ctx.currentTime + i * 0.2
              gain.gain.setValueAtTime(0, t)
              gain.gain.linearRampToValueAtTime(0.28, t + 0.02)
              gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55)
              osc.start(t); osc.stop(t + 0.55)
            })
          } catch (_) {}
        }
      }
      // Banner always tracks the current active period (independent of chime)
      setRateShopReminder(active)
    }

    checkWindow()
    const id = setInterval(checkWindow, 60_000)
    return () => clearInterval(id)
  }, [shift])

  // ── Auto-save (skipped when editing an existing record) ─────────────────
  const saveSession = useCallback((s, ts, m, rs) => {
    if (editRecordId) return // edits aren't cached — DB record is source of truth
    try { localStorage.setItem(sessionKey, JSON.stringify({ shift: s, taskState: ts, meta: m, rateShops: rs })) } catch(e) {}
  }, [sessionKey, editRecordId])

  // ── Load an existing record into the form for editing ───────────────────
  function handleEditRecord(r) {
    const shiftKey = Object.keys(SHIFTS).find(k => SHIFTS[k].label === r.shift) || getShiftByTime()
    setShift(shiftKey)
    setEditRecordId(r.id)
    setChoiceRecords(null)
    setShowOutput(false)
    setPosted(false)
    setPostStatus(null)
    setRateShops(r.rate_shops || EMPTY_RATE_SHOPS())

    // Rebuild taskState from saved tasks array
    const ts = {}
    if (Array.isArray(r.tasks)) {
      r.tasks.forEach(t => { ts[t.id] = { done: !!t.done, timestamp: t.timestamp || null, note: t.note || '' } })
    }
    setTaskState(ts)

    // Populate meta — detect Night Audit format vs regular
    if (isNightAuditPost(r.post_text || '')) {
      const naParsed = parseNightAuditFromPostText(r.post_text || '')
      setMeta({
        date:          r.date || today(),
        manager_notes: r.manager_notes || naParsed.manager_notes || '',
        handoff_note:  r.handoff_note || naParsed.handoff_note || '',
        na_declined:   r.declined_payments || naParsed.na_declined || '',
        ...naParsed,
      })
    } else {
      const parsed = parseMetaFromPostText(r.post_text || '')
      setMeta({
        date:             r.date || today(),
        occ:              r.occupancy          || parsed.occ              || '',
        adr:              r.adr                || parsed.adr              || '',
        declined:         r.declined_payments  || parsed.declined         || '',
        manager_notes:    r.manager_notes      || '',
        handoff_note:     r.handoff_note       || '',
        pending:          parsed.pending          || '',
        arrivals:         parsed.arrivals         || '',
        departures:       parsed.departures       || '',
        ooo:              parsed.ooo              || '',
        ooo_detail:       parsed.ooo_detail       || '',
        guest_req:        parsed.guest_req        || '',
        guest_req_detail: parsed.guest_req_detail || '',
        refunds:          parsed.refunds          || '',
        maint_passdown:   parsed.maint_passdown   || '',
      })
    }

    setAttachments(Array.isArray(r.attachments) ? r.attachments : [])
    setPostVersion((r.edit_history?.length || 0) + 2)
    showToast('✏️ Loaded for editing')
  }

  function cancelEdit() {
    setEditRecordId(null)
    setOriginalFormState(null)
    setPostVersion(1)
    setTaskState({})
    setMeta({ date: today() })
    setShift(getShiftByTime())
    setAttachments([])
    setRateShops(EMPTY_RATE_SHOPS())
    setShowOutput(false)
    setPosted(false)
    setPostStatus(null)
  }

  // ── Enter edit mode from the success state (post already sent to Teams) ──
  function handleEditPostedLog() {
    setOriginalFormState({
      meta: { ...meta },
      taskState: JSON.parse(JSON.stringify(taskState)),
    })
    setEditRecordId(postedRecordId)
    setPostVersion(v => v + 1)
    setPosted(false)
    setPostStatus(null)
    setShowOutput(false)
    showToast('✏️ Edit mode — a new card with your changes will be posted')
  }

  // ── Field / shift change handlers ────────────────────────────────────────
  function handleShiftChange(s) {
    setShift(s); setTaskState({}); setShowOutput(false); setPosted(false)
    if (editRecordId) setEditRecordId(null) // leaving edit mode when shift changes
    saveSession(s, {}, meta, rateShops)
  }

  function handleTaskChange(id, newState) {
    const next = { ...taskState, [id]: newState }
    setTaskState(next)
    saveSession(shift, next, meta, rateShops)
  }

  function handleMetaChange(key, val) {
    const next = { ...meta, [key]: val }
    setMeta(next)
    saveSession(shift, taskState, next, rateShops)
  }

  function handleRateShopsChange(next) {
    setRateShops(next)
    saveSession(shift, taskState, meta, next)
  }

  // ── Rate variance alert → send Teams notification to manager ──────────────
  async function handleVarianceAlert(alerts) {
    alerts.forEach(alert => {
      const key = `${alert.hotel}|${alert.period}`
      if (sentVarianceRef.current.has(key)) return
      sentVarianceRef.current.add(key)

      const diff = alert.newRate - alert.startRate
      const sign = diff > 0 ? '+' : ''
      const msg = [
        `🚨 Rate Shop Variance Alert`,
        `Hotel: ${alert.hotel}`,
        `Shift: ${SHIFTS[shift].label}  |  Agent: ${agent.name}`,
        `${PERIOD_LABELS[alert.period]} rate: $${Number(alert.newRate).toFixed(2)}  vs  Start: $${Number(alert.startRate).toFixed(2)}  (Δ${sign}$${Math.abs(diff).toFixed(2)})`,
      ].join('\n')

      if (MANAGER_WEBHOOK) {
        postToTeams(msg, MANAGER_WEBHOOK).catch(() => {})
      }
    })
    showToast('⚠️ Rate variance detected — manager notified')
  }

  const tasks     = SHIFTS[shift].tasks
  const doneCount = tasks.filter(t => taskState[t.id]?.done).length
  const pct       = tasks.length ? Math.round(doneCount / tasks.length * 100) : 0

  // ── Shift conflict detection ─────────────────────────────────────────────
  // Find whether a DIFFERENT agent already submitted for the currently selected shift today
  const shiftConflict = useMemo(() =>
    todayAllRecords.find(r => r.shift === SHIFTS[shift].label && r.agent_id !== agent.id) ?? null,
    [todayAllRecords, shift, agent.id]
  )
  // Shifts with no log from ANY agent yet (excluding the one we're on)
  const suggestedShifts = useMemo(() => {
    const allTaken = new Set(todayAllRecords.map(r => r.shift))
    return Object.entries(SHIFTS).filter(([key, s]) => !allTaken.has(s.label) && key !== shift)
  }, [todayAllRecords, shift])

  // ── File icon helper ────────────────────────────────────────────────────
  function attachmentIcon(name) {
    const ext = (name?.split('.').pop() || '').toLowerCase()
    const map = { pdf:'📄', doc:'📝', docx:'📝', xls:'📊', xlsx:'📊', ppt:'📑', pptx:'📑',
                  png:'🖼️', jpg:'🖼️', jpeg:'🖼️', gif:'🖼️', webp:'🖼️', txt:'📃', csv:'📃' }
    return map[ext] || '📎'
  }

  // ── Night Audit post builder ─────────────────────────────────────────────
  function buildNightAuditPost(version = null) {
    const NA_ROWS = [
      { key: 'occ',    label: 'Occupancy' },
      { key: 'adr',    label: 'ADR' },
      { key: 'revpar', label: 'RevPAR' },
      { key: 'dep',    label: "Today's Departures" },
      { key: 'arr',    label: "Today's Arrivals" },
      { key: 'pend',   label: 'Pending Arrivals' },
      { key: 'avail',  label: 'Available Rooms' },
      { key: 'walkin', label: 'Walk-In' },
    ]
    const val = (k) => meta[k] || '—'

    const naVersionSuffix = version ? ` (v${version})` : ''
    let post = `## 🌙 Night Audit Shift Log — ${fmtDate(meta.date)}${naVersionSuffix}\n`
    post += `**Front Desk Agent:** ${agent.name}\n`
    post += '\n---\n'

    // Hotel Statistics — 4-column table
    post += '\n### 📊 Hotel Statistics\n'
    post += '| Metric | Start Shift | Ending Day | **New Business Day** |\n'
    post += '|--------|-------------|------------|---------------------|\n'
    const hotelStats = NA_ROWS
      .map(row => ({ label: row.label, s: val(`na_${row.key}_s`), e: val(`na_${row.key}_e`), n: val(`na_${row.key}_n`) }))
      .filter(row => hasDisplayValue(row.s) || hasDisplayValue(row.e) || hasDisplayValue(row.n))
    if (hotelStats.length > 0) {
      hotelStats.forEach(row => { post += `| ${row.label} | ${row.s} | ${row.e} | ${row.n} |\n` })
    } else {
      post += '| (no statistics entered) | — | — | — |\n'
    }
    post += '\n---\n'

    // Activity & Incidents — 2-column count table
    const activityRows = [
      hasPositiveNumber(meta.na_declined)   ? `| Declined Payments | ${meta.na_declined} |`     : '',
      hasPositiveNumber(meta.na_ooo)        ? `| Out of Order Rooms | ${meta.na_ooo} |`          : '',
      hasPositiveNumber(meta.na_walkin_res) ? `| Walk-in Reservations | ${meta.na_walkin_res} |` : '',
      hasPositiveNumber(meta.na_gtd_noshow) ? `| GTD No-Show | ${meta.na_gtd_noshow} |`          : '',
      hasPositiveNumber(meta.na_cancel_ct)  ? `| Cancellations | ${meta.na_cancel_ct} |`         : '',
      hasPositiveNumber(meta.na_rate_adj)   ? `| Rate Adj / Refunds | ${meta.na_rate_adj} |`     : '',
      hasPositiveNumber(meta.na_guest_req)  ? `| Guest Requests | ${meta.na_guest_req} |`        : '',
      hasPositiveNumber(meta.na_maint_ct)   ? `| Maintenance Pass | ${meta.na_maint_ct} |`       : '',
      hasDisplayValue(meta.na_security)     ? `| Security Onsite | ${meta.na_security} |`        : '',
    ].filter(Boolean)

    if (activityRows.length > 0) {
      post += '\n### ⚠️ Activity & Incidents\n'
      post += '| Item | Count |\n'
      post += '|------|-------|\n'
      post += activityRows.join('\n') + '\n'
    }

    // Bullet detail blocks
    const oooLines = splitLines(meta.na_ooo_detail)
    if (oooLines.length) {
      post += '\n**Out of Order Room Details:**\n'
      oooLines.forEach(l => { post += `- ${l}\n` })
    }
    const cancelLines = splitLines(meta.na_cancel_detail)
    if (cancelLines.length) {
      post += '\n**Cancellation Details:**\n'
      cancelLines.forEach(l => { post += `- ${l}\n` })
    }
    const maintLines = splitLines(meta.na_maint_detail)
    if (maintLines.length) {
      post += '\n**Maintenance Details:**\n'
      maintLines.forEach(l => { post += `- ${l}\n` })
    }
    const guestReqLines = splitLines(meta.na_guest_req_detail)
    if (guestReqLines.length) {
      post += '\n**Guest Request Details:**\n'
      guestReqLines.forEach(l => { post += `- ${l}\n` })
    }

    // Inline notes
    if (hasDisplayValue(meta.na_comments))     post += `\n**General Comments:** ${formatInlineValue(meta.na_comments)}\n`
    if (hasDisplayValue(meta.na_guest_issues)) post += `**Guest Issues / Incidents / Concerns:** ${formatInlineValue(meta.na_guest_issues)}\n`
    if (hasDisplayValue(meta.na_high_bal))     post += `**High Balances:** ${formatInlineValue(meta.na_high_bal)}\n`
    if (hasDisplayValue(meta.na_callouts))     post += `**Call Outs:** ${meta.na_callouts}\n`

    post += '\n---\n'

    // Task notes
    const noted = tasks.filter(t => taskState[t.id]?.note)
    if (noted.length) {
      post += '\n### 📌 Task Notes\n'
      noted.forEach(t => {
        const ts = taskState[t.id].timestamp ? ` ⏱ ${taskState[t.id].timestamp}` : ''
        post += `- **${t.name}**${ts}: ${taskState[t.id].note}\n`
      })
      post += '\n---\n'
    }

    // Checklist summary is admin-only in the shift log post
    if (agent?.is_admin) {
      const incomplete = tasks.filter(t => !taskState[t.id]?.done)
      post += '\n### ✅ Checklist\n'
      post += `Completed **${doneCount} / ${tasks.length}** tasks\n`
      if (incomplete.length > 0 && incomplete.length < tasks.length) {
        post += '\n**Incomplete Tasks:**\n'
        incomplete.forEach(t => { post += `- ${t.name}\n` })
      }
      post += '\n---\n'
    }

    // Notes to Manager
    if (hasDisplayValue(meta.manager_notes)) {
      post += '\n### 📝 Notes to Manager\n'
      post += meta.manager_notes.trim() + '\n'
      post += '\n---\n'
    }

    // Handoff
    if (hasDisplayValue(meta.handoff_note)) {
      post += '\n### 🔄 Handoff Note for Morning Shift\n'
      post += meta.handoff_note.trim() + '\n'
      post += '\n---\n'
    }

    // Rate Shop
    const rateShopRows = HOTELS.filter(h =>
      rateShops.start?.[h.id]?.rate || rateShops.mid?.[h.id]?.rate || rateShops.end?.[h.id]?.rate
    )
    if (rateShopRows.length > 0) {
      post += '\n### 💰 Rate Shop\n'
      post += '| Competitor | Start of Shift | Mid Shift | End of Shift |\n'
      post += '|------------|---------------|-----------|-------------|\n'
      rateShopRows.forEach(h => {
        const s = rateShops.start?.[h.id]?.rate
        const m = rateShops.mid?.[h.id]?.rate
        const e = rateShops.end?.[h.id]?.rate
        post += `| ${h.name} | ${s ? `$${Number(s).toFixed(2)}` : '—'} | ${m ? `$${Number(m).toFixed(2)}` : '—'} | ${e ? `$${Number(e).toFixed(2)}` : '—'} |\n`
      })
      post += '\n---\n'
    }

    // Attachments
    if (attachments.length > 0) {
      post += `\n### 📎 Attachments (${attachments.length} file${attachments.length !== 1 ? 's' : ''})\n`
      attachments.forEach(f => { post += `- ${attachmentIcon(f.name)} [${f.name}](${f.url})\n` })
    }

    return post
  }

  // ── Build post text ──────────────────────────────────────────────────────
  function buildPost(version = null) {
    if (shift === 'night') return buildNightAuditPost(version)

    const shiftEmoji    = shift === 'morning' ? '☀️' : '🌅'
    const handoffTarget = shift === 'morning' ? 'Swing Shift' : 'Night Audit'
    const versionSuffix = version ? ` (v${version})` : ''

    let post = `## ${shiftEmoji} ${SHIFTS[shift].label} — ${fmtDate(meta.date)}${versionSuffix}\n`
    post += `**Front Desk Agent:** ${agent.name}\n`
    post += '\n---\n'

    // Hotel Snapshot — 2-column table
    post += '\n### 📊 Hotel Snapshot\n'
    post += '| Metric | Value |\n'
    post += '|--------|-------|\n'
    post += `| Occupancy | ${meta.occ || '—'} |\n`
    post += `| ADR | $${meta.adr || '—'} |\n`
    post += `| Pending Arrivals | ${meta.pending || '0'} |\n`
    post += `| Today's Arrivals | ${meta.arrivals || '0'} |\n`
    post += `| Departures | ${meta.departures || '0'} |\n`
    post += '\n---\n'

    // Activity & Incidents — 2-column count table
    const activityRows = [
      hasPositiveNumber(meta.declined)  ? `| Declined Payments | ${meta.declined} |`           : '',
      hasPositiveNumber(meta.ooo)       ? `| Out of Order Rooms | ${meta.ooo} |`                : '',
      hasPositiveNumber(meta.guest_req) ? `| Guest Requests | ${meta.guest_req} |`              : '',
      hasPositiveNumber(meta.refunds)   ? `| Rate Adjustments / Refunds | ${meta.refunds} |`    : '',
    ].filter(Boolean)

    if (activityRows.length > 0) {
      post += '\n### ⚠️ Activity & Incidents\n'
      post += '| Item | Count |\n'
      post += '|------|-------|\n'
      post += activityRows.join('\n') + '\n'
    }

    // Bullet detail blocks
    const oooLines = splitLines(meta.ooo_detail)
    if (oooLines.length) {
      post += '\n**Out of Order Room Details:**\n'
      oooLines.forEach(l => { post += `- ${l}\n` })
    }
    const guestReqLines = splitLines(meta.guest_req_detail)
    if (guestReqLines.length) {
      post += '\n**Guest Request Details:**\n'
      guestReqLines.forEach(l => { post += `- ${l}\n` })
    }
    const maintLines = splitLines(meta.maint_passdown)
    if (maintLines.length) {
      post += '\n**Maintenance / Passdown:**\n'
      maintLines.forEach(l => { post += `- ${l}\n` })
    }

    post += '\n---\n'

    // Task notes
    const noted = tasks.filter(t => taskState[t.id]?.note)
    if (noted.length) {
      post += '\n### 📌 Task Notes\n'
      noted.forEach(t => {
        const ts = taskState[t.id].timestamp ? ` ⏱ ${taskState[t.id].timestamp}` : ''
        post += `- **${t.name}**${ts}: ${taskState[t.id].note}\n`
      })
      post += '\n---\n'
    }

    // Checklist summary is admin-only in the shift log post
    if (agent?.is_admin) {
      const incomplete = tasks.filter(t => !taskState[t.id]?.done)
      post += '\n### ✅ Checklist\n'
      post += `Completed **${doneCount} / ${tasks.length}** tasks\n`
      if (incomplete.length > 0 && incomplete.length < tasks.length) {
        post += '\n**Incomplete Tasks:**\n'
        incomplete.forEach(t => { post += `- ${t.name}\n` })
      }
      post += '\n---\n'
    }

    // Notes to Manager
    if (hasDisplayValue(meta.manager_notes)) {
      post += '\n### 📝 Notes to Manager\n'
      post += meta.manager_notes.trim() + '\n'
      post += '\n---\n'
    }

    // Handoff
    if (hasDisplayValue(meta.handoff_note)) {
      post += `\n### 🔄 Handoff to ${handoffTarget}\n`
      post += meta.handoff_note.trim() + '\n'
      post += '\n---\n'
    }

    // Rate Shop
    const rateShopRowsR = HOTELS.filter(h =>
      rateShops.start?.[h.id]?.rate || rateShops.mid?.[h.id]?.rate || rateShops.end?.[h.id]?.rate
    )
    if (rateShopRowsR.length > 0) {
      post += '\n### 💰 Rate Shop\n'
      post += '| Competitor | Start of Shift | Mid Shift | End of Shift |\n'
      post += '|------------|---------------|-----------|-------------|\n'
      rateShopRowsR.forEach(h => {
        const s = rateShops.start?.[h.id]?.rate
        const m = rateShops.mid?.[h.id]?.rate
        const e = rateShops.end?.[h.id]?.rate
        post += `| ${h.name} | ${s ? `$${Number(s).toFixed(2)}` : '—'} | ${m ? `$${Number(m).toFixed(2)}` : '—'} | ${e ? `$${Number(e).toFixed(2)}` : '—'} |\n`
      })
      post += '\n---\n'
    }

    // Attachments
    if (attachments.length > 0) {
      post += `\n### 📎 Attachments (${attachments.length} file${attachments.length !== 1 ? 's' : ''})\n`
      attachments.forEach(f => { post += `- ${attachmentIcon(f.name)} [${f.name}](${f.url})\n` })
    }

    return post
  }

  function handlePreview() {
    // Capture edit state explicitly so nothing depends on closure timing
    const version = editRecordId && postVersion > 1 ? postVersion : null
    setPostText(buildPost(version))
    setShowOutput(true)
    setTimeout(() => document.getElementById('output-section')?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  // ── Submit handlers ──────────────────────────────────────────────────────
  async function handleSubmitOnly() {
    if (shiftConflict && !editRecordId) return // blocked — duplicate shift
    setPostStatus('posting')
    try {
      await saveRecord()
      setPostStatus('success')
      setPosted(true)
      localStorage.removeItem(sessionKey)
    } catch(e) {
      setPostStatus('error')
      console.error(e)
    }
  }

  async function handlePost() {
    if (shiftConflict && !editRecordId) return // blocked — duplicate shift
    setPostStatus('posting')
    try {
      let textToPost = filterManagerNotes(postText)

      // If editing a previously-posted log, prepend an EDITED header.
      // The (v2) version is already in postText — stamped by handlePreview.
      if (editRecordId) {
        let changesSection = ''
        if (originalFormState) {
          const changes = computeFormDiff(
            originalFormState.meta, meta,
            originalFormState.taskState, taskState,
            tasks
          )
          if (changes.length > 0) {
            changesSection = `\n**What changed:**\n${changes.map(c => `- ${c}`).join('\n')}`
          }
        }
        const editHeader = `### ✏️ Edited Shift Log\n**Edited by:** ${agent.name}${changesSection}\n\n`
        textToPost = editHeader + textToPost
      }

      await postShiftLogToTeams(textToPost)
      await saveRecord()
      setOriginalFormState(null)
      setPostStatus('success')
      setPosted(true)
      localStorage.removeItem(sessionKey)
    } catch(e) {
      setPostStatus('error')
      await saveRecord()
      localStorage.removeItem(sessionKey)
    }
  }

  async function saveRecord() {
    const isNight = shift === 'night'
    const record = {
      agent_id:          agent.id,
      agent_name:        agent.name,
      shift:             SHIFTS[shift].label,
      date:              meta.date || today(),
      occupancy:         isNight ? (meta.na_occ_n || meta.na_occ_s || '') : meta.occ,
      adr:               isNight ? (meta.na_adr_n  || meta.na_adr_s  || '') : meta.adr,
      declined_payments: isNight ? (meta.na_declined || '') : (meta.declined || ''),
      manager_notes:     meta.manager_notes,
      handoff_note:      meta.handoff_note,
      total_done:        doneCount,
      total_tasks:       tasks.length,
      tasks: tasks.map(t => ({
        id: t.id, name: t.name, time: t.time,
        done: !!taskState[t.id]?.done,
        timestamp: taskState[t.id]?.timestamp || null,
        note: taskState[t.id]?.note || '',
      })),
      post_text:   postText,
      attachments: attachments,
      rate_shops:  rateShops,
    }
    // Edit mode → UPDATE; new submission → INSERT
    if (editRecordId) {
      await updateShiftRecord(editRecordId, record)
      setPostedRecordId(editRecordId)
    } else {
      const newId = await saveShiftRecord(record)
      setPostedRecordId(newId)
    }
    if (meta.handoff_note) {
      const handoffData = { note: meta.handoff_note, agent_name: agent.name, shift: SHIFTS[shift].label, date: fmtDate(meta.date) }
      try { await setHandoff(handoffData); onHandoffUpdate(handoffData) } catch(e) {}
    }
  }

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => showToast('Copied!'))
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <>
    <div>
      {/* Topbar */}
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
            <div className="topbar-title">Shift Checklist</div>
            <div className="topbar-sub">Home2 Suites Las Vegas North</div>
          </div>
        </div>
        <div className="topbar-right">
          <div className="topbar-agent-badge">{agent.name}</div>
          <div className="topbar-progress">
            <div className="mini-bar"><div className="mini-bar-fill" style={{ transform: `scaleX(${pct / 100})` }} /></div>
            <span className="topbar-pct">{pct}%</span>
          </div>
          <button className="signout-btn" style={{ background: 'rgba(255,255,255,0.18)' }} onClick={() => setShowPrior(true)}>Prior Shifts</button>
          <button className="signout-btn" style={{ background: 'rgba(255,255,255,0.18)' }} onClick={onHome}>← Home</button>
          <button className="signout-btn" onClick={onSignOut}>Sign out</button>
        </div>
      </div>

      {/* ── Already-submitted choice screen ── */}
      {choiceRecords && (
        <div className={styles.choiceWrap}>
          <div className={styles.choiceCard}>
            <div className={styles.choiceIcon}>
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                <rect x="2" y="4" width="24" height="20" rx="3" stroke="currentColor" strokeWidth="2"/>
                <path d="M7 4V2M21 4V2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <path d="M2 11h24" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M9 17l3 3 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h3 className={styles.choiceTitle}>Shift log already submitted today</h3>
            <p className={styles.choiceSub}>What would you like to do?</p>

            <div className={styles.choiceOptions}>
              {choiceRecords.map(r => {
                const canEdit = isEditWindowOpen(r.shift)
                return (
                  <button
                    key={r.id}
                    className={styles.choiceBtnPrimary}
                    onClick={() => canEdit && handleEditRecord(r)}
                    disabled={!canEdit}
                    title={!canEdit ? `Editing closed — window ended at ${editWindowCloseLabel(r.shift)}` : ''}
                    style={!canEdit ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                  >
                    <span className={styles.choiceBtnIcon}>{canEdit ? '✏️' : '🔒'}</span>
                    <span className={styles.choiceBtnText}>
                      Edit your {r.shift} log
                      <span className={styles.choiceBtnSub}>
                        {canEdit
                          ? `Submitted at ${fmtTime(r.submitted_at)}`
                          : `Editing closed — window ended at ${editWindowCloseLabel(r.shift)}`}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>

            <div className={styles.choiceDivider}><span>or</span></div>

            <button className={styles.choiceBtnSecondary} onClick={() => setChoiceRecords(null)}>
              <span className={styles.choiceBtnIcon}>➕</span>
              <span className={styles.choiceBtnText}>
                Start a new shift log
                <span className={styles.choiceBtnSub}>If you're covering for another agent</span>
              </span>
            </button>
          </div>
        </div>
      )}

      {/* ── Normal checklist (hidden while choice screen is showing) ── */}
      {!choiceRecords && (
        <div className={styles.dashWrap}>

          {/* ── Full-width alerts / context strip ── */}
          <div className={styles.topStrip}>
            <PreviousShiftLogs records={prevLogs} loading={prevLogsLoading} isAdmin={!!agent.is_admin} />

            {/* Rate shop window reminder — stays until all hotels have data */}
            {rateShopReminder && !HOTELS.every(h => rateShops[rateShopReminder]?.[h.id]?.rate || rateShops[rateShopReminder]?.[h.id]?.soldOut) && (
              <div className={styles.rateShopReminderBanner}>
                <span className={styles.rateShopReminderIcon}>🔔</span>
                <span className={styles.rateShopReminderText}>
                  <strong>Rate Shop Reminder</strong> — {PERIOD_LABELS[rateShopReminder]} window is now open. Enter rates for all locations below.
                </span>
              </div>
            )}

            {editRecordId && (
              <div className={styles.editBanner}>
                <span>
                  <strong>✏️ Edit mode</strong> — updating your {SHIFTS[shift].label} log from {fmtDate(meta.date)}
                </span>
                <button className={styles.editBannerCancel} onClick={cancelEdit}>✕ Cancel edit</button>
              </div>
            )}

            {handoff?.note && (
              <div className={styles.handoff}>
                <strong>📋 Handoff from {handoff.agent_name}</strong> ({handoff.shift}, {handoff.date}):
                <span> {handoff.note}</span>
              </div>
            )}

            {shiftConflict && !editRecordId && !posted && (
              <div className={styles.conflictBanner}>
                <div className={styles.conflictHeader}>
                  <span className={styles.conflictIcon}>
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                      <path d="M10 2L2 17h16L10 2z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
                      <path d="M10 8v4M10 14.5v.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                    </svg>
                  </span>
                  <div>
                    <div className={styles.conflictTitle}>
                      {SHIFTS[shift].label} has already been submitted today
                    </div>
                    <div className={styles.conflictSub}>
                      Logged by <strong>{shiftConflict.agent_name}</strong> at {fmtTime(shiftConflict.submitted_at)}.
                      {' '}Are you on the correct shift?
                    </div>
                  </div>
                </div>

                {suggestedShifts.length > 0 ? (
                  <div className={styles.conflictSuggest}>
                    <span className={styles.conflictSuggestLabel}>Switch to an open shift:</span>
                    <div className={styles.conflictSuggestBtns}>
                      {suggestedShifts.map(([key, s]) => (
                        <button
                          key={key}
                          className={styles.conflictSwitchBtn}
                          onClick={() => handleShiftChange(key)}
                        >
                          {{ morning: '☀️', swing: '🌅', night: '🌙' }[key]} {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className={styles.conflictAllTaken}>
                    All shifts for today have been logged. Double-check your shift with your manager before proceeding.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Two-column dashboard ── */}
          <div className={styles.dashGrid}>

            {/* LEFT — shift selector, form, rate shop */}
            <div className={styles.dashLeft}>

              {/* Shift selector */}
              <div className="card">
                <div className={styles.shiftLabel}>Select shift</div>
                <div className={styles.shiftTabs}>
                  {Object.entries(SHIFTS).map(([key, s]) => (
                    <button
                      key={key}
                      className={`${styles.shiftTab} ${shift === key ? styles.active : ''} ${editRecordId ? styles.shiftTabDisabled : ''}`}
                      onClick={() => !editRecordId && handleShiftChange(key)}
                      disabled={!!editRecordId}
                      title={editRecordId ? 'Cancel edit mode to change the shift' : ''}
                    >
                      {{ morning: '☀️', swing: '🌅', night: '🌙' }[key]} {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Shift details form */}
              <div className="card">
                <div className={styles.shiftLabel} style={{ marginBottom: 10 }}>Shift details</div>
                <div className={styles.agentBadge}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="4" r="2.5" stroke="currentColor" strokeWidth="1.4"/><path d="M1.5 10.5c0-2.485 2.015-4.5 4.5-4.5s4.5 2.015 4.5 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                  {agent.name}
                </div>

                {shift === 'night' ? (
                  <NightAuditForm meta={meta} onMetaChange={handleMetaChange} />
                ) : (
                  <RegularShiftForm
                    meta={meta}
                    onMetaChange={handleMetaChange}
                    shiftLabel={SHIFTS[shift].label}
                  />
                )}

                <FileAttachments
                  attachments={attachments}
                  onChange={setAttachments}
                  agentId={agent.id}
                  date={meta.date || today()}
                />
              </div>

              {/* Rate Shop */}
              <div className="card">
                <div className={styles.shiftLabel} style={{ marginBottom: 10 }}>Rate Shop</div>
                <RateShopSection
                  shiftKey={shift}
                  rateShops={rateShops}
                  onChange={handleRateShopsChange}
                  onVarianceAlert={handleVarianceAlert}
                />
              </div>

            </div>{/* /dashLeft */}

            {/* RIGHT — task list + actions (sticky panel) */}
            <div className={styles.dashRight}>
              <div className={styles.dashRightInner}>

                {/* Task list card */}
                <div className={`card ${styles.taskCard}`}>
                  <div className={styles.tasksHeader}>
                    <span className={styles.tasksTitle}>{SHIFTS[shift].label} Tasks</span>
                    <span className={styles.tasksCount}>{doneCount} / {tasks.length} complete</span>
                  </div>
                  <div className={styles.progressWrap}>
                    <div className={styles.progressBg}>
                      <div className={styles.progressFill} style={{ transform: `scaleX(${pct / 100})` }} />
                    </div>
                  </div>
                  <div className={styles.taskScrollable}>
                    <div className={styles.taskList}>
                      {tasks.map(t => (
                        <TaskItem key={t.id} task={t} state={taskState[t.id]} onChange={handleTaskChange} />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Status banner */}
                {postStatus && (
                  <div className={`status-banner ${postStatus}`} style={{ marginBottom: 8 }}>
                    {postStatus === 'posting' && <div className="spinner" />}
                    {postStatus === 'posting' && (editRecordId ? 'Updating shift log…' : 'Posting to Shift Logs channel…')}
                    {postStatus === 'success' && (editRecordId ? '✓ Edited card posted to Shift Logs!' : '✓ Posted to Shift Logs successfully!')}
                    {postStatus === 'error'   && '⚠ Could not post automatically — copy the text below and paste into Shift Logs manually.'}
                  </div>
                )}

                {/* Actions */}
                <div className={styles.actions}>
                  <button className={`btn btn-secondary ${styles.actionBtn}`} onClick={() => {
                    if (!confirm('Clear all completions and notes?')) return
                    setTaskState({}); setShowOutput(false); setPosted(false); setPostStatus(null)
                    localStorage.removeItem(sessionKey)
                  }}>Clear</button>
                  <button
                    className={`btn btn-primary ${styles.actionBtn}`}
                    onClick={handlePreview}
                    disabled={!!(shiftConflict && !editRecordId)}
                    title={shiftConflict && !editRecordId ? 'Change to an open shift before previewing' : ''}
                  >
                    {editRecordId ? '✦ Preview Update' : '✦ Preview Post'}
                  </button>
                  {showOutput && !posted && (
                    <button
                      className={`btn btn-submit ${styles.actionBtn}`}
                      onClick={handleSubmitOnly}
                      disabled={postStatus === 'posting' || !!(shiftConflict && !editRecordId)}
                    >
                      {editRecordId ? '✓ Save Changes' : '✓ Submit Checklist'}
                    </button>
                  )}
                  {showOutput && !posted && (
                    <button
                      className={`btn btn-success ${styles.actionBtn}`}
                      onClick={handlePost}
                      disabled={postStatus === 'posting' || !!(shiftConflict && !editRecordId)}
                    >
                      {editRecordId ? '▶ Save & Post Update' : '▶ Post to Shift Logs'}
                    </button>
                  )}
                  {posted && postedRecordId && postStatus === 'success' && (
                    isEditWindowOpen(SHIFTS[shift].label) ? (
                      <button
                        className={`btn btn-primary ${styles.actionBtn}`}
                        onClick={handleEditPostedLog}
                      >
                        ✏️ Edit this log
                      </button>
                    ) : (
                      <div className={styles.editClosedNote}>
                        Editing closed — window ended at {editWindowCloseLabel(SHIFTS[shift].label)}
                      </div>
                    )
                  )}
                </div>

              </div>
            </div>{/* /dashRight */}

          </div>{/* /dashGrid */}

          {/* ── Full-width post preview (below the grid) ── */}
          {showOutput && (
            <div id="output-section" className={styles.outputSection}>
              {agent.is_admin && (
                <div className={styles.statRow}>
                  <div className={styles.statBox}><div className={styles.statNum}>{doneCount}</div><div className={styles.statLbl}>Completed</div></div>
                  <div className={styles.statBox}><div className={styles.statNum}>{tasks.length - doneCount}</div><div className={styles.statLbl}>Not done</div></div>
                  <div className={styles.statBox}><div className={styles.statNum}>{tasks.filter(t => taskState[t.id]?.note).length}</div><div className={styles.statLbl}>With notes</div></div>
                </div>
              )}

              <div className="card">
                <div className={styles.cardHeader}>
                  <span className={styles.cardTitle}>📋 Teams post preview</span>
                  <button className="btn-sm" onClick={() => copyToClipboard(agent.is_admin ? postText : filterManagerNotes(postText))}>Copy</button>
                </div>
                <PostPreview text={agent.is_admin ? postText : filterManagerNotes(postText)} />
              </div>

              <div className="card">
                <div className={styles.cardHeader}>
                  <span className={styles.cardTitle}>📄 Full checklist detail</span>
                  <button className="btn-sm" onClick={() => {
                    const text = tasks.map(t => {
                      const s = taskState[t.id] || {}
                      const ts = s.timestamp ? ` — completed ${s.timestamp}` : ''
                      return `[${s.done ? 'X' : ' '}] ${t.name} (${t.time})${ts}${s.note ? `\n      ↳ ${s.note}` : ''}`
                    }).join('\n')
                    copyToClipboard(`${SHIFTS[shift].label} — ${agent.name}\n${'─'.repeat(40)}\n${text}`)
                  }}>Copy as text</button>
                </div>
                {tasks.map(t => {
                  const s = taskState[t.id] || {}
                  return (
                    <div key={t.id} className={styles.summaryRow}>
                      <span className={`badge ${s.done ? 'badge-done' : 'badge-skip'}`}>{s.done ? 'Done' : 'Skip'}</span>
                      <div>
                        <div className={styles.summaryName}>
                          {t.name} <span className={styles.summaryTime}>({t.time})</span>
                          {s.timestamp && <span className={styles.summaryTs}> ⏱ {s.timestamp}</span>}
                        </div>
                        {s.note && <div className={styles.summaryNote}>↳ {s.note}</div>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
    {showPrior && <PriorShifts agent={agent} onClose={() => setShowPrior(false)} />}
    </>
  )
}
