import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { SHIFTS } from "../data/shifts";
import {
  saveShiftRecord,
  updateShiftRecord,
  getAgentTodayRecords,
  getTodayAllRecords,
  setHandoff,
  getPreviousShiftLogs,
  upsertLiveRateShop,
  saveVarianceAlert,
} from "../lib/supabase";
import {
  filterManagerNotes,
  parseMetaFromPostText,
  isNightAuditPost,
  parseNightAuditFromPostText,
} from "../lib/utils";
import {
  HOTELS,
  PERIOD_LABELS,
  getWindowStatus,
  getActivePeriod,
} from "../data/rateShop";
import { postShiftLogToTeams } from "../lib/teamsClient";
import NightAuditForm from "./NightAuditForm";
import RegularShiftForm from "./RegularShiftForm";
import RateShopSection from "./RateShopSection";
import FileAttachments from "./FileAttachments";
import PostPreview from "./PostPreview";
import TaskItem from "./TaskItem";
import PriorShifts from "./PriorShifts";
import PreviousShiftLogs from "./PreviousShiftLogs";
import HotelSnapshot from "./HotelSnapshot";
import FeedbackModal from "./FeedbackModal";
import ThemePicker from "./ThemePicker";
import styles from "./StaffDashboard.module.css";

// ── Constants ────────────────────────────────────────────────────────────────
const SESSION_PREFIX = "home2_session_";
const SHIFT_EMOJI = { morning: "☀️", swing: "🌅", night: "🌙" };
const SHIFT_KEYS = ["morning", "swing", "night"];
const EMPTY_RATE_SHOPS = () => ({ start: {}, mid: {}, end: {} });

// ── Helpers ───────────────────────────────────────────────────────────────────
function today() {
  return new Date().toISOString().split("T")[0];
}
function getShiftByTime() {
  const h = new Date().getHours();
  if (h >= 6 && h < 14) return "morning";
  if (h >= 14 && h < 22) return "swing";
  return "night";
}
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}
function fmtDate(d) {
  if (!d)
    return new Date().toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  const [y, m, day] = d.split("-");
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return `${months[parseInt(m) - 1]} ${parseInt(day)}, ${y}`;
}
function fmtDateLong(d) {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const dow = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const dt = new Date(Number(y), parseInt(m) - 1, parseInt(day));
  return `${dow[dt.getDay()]}, ${months[parseInt(m) - 1]} ${parseInt(day)}, ${y}`;
}
function fmtDateShort(d) {
  if (!d) return "";
  const [, m, day] = d.split("-");
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${months[parseInt(m) - 1]} ${parseInt(day)}`;
}
function fmtTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  let h = d.getHours(),
    m = d.getMinutes();
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, "0")} ${ap}`;
}
function splitLines(value) {
  return String(value || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}
function formatInlineValue(value, fallback = "—") {
  const lines = splitLines(value);
  return lines.length ? lines.join(" | ") : fallback;
}
function hasDisplayValue(value) {
  const n = String(value ?? "").trim();
  return n !== "" && n !== "—" && n !== "None";
}
function hasPositiveNumber(value) {
  return (parseInt(value, 10) || 0) > 0;
}
function attachmentIcon(name) {
  const ext = (name?.split(".").pop() || "").toLowerCase();
  const map = {
    pdf: "📄",
    doc: "📝",
    docx: "📝",
    xls: "📊",
    xlsx: "📊",
    ppt: "📑",
    pptx: "📑",
    png: "🖼️",
    jpg: "🖼️",
    jpeg: "🖼️",
    gif: "🖼️",
    webp: "🖼️",
    txt: "📃",
    csv: "📃",
  };
  return map[ext] || "📎";
}

// ── Edit window ───────────────────────────────────────────────────────────────
const SHIFT_EDIT_CLOSE = {
  'Morning Shift': 14 * 60 + 10,
  'Swing Shift':   22 * 60 + 10,
  'Night Audit':    6 * 60 + 10,
}
function isEditWindowOpen(shiftLabel) {
  const now = new Date()
  const mins = now.getHours() * 60 + now.getMinutes()
  const close = SHIFT_EDIT_CLOSE[shiftLabel]
  if (close === undefined) return false
  return mins <= close
}
function editWindowCloseLabel(shiftLabel) {
  if (shiftLabel === 'Morning Shift') return '2:10 PM'
  if (shiftLabel === 'Swing Shift')   return '10:10 PM'
  if (shiftLabel === 'Night Audit')   return '6:10 AM'
  return ''
}

function computeFormDiff(origMeta, newMeta, origTaskState, newTaskState, tasks) {
  const changes = []
  const metaLabels = {
    occ: 'Occupancy', adr: 'ADR', declined: 'Declined Payments',
    ooo: 'OOO Rooms', guest_req: 'Guest Requests', refunds: 'Rate Adj/Refunds', refunds_detail: 'Rate Adj/Refund Details',
    pending: 'Pending Arrivals', arrivals: "Today's Arrivals", departures: 'Departures',
    handoff_note: 'Handoff Note', manager_notes: 'Notes to Manager',
    ooo_detail: 'OOO Details', guest_req_detail: 'Guest Request Details',
    maint_passdown: 'Maintenance/Passdown',
    na_occ_s: 'Occ (Start)', na_occ_e: 'Occ (End)', na_occ_n: 'Occ (New Day)',
    na_adr_s: 'ADR (Start)', na_adr_e: 'ADR (End)', na_adr_n: 'ADR (New Day)',
    na_dep_s: 'Departures (Start)', na_arr_s: 'Arrivals (Start)',
    na_security_name: 'Security Guard Name',
    na_comments: 'General Comments', na_guest_issues: 'Guest Issues',
    na_high_bal: 'High Balances', na_callouts: 'Call Outs',
    na_declined: 'Declined Payments', na_cancel_detail: 'Cancellation Details',
    na_maint_detail: 'Maintenance Details', na_guest_req_detail: 'Guest Request Details',
    na_ooo_detail: 'OOO Details', na_rate_adj_detail: 'Rate Adj/Refund Details',
  }
  Object.keys(metaLabels).forEach(key => {
    const orig = String(origMeta[key] ?? '').trim()
    const next = String(newMeta[key] ?? '').trim()
    if (orig === next) return
    const label = metaLabels[key]
    if (!orig)      changes.push(`${label}: (added) ${next}`)
    else if (!next) changes.push(`${label}: (removed)`)
    else            changes.push(`${label}: ${orig} → ${next}`)
  })
  tasks.forEach(t => {
    const o = origTaskState[t.id] || {}
    const n = newTaskState[t.id] || {}
    if (o.done !== n.done)
      changes.push(`Task "${t.name}": ${o.done ? 'Done → Skipped' : 'Skipped → Done'}`)
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

// ── Component ─────────────────────────────────────────────────────────────────
export default function StaffDashboard({
  agent,
  handoff,
  shiftTasks,
  onViewLogs,
  onSignOut,
  showToast,
  onHandoffUpdate,
  onBackToDashboard,
}) {
  const sessionKey = SESSION_PREFIX + agent.id;

  // ── Dashboard / home-screen state ────────────────────────────────────────
  const [todayCoverage, setTodayCoverage] = useState([]);
  const [homeDataLoaded, setHomeDataLoaded] = useState(false);
  const [windowStatus, setWindowStatus] = useState(() =>
    getWindowStatus(getShiftByTime()),
  );
  const [showPrior, setShowPrior] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);

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

  // ── Form open/close state ────────────────────────────────────────────────
  const [formOpen, setFormOpen] = useState(false);

  // ── Shift form state (mirrors Checklist) ─────────────────────────────────
  const [shift, setShift] = useState(getShiftByTime);
  const [taskState, setTaskState] = useState({});
  const [meta, setMeta] = useState({ date: today() });
  const [rateShops, setRateShops] = useState(EMPTY_RATE_SHOPS);
  const [attachments, setAttachments] = useState([]);
  const [postText, setPostText] = useState("");
  const [showOutput, setShowOutput] = useState(false);
  const [postStatus, setPostStatus] = useState(null);
  const [posted, setPosted] = useState(false);
  const [choiceRecords, setChoiceRecords] = useState(null);
  const [editRecordId, setEditRecordId] = useState(null);
  const [postedRecordId, setPostedRecordId] = useState(null);
  const [originalFormState, setOriginalFormState] = useState(null);
  const [postVersion, setPostVersion] = useState(1);
  const [todayAllRecords, setTodayAllRecords] = useState([]);
  const [prevLogs, setPrevLogs] = useState([]);
  const [prevLogsLoading, setPrevLogsLoading] = useState(true);
  const sentVarianceRef = useRef(new Set());
  const rateShopSaveTimer = useRef(null);
  const [rateShopReminder, setRateShopReminder] = useState(null);
  const prevRatePeriodRef = useRef(null);

  // ── Refresh window status every minute ──────────────────────────────────
  useEffect(() => {
    const id = setInterval(
      () => setWindowStatus(getWindowStatus(shift)),
      60_000,
    );
    return () => clearInterval(id);
  }, [shift]);

  // ── Rate shop window reminder ────────────────────────────────────────────
  useEffect(() => {
    function checkWindow() {
      const active = getActivePeriod(shift);
      const prev = prevRatePeriodRef.current;
      prevRatePeriodRef.current = active;

      if (active && active !== prev) {
        const key = `rateShop_notified_${shift}_${today()}_${active}`;
        if (!localStorage.getItem(key)) {
          localStorage.setItem(key, "1");
          try {
            const ctx = new (
              window.AudioContext || window.webkitAudioContext
            )();
            [523.25, 659.25, 783.99].forEach((freq, i) => {
              const osc = ctx.createOscillator(),
                gain = ctx.createGain();
              osc.connect(gain);
              gain.connect(ctx.destination);
              osc.type = "sine";
              osc.frequency.value = freq;
              const t = ctx.currentTime + i * 0.2;
              gain.gain.setValueAtTime(0, t);
              gain.gain.linearRampToValueAtTime(0.28, t + 0.02);
              gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
              osc.start(t);
              osc.stop(t + 0.55);
            });
          } catch (_) {}
        }
      }
      setRateShopReminder(active);
    }

    checkWindow();
    const id = setInterval(checkWindow, 60_000);
    return () => clearInterval(id);
  }, [shift]);

  // ── Load home-screen data + session restore ───────────────────────────────
  useEffect(() => {
    // Try to restore an in-progress session from today
    try {
      const raw = localStorage.getItem(sessionKey);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved.meta?.date === today()) {
          if (saved.shift) {
            setShift(saved.shift);
            setWindowStatus(getWindowStatus(saved.shift));
          }
          if (saved.taskState) setTaskState(saved.taskState);
          if (saved.meta) setMeta(saved.meta);
          if (saved.rateShops) setRateShops(saved.rateShops);
          showToast("✓ Progress restored");
        } else {
          localStorage.removeItem(sessionKey);
        }
      }
    } catch (e) {}

    // Load home-screen data + today's DB records in parallel
    Promise.all([
      getTodayAllRecords(today()),
      getAgentTodayRecords(agent.id, today()),
    ])
      .then(([allRecs, agentRecs]) => {
        if (allRecs) {
          setTodayCoverage(allRecs);
          setTodayAllRecords(allRecs);
        }
        if (agentRecs && agentRecs.length > 0) setChoiceRecords(agentRecs);
        setHomeDataLoaded(true);
      })
      .catch(() => setHomeDataLoaded(true));
  }, []);

  // ── Load previous shift logs when active shift changes ───────────────────
  useEffect(() => {
    setPrevLogsLoading(true);
    setPrevLogs([]);
    const todayStr = today();
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const yesterdayStr = d.toISOString().split("T")[0];
    let labels, dates;
    if (shift === "morning") {
      labels = ["Night Audit"];
      dates = [yesterdayStr, todayStr];
    } else if (shift === "swing") {
      labels = ["Morning Shift"];
      dates = [todayStr];
    } else {
      labels = ["Swing Shift", "Morning Shift"];
      dates = [todayStr];
    }
    getPreviousShiftLogs(labels, dates)
      .then((data) => {
        setPrevLogs(data);
        setPrevLogsLoading(false);
      })
      .catch(() => setPrevLogsLoading(false));
  }, [shift]);

  // ── Auto-save ────────────────────────────────────────────────────────────
  const saveSession = useCallback(
    (s, ts, m, rs) => {
      if (editRecordId) return;
      try {
        localStorage.setItem(
          sessionKey,
          JSON.stringify({ shift: s, taskState: ts, meta: m, rateShops: rs }),
        );
      } catch (e) {}
    },
    [sessionKey, editRecordId],
  );

  // ── Edit existing record ─────────────────────────────────────────────────
  function handleEditRecord(r) {
    const shiftKey =
      Object.keys(SHIFTS).find((k) => SHIFTS[k].label === r.shift) ||
      getShiftByTime();
    setShift(shiftKey);
    setEditRecordId(r.id);
    setShowOutput(false);
    setPosted(false);
    setPostStatus(null);
    setRateShops(r.rate_shops || EMPTY_RATE_SHOPS());
    setFormOpen(true);

    const ts = {};
    if (Array.isArray(r.tasks))
      r.tasks.forEach((t) => {
        ts[t.id] = {
          done: !!t.done,
          timestamp: t.timestamp || null,
          note: t.note || "",
        };
      });
    setTaskState(ts);

    if (isNightAuditPost(r.post_text || "")) {
      const naParsed = parseNightAuditFromPostText(r.post_text || "");
      setMeta({
        date: r.date || today(),
        manager_notes: r.manager_notes || naParsed.manager_notes || "",
        handoff_note: r.handoff_note || naParsed.handoff_note || "",
        na_declined: r.declined_payments || naParsed.na_declined || "",
        ...naParsed,
      });
    } else {
      const parsed = parseMetaFromPostText(r.post_text || "");
      setMeta({
        date: r.date || today(),
        occ: r.occupancy || parsed.occ || "",
        adr: r.adr || parsed.adr || "",
        declined: r.declined_payments || parsed.declined || "",
        manager_notes: r.manager_notes || "",
        handoff_note: r.handoff_note || "",
        pending: parsed.pending || "",
        arrivals: parsed.arrivals || "",
        departures: parsed.departures || "",
        ooo: parsed.ooo || "",
        ooo_detail: parsed.ooo_detail || "",
        guest_req: parsed.guest_req || "",
        guest_req_detail: parsed.guest_req_detail || "",
        refunds: parsed.refunds || "",
        refunds_detail: parsed.refunds_detail || "",
        maint_passdown: parsed.maint_passdown || "",
      });
    }
    setAttachments(Array.isArray(r.attachments) ? r.attachments : []);
    setPostVersion((r.edit_history?.length || 0) + 2);
    showToast("✏️ Loaded for editing");
  }

  function cancelEdit() {
    setEditRecordId(null);
    setOriginalFormState(null);
    setPostVersion(1);
    setTaskState({});
    setMeta({ date: today() });
    setShift(getShiftByTime());
    setAttachments([]);
    setRateShops(EMPTY_RATE_SHOPS());
    setShowOutput(false);
    setPosted(false);
    setPostStatus(null);
    setFormOpen(false);
  }

  function handleEditPostedLog() {
    setOriginalFormState({
      meta: { ...meta },
      taskState: JSON.parse(JSON.stringify(taskState)),
    });
    setEditRecordId(postedRecordId);
    setPostVersion(v => v + 1);
    setPosted(false);
    setPostStatus(null);
    setShowOutput(false);
    showToast('✏️ Edit mode — a new card with your changes will be posted');
  }

  // ── Field / shift change handlers ────────────────────────────────────────
  function handleShiftChange(s) {
    setShift(s);
    setTaskState({});
    setShowOutput(false);
    setPosted(false);
    setWindowStatus(getWindowStatus(s));
    if (editRecordId) setEditRecordId(null);
    saveSession(s, {}, meta, rateShops);
  }
  function handleTaskChange(id, newState) {
    const next = { ...taskState, [id]: newState };
    setTaskState(next);
    saveSession(shift, next, meta, rateShops);
  }
  function handleMetaChange(key, val) {
    const next = { ...meta, [key]: val };
    setMeta(next);
    saveSession(shift, taskState, next, rateShops);
  }
  function handleRateShopsChange(next) {
    setRateShops(next);
    saveSession(shift, taskState, meta, next);
    // Debounced live save — persists to DB 800ms after the last keystroke
    clearTimeout(rateShopSaveTimer.current);
    rateShopSaveTimer.current = setTimeout(() => {
      upsertLiveRateShop({
        agentId: agent.id,
        agentName: agent.name,
        shift: SHIFTS[shift].label,
        date: meta.date || today(),
        rateShops: next,
      }).catch(() => {}); // silent — doesn't block the UI
    }, 800);
  }

  // ── Variance alert ────────────────────────────────────────────────────────
  async function handleVarianceAlert(alerts) {
    const newAlerts = alerts.filter(a => {
      const key = `${a.hotel}|${a.period}`
      if (sentVarianceRef.current.has(key)) return false
      sentVarianceRef.current.add(key)
      return true
    })
    if (!newAlerts.length) return

    showToast("⚠️ Rate variance detected — manager notified")

    const lines = newAlerts.map(a => {
      const diff = a.newRate - a.startRate
      const sign = diff > 0 ? "+" : ""
      return `| ${a.hotel} | ${PERIOD_LABELS[a.period]} | $${Number(a.startRate).toFixed(2)} | $${Number(a.newRate).toFixed(2)} | **${sign}$${Math.abs(diff).toFixed(2)}** |`
    })

    const today = new Date().toISOString().split('T')[0]
    newAlerts.forEach(a => {
      saveVarianceAlert({
        agentId: agent.id,
        agentName: agent.name,
        shift: SHIFTS[shift].label,
        date: today,
        hotel: a.hotel,
        period: a.period,
        startRate: a.startRate,
        newRate: a.newRate,
      }).catch(() => {})
    })

    const msg = [
      `## 🚨 Rate Shop Variance Alert`,
      `**Shift:** ${SHIFTS[shift].label} · **Agent:** ${agent.name}`,
      ``,
      `| Competitor | Period | Start Rate | Current Rate | Change |`,
      `|---|---|---|---|---|`,
      ...lines,
    ].join("\n")

    postShiftLogToTeams(msg, 'manager').catch(() => {})
  }

  // ── Derived values ────────────────────────────────────────────────────────
  const tasks = shiftTasks?.[shift] ?? SHIFTS[shift].tasks;
  const doneCount = tasks.filter((t) => taskState[t.id]?.done).length;
  const pct = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0;

  const shiftConflict = useMemo(
    () =>
      todayAllRecords.find(
        (r) => r.shift === SHIFTS[shift].label && r.agent_id !== agent.id,
      ) ?? null,
    [todayAllRecords, shift, agent.id],
  );
  const suggestedShifts = useMemo(() => {
    const allTaken = new Set(todayAllRecords.map((r) => r.shift));
    return Object.entries(SHIFTS).filter(
      ([key, s]) => !allTaken.has(s.label) && key !== shift,
    );
  }, [todayAllRecords, shift]);

  // ── Form header summary (shown when card is collapsed) ───────────────────
  const formSummary = useMemo(() => {
    if (shift === "night") {
      const parts = [
        meta.na_occ_s && `Occ: ${meta.na_occ_s}`,
        meta.na_adr_s && `ADR: $${meta.na_adr_s}`,
      ].filter(Boolean);
      return parts.join(" · ") || null;
    }
    const parts = [
      meta.occ && `Occ: ${meta.occ}`,
      meta.adr && `ADR: $${meta.adr}`,
      meta.arrivals && `${meta.arrivals} arrivals`,
    ].filter(Boolean);
    return parts.join(" · ") || null;
  }, [shift, meta]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  function fmtRateEntry(entry) {
    if (!entry) return "—";
    const base = entry.soldOut
      ? "Sold Out"
      : entry.rate
        ? `$${Number(entry.rate).toFixed(2)}`
        : "—";
    return entry.note ? `${base} *(${entry.note})*` : base;
  }

  // ── Post builders ─────────────────────────────────────────────────────────
  function buildNightAuditPost(version = null) {
    const NA_ROWS = [
      { key: "occ", label: "Occupancy", suffix: "%" },
      { key: "adr", label: "ADR" },
      { key: "revpar", label: "RevPAR" },
      { key: "dep", label: "Today's Departures" },
      { key: "arr", label: "Today's Arrivals" },
      { key: "pend", label: "Pending Arrivals" },
      { key: "avail", label: "Available Rooms" },
      { key: "walkin", label: "Walk-In" },
    ];
    const val = (k) => meta[k] || "—";
    const naVersionSuffix = version ? ` (v${version})` : '';
    let post = `## 🌙 Night Audit Shift Log — ${fmtDate(meta.date)}${naVersionSuffix}\n**Front Desk Agent:** ${agent.name}\n\n---\n`;
    post +=
      "\n### 📊 Hotel Statistics\n| Metric | Start Shift | Ending Day | **New Business Day** |\n|--------|-------------|------------|---------------------|\n";
    const fmtVal = (v, suffix) => v && v !== '—' ? `${v}${suffix || ''}` : v
    const hotelStats = NA_ROWS.map((row) => ({
      label: row.label,
      s: fmtVal(val(`na_${row.key}_s`), row.suffix),
      e: fmtVal(val(`na_${row.key}_e`), row.suffix),
      n: fmtVal(val(`na_${row.key}_n`), row.suffix),
    })).filter(
      (row) =>
        hasDisplayValue(row.s) ||
        hasDisplayValue(row.e) ||
        hasDisplayValue(row.n),
    );
    if (hotelStats.length > 0)
      hotelStats.forEach((row) => {
        post += `| ${row.label} | ${row.s} | ${row.e} | ${row.n} |\n`;
      });
    else post += "| (no statistics entered) | — | — | — |\n";
    post += "\n---\n";
    const activityRows = [
      hasPositiveNumber(meta.na_declined)
        ? `| Declined Payments | ${meta.na_declined} |`
        : "",
      hasPositiveNumber(meta.na_ooo)
        ? `| Out of Order Rooms | ${meta.na_ooo} |`
        : "",
      hasPositiveNumber(meta.na_walkin_res)
        ? `| Walk-in Reservations | ${meta.na_walkin_res} |`
        : "",
      hasPositiveNumber(meta.na_gtd_noshow)
        ? `| GTD No-Show | ${meta.na_gtd_noshow} |`
        : "",
      hasPositiveNumber(meta.na_cancel_ct)
        ? `| Cancellations | ${meta.na_cancel_ct} |`
        : "",
      hasPositiveNumber(meta.na_rate_adj)
        ? `| Rate Adj / Refunds | ${meta.na_rate_adj} |`
        : "",
      hasPositiveNumber(meta.na_guest_req)
        ? `| Guest Requests | ${meta.na_guest_req} |`
        : "",
      hasPositiveNumber(meta.na_maint_ct)
        ? `| Maintenance Pass | ${meta.na_maint_ct} |`
        : "",
      hasDisplayValue(meta.na_security)
        ? `| Security Onsite | ${meta.na_security}${meta.na_security === 'Yes' && meta.na_security_name ? ` — ${meta.na_security_name}` : ''} |`
        : "",
    ].filter(Boolean);
    if (activityRows.length > 0) {
      post +=
        "\n### ⚠️ Activity & Incidents\n| Item | Count |\n|------|-------|\n";
      post += activityRows.join("\n") + "\n";
    }
    const oooLines = splitLines(meta.na_ooo_detail);
    if (oooLines.length) {
      post += "\n**Out of Order Room Details:**\n";
      oooLines.forEach((l) => {
        post += `- ${l}\n`;
      });
    }
    const cancelLines = splitLines(meta.na_cancel_detail);
    if (cancelLines.length) {
      post += "\n**Cancellation Details:**\n";
      cancelLines.forEach((l) => {
        post += `- ${l}\n`;
      });
    }
    const maintLines = splitLines(meta.na_maint_detail);
    if (maintLines.length) {
      post += "\n**Maintenance Details:**\n";
      maintLines.forEach((l) => {
        post += `- ${l}\n`;
      });
    }
    const guestReqLines = splitLines(meta.na_guest_req_detail);
    if (guestReqLines.length) {
      post += "\n**Guest Request Details:**\n";
      guestReqLines.forEach((l) => {
        post += `- ${l}\n`;
      });
    }
    const rateAdjLines = splitLines(meta.na_rate_adj_detail);
    if (rateAdjLines.length) {
      post += "\n**Rate Adj / Refund Details:**\n";
      rateAdjLines.forEach((l) => {
        post += `- ${l}\n`;
      });
    }
    if (hasDisplayValue(meta.na_comments))
      post += `\n**General Comments:** ${formatInlineValue(meta.na_comments)}\n`;
    if (hasDisplayValue(meta.na_guest_issues))
      post += `**Guest Issues / Incidents / Concerns:** ${formatInlineValue(meta.na_guest_issues)}\n`;
    if (hasDisplayValue(meta.na_high_bal))
      post += `**High Balances:** ${formatInlineValue(meta.na_high_bal)}\n`;
    if (hasDisplayValue(meta.na_callouts))
      post += `**Call Outs:** ${meta.na_callouts}\n`;
    post += "\n---\n";
    if (hasDisplayValue(meta.manager_notes)) {
      post +=
        "\n### 📝 Notes to Manager\n" + meta.manager_notes.trim() + "\n\n---\n";
    }
    if (hasDisplayValue(meta.handoff_note)) {
      post +=
        "\n### 🔄 Handoff Note for Morning Shift\n" +
        meta.handoff_note.trim() +
        "\n\n---\n";
    }
    const rsRows = HOTELS.filter((h) => {
      const s = rateShops.start?.[h.id];
      const m = rateShops.mid?.[h.id];
      const e = rateShops.end?.[h.id];
      return (
        s?.rate || s?.soldOut || m?.rate || m?.soldOut || e?.rate || e?.soldOut
      );
    });
    if (rsRows.length > 0) {
      post +=
        "\n### 💰 Rate Shop\n| Competitor | Start of Shift | Mid Shift | End of Shift |\n|------------|---------------|-----------|-------------|\n";
      rsRows.forEach((h) => {
        post += `| ${h.name} | ${fmtRateEntry(rateShops.start?.[h.id])} | ${fmtRateEntry(rateShops.mid?.[h.id])} | ${fmtRateEntry(rateShops.end?.[h.id])} |\n`;
      });
      post += "\n---\n";
    }
    if (attachments.length > 0) {
      post += `\n### 📎 Attachments (${attachments.length} file${attachments.length !== 1 ? "s" : ""})\n`;
      attachments.forEach((f) => {
        post += `- ${attachmentIcon(f.name)} [${f.name}](${f.url})\n`;
      });
    }
    return post;
  }

  function buildPost(version = null) {
    if (shift === "night") return buildNightAuditPost(version);
    const shiftEmoji = shift === "morning" ? "☀️" : "🌅";
    const handoffTarget = shift === "morning" ? "Swing Shift" : "Night Audit";
    const versionSuffix = version ? ` (v${version})` : '';
    let post = `## ${shiftEmoji} ${SHIFTS[shift].label} — ${fmtDate(meta.date)}${versionSuffix}\n**Front Desk Agent:** ${agent.name}\n\n---\n`;
    post += "\n### 📊 Hotel Snapshot\n| Metric | Value |\n|--------|-------|\n";
    post += `| Occupancy | ${meta.occ ? `${meta.occ}%` : "—"} |\n| ADR | $${meta.adr || "—"} |\n| Pending Arrivals | ${meta.pending || "0"} |\n| Today's Arrivals | ${meta.arrivals || "0"} |\n| Departures | ${meta.departures || "0"} |\n`;
    post += "\n---\n";
    const activityRows = [
      hasPositiveNumber(meta.declined)
        ? `| Declined Payments | ${meta.declined} |`
        : "",
      hasPositiveNumber(meta.ooo) ? `| Out of Order Rooms | ${meta.ooo} |` : "",
      hasPositiveNumber(meta.guest_req)
        ? `| Guest Requests | ${meta.guest_req} |`
        : "",
      hasPositiveNumber(meta.refunds)
        ? `| Rate Adjustments / Refunds | ${meta.refunds} |`
        : "",
    ].filter(Boolean);
    if (activityRows.length > 0) {
      post +=
        "\n### ⚠️ Activity & Incidents\n| Item | Count |\n|------|-------|\n";
      post += activityRows.join("\n") + "\n";
    }
    const oooLines = splitLines(meta.ooo_detail);
    if (oooLines.length) {
      post += "\n**Out of Order Room Details:**\n";
      oooLines.forEach((l) => {
        post += `- ${l}\n`;
      });
    }
    const guestReqLines = splitLines(meta.guest_req_detail);
    if (guestReqLines.length) {
      post += "\n**Guest Request Details:**\n";
      guestReqLines.forEach((l) => {
        post += `- ${l}\n`;
      });
    }
    const refundsLines = splitLines(meta.refunds_detail);
    if (refundsLines.length) {
      post += "\n**Rate Adj / Refund Details:**\n";
      refundsLines.forEach((l) => {
        post += `- ${l}\n`;
      });
    }
    const maintLines = splitLines(meta.maint_passdown);
    if (maintLines.length) {
      post += "\n**Maintenance / Passdown:**\n";
      maintLines.forEach((l) => {
        post += `- ${l}\n`;
      });
    }
    post += "\n---\n";
    if (hasDisplayValue(meta.manager_notes)) {
      post +=
        "\n### 📝 Notes to Manager\n" + meta.manager_notes.trim() + "\n\n---\n";
    }
    if (hasDisplayValue(meta.handoff_note)) {
      post +=
        `\n### 🔄 Handoff to ${handoffTarget}\n` +
        meta.handoff_note.trim() +
        "\n\n---\n";
    }
    const rsRowsR = HOTELS.filter((h) => {
      const s = rateShops.start?.[h.id];
      const m = rateShops.mid?.[h.id];
      const e = rateShops.end?.[h.id];
      return (
        s?.rate || s?.soldOut || m?.rate || m?.soldOut || e?.rate || e?.soldOut
      );
    });
    if (rsRowsR.length > 0) {
      post +=
        "\n### 💰 Rate Shop\n| Competitor | Start of Shift | Mid Shift | End of Shift |\n|------------|---------------|-----------|-------------|\n";
      rsRowsR.forEach((h) => {
        post += `| ${h.name} | ${fmtRateEntry(rateShops.start?.[h.id])} | ${fmtRateEntry(rateShops.mid?.[h.id])} | ${fmtRateEntry(rateShops.end?.[h.id])} |\n`;
      });
      post += "\n---\n";
    }
    if (attachments.length > 0) {
      post += `\n### 📎 Attachments (${attachments.length} file${attachments.length !== 1 ? "s" : ""})\n`;
      attachments.forEach((f) => {
        post += `- ${attachmentIcon(f.name)} [${f.name}](${f.url})\n`;
      });
    }
    return post;
  }

  // ── Manager post builder (full content + checklist detail) ───────────────
  function buildManagerPost(fullText) {
    let post = fullText
    post += '\n\n---\n'
    post += '\n### ✅ Full Checklist\n'
    post += `Completed **${doneCount} / ${tasks.length}** tasks\n\n`
    tasks.forEach(t => {
      const s = taskState[t.id] || {}
      const icon = s.done ? '✅' : '⬜'
      const ts = s.timestamp ? ` ⏱ ${s.timestamp}` : ''
      post += `${icon} **${t.name}** (${t.time})${ts}\n`
      if (s.note) post += `   ↳ ${s.note}\n`
    })
    return post
  }

  // ── Submit handlers ───────────────────────────────────────────────────────
  function handlePreview() {
    const version = editRecordId && postVersion > 1 ? postVersion : null;
    setPostText(buildPost(version));
    setShowOutput(true);
    setTimeout(
      () =>
        document
          .getElementById("output-section")
          ?.scrollIntoView({ behavior: "smooth" }),
      50,
    );
  }
  async function handleSubmitOnly() {
    if (shiftConflict && !editRecordId) return;
    setPostStatus("posting");
    try {
      await saveRecord();
      setPostStatus("success");
      setPosted(true);
      localStorage.removeItem(sessionKey);
    } catch (e) {
      setPostStatus("error");
      console.error(e);
    }
  }
  async function handlePost() {
    if (shiftConflict && !editRecordId) return;
    setPostStatus("posting");
    try {
      // Build base text (full — includes Notes to Manager)
      let baseText = postText;
      if (editRecordId) {
        let changesSection = '';
        if (originalFormState) {
          const changes = computeFormDiff(
            originalFormState.meta, meta,
            originalFormState.taskState, taskState,
            tasks
          );
          if (changes.length > 0)
            changesSection = `\n**What changed:**\n${changes.map(c => `- ${c}`).join('\n')}`;
        }
        baseText = `### ✏️ Edited Shift Log\n**Edited by:** ${agent.name}${changesSection}\n\n` + baseText;
      }

      // Staff post strips manager notes; manager post keeps everything + full checklist
      const staffText   = filterManagerNotes(baseText);
      const managerText = buildManagerPost(baseText);

      await Promise.allSettled([
        postShiftLogToTeams(staffText, 'shiftLogs'),
        postShiftLogToTeams(managerText, 'manager'),
      ]);

      await saveRecord();
      setOriginalFormState(null);
      setPostStatus("success");
      setPosted(true);
      localStorage.removeItem(sessionKey);
    } catch (e) {
      setPostStatus("error");
      await saveRecord();
      localStorage.removeItem(sessionKey);
    }
  }
  async function saveRecord() {
    const isNight = shift === "night";
    const record = {
      agent_id: agent.id,
      agent_name: agent.name,
      shift: SHIFTS[shift].label,
      date: meta.date || today(),
      occupancy: isNight ? meta.na_occ_n || meta.na_occ_s || "" : meta.occ,
      adr: isNight ? meta.na_adr_n || meta.na_adr_s || "" : meta.adr,
      declined_payments: isNight ? meta.na_declined || "" : meta.declined || "",
      manager_notes: meta.manager_notes,
      handoff_note: meta.handoff_note,
      total_done: doneCount,
      total_tasks: tasks.length,
      tasks: tasks.map((t) => ({
        id: t.id,
        name: t.name,
        time: t.time,
        done: !!taskState[t.id]?.done,
        timestamp: taskState[t.id]?.timestamp || null,
        note: taskState[t.id]?.note || "",
      })),
      post_text: postText,
      attachments,
      rate_shops: rateShops,
    };
    if (editRecordId) {
      await updateShiftRecord(editRecordId, record);
      setPostedRecordId(editRecordId);
    } else {
      const newId = await saveShiftRecord(record);
      setPostedRecordId(newId);
    }
    if (meta.handoff_note) {
      const hd = {
        note: meta.handoff_note,
        agent_name: agent.name,
        shift: SHIFTS[shift].label,
        date: fmtDate(meta.date),
      };
      try {
        await setHandoff(hd);
        onHandoffUpdate?.(hd);
      } catch (e) {}
    }
    // Refresh today's coverage after save
    getTodayAllRecords(today())
      .then((d) => {
        if (d) {
          setTodayCoverage(d);
          setTodayAllRecords(d);
        }
      })
      .catch(() => {});
  }
  function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => showToast("Copied!"));
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <div>
        {/* Topbar */}
        <div className="topbar">
          <div className="topbar-left">
            <div className="topbar-icon">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <rect
                  x="2"
                  y="3"
                  width="14"
                  height="12"
                  rx="2"
                  stroke="white"
                  strokeWidth="1.4"
                />
                <path
                  d="M5 3V1.5M13 3V1.5"
                  stroke="white"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
                <path d="M2 7h14" stroke="white" strokeWidth="1.2" />
                <path
                  d="M6 11l2 2 4-4"
                  stroke="white"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div>
              <div className="topbar-title">Home2 Suites · Front Desk</div>
              <div className="topbar-sub">Las Vegas North</div>
            </div>
          </div>
          <div className="topbar-right">
            <div className="topbar-agent-badge">{agent.name}</div>
            <div className="topbar-progress">
              <div className="mini-bar">
                <div
                  className="mini-bar-fill"
                  style={{ transform: `scaleX(${pct / 100})` }}
                />
              </div>
              <span className="topbar-pct">{pct}%</span>
            </div>
            {onBackToDashboard && (
              <button
                className="signout-btn"
                style={{}}
                onClick={onBackToDashboard}
              >
                ← Dashboard
              </button>
            )}
            <ThemePicker agentId={agent.id} />
            <button
              className="signout-btn"
              style={{}}
              onClick={() => setShowFeedback(true)}
            >
              Feedback
            </button>
            <button
              className="signout-btn"
              style={{}}
              onClick={() => setShowPrior(true)}
            >
              Prior Shifts
            </button>
            <button
              className="signout-btn"
              style={{}}
              onClick={onViewLogs}
            >
              Shift Logs
            </button>
            <button className="signout-btn" onClick={onSignOut}>
              Sign out
            </button>
          </div>
        </div>

        <div className={styles.wrap}>
          {/* ── Top strip ── */}
          <div className={styles.topStrip}>
            {/* Greeting row */}
            <div className={styles.greetRow}>
              <div>
                <div className={styles.greetSub}>{getGreeting()},</div>
                <div className={styles.greetName}>{agent.name}</div>
              </div>
              <div className={styles.greetDate}>{fmtDateLong(today())}</div>
            </div>

            {/* Handoff banner */}
            {handoff?.note && (
              <div className={`${styles.handoff} ${handoffAccepted ? styles.handoffAccepted : ''}`}>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  style={{ flexShrink: 0, marginTop: 3 }}
                >
                  <rect x="1" y="2" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
                  <path d="M1 5h12" stroke="currentColor" strokeWidth="1"/>
                  <path d="M4 8h6M4 10h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
                <div style={{ flex: 1 }}>
                  <span className={styles.handoffLabel}>
                    Handoff from {handoff.agent_name}
                  </span>
                  {handoff.shift && handoff.date && (
                    <span className={styles.handoffMeta}>
                      {" "}— {handoff.shift}, {handoff.date}
                    </span>
                  )}
                  <div className={styles.handoffNote}>{handoff.note}</div>
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

            {/* Rate shop window reminder */}
            {rateShopReminder &&
              !HOTELS.every(
                (h) =>
                  rateShops[rateShopReminder]?.[h.id]?.rate ||
                  rateShops[rateShopReminder]?.[h.id]?.soldOut,
              ) && (
                <div className={styles.rateShopReminderBanner}>
                  <span className={styles.rateShopReminderIcon}>🔔</span>
                  <span className={styles.rateShopReminderText}>
                    <strong>Rate Shop Reminder</strong> —{" "}
                    {PERIOD_LABELS[rateShopReminder]} window is now open. Enter
                    rates for all locations below.
                  </span>
                </div>
              )}

            {/* Today's coverage tiles */}
            <div className={styles.sectionLabel}>Today's Shift Coverage</div>
            <div className={styles.coverageTiles}>
              {SHIFT_KEYS.map((key) => {
                const rec = todayCoverage.find(
                  (r) => r.shift === SHIFTS[key].label,
                );
                const isMine = rec?.agent_id === agent.id;
                const isActive = key === shift;
                return (
                  <div
                    key={key}
                    className={`${styles.tile} ${rec ? styles.tileDone : ""} ${isActive ? styles.tileCurrent : ""}`}
                  >
                    <span className={styles.tileEmoji}>{SHIFT_EMOJI[key]}</span>
                    <div className={styles.tileInfo}>
                      <span className={styles.tileLabel}>
                        {SHIFTS[key].label}
                      </span>
                      {rec ? (
                        <>
                          <span className={styles.chipDone}>✓ Logged</span>
                          <span className={styles.tileMeta}>
                            {isMine ? "by you" : rec.agent_name} ·{" "}
                            {fmtTime(rec.submitted_at)}
                          </span>
                        </>
                      ) : (
                        <span
                          className={
                            isActive ? styles.chipActive : styles.chipOpen
                          }
                        >
                          {isActive ? "Your shift" : "Open"}
                        </span>
                      )}
                    </div>
                    {isActive && !rec && (
                      <button
                        className={styles.tileStartBtn}
                        onClick={() => {
                          setFormOpen(true);
                          setTimeout(
                            () =>
                              document
                                .getElementById("form-card")
                                ?.scrollIntoView({
                                  behavior: "smooth",
                                  block: "start",
                                }),
                            80,
                          );
                        }}
                      >
                        Start →
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Already-submitted choice inline banner */}
            {choiceRecords && !editRecordId && (
              <div className={styles.choiceBanner}>
                <div className={styles.choiceTitle}>
                  You've already submitted a shift log today
                </div>
                <div className={styles.choiceBtns}>
                  {choiceRecords.map((r) => {
                    const canEdit = isEditWindowOpen(r.shift);
                    return (
                      <button
                        key={r.id}
                        className={styles.choiceEditBtn}
                        onClick={() => canEdit && handleEditRecord(r)}
                        disabled={!canEdit}
                        title={!canEdit ? `Editing closed — window ended at ${editWindowCloseLabel(r.shift)}` : ''}
                        style={!canEdit ? { opacity: 0.45, cursor: 'not-allowed' } : {}}
                      >
                        {canEdit ? '✏️' : '🔒'} Edit {r.shift}{" "}
                        <span className={styles.choiceTime}>
                          · {fmtTime(r.submitted_at)}
                        </span>
                      </button>
                    );
                  })}
                  <button
                    className={styles.choiceNewBtn}
                    onClick={() => setChoiceRecords(null)}
                  >
                    ➕ Start new log (covering another agent)
                  </button>
                </div>
              </div>
            )}

            {/* Previous shift logs */}
            <PreviousShiftLogs
              records={prevLogs}
              loading={prevLogsLoading}
              isAdmin={!!agent.is_admin}
            />
          </div>

          {/* ── Two-column dashboard ── */}
          <div className={styles.dashGrid}>
            {/* LEFT — shift selector, collapsible form, rate shop */}
            <div className={styles.dashLeft}>
              {/* Edit mode banner */}
              {editRecordId && (
                <div className={styles.editBanner}>
                  <span>
                    <strong>✏️ Edit mode</strong> — updating your{" "}
                    {SHIFTS[shift].label} log from {fmtDate(meta.date)}
                  </span>
                  <button
                    className={styles.editBannerCancel}
                    onClick={cancelEdit}
                  >
                    ✕ Cancel
                  </button>
                </div>
              )}

              {/* Shift conflict warning */}
              {shiftConflict && !editRecordId && !posted && (
                <div className={styles.conflictBanner}>
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 18 18"
                    fill="none"
                    style={{ flexShrink: 0, marginTop: 2 }}
                  >
                    <path
                      d="M9 2L1 16h16L9 2z"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M9 7v4M9 13v.5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                  <div>
                    <strong>{SHIFTS[shift].label} already submitted</strong> by{" "}
                    {shiftConflict.agent_name} at{" "}
                    {fmtTime(shiftConflict.submitted_at)}.
                    {suggestedShifts.length > 0 && (
                      <span>
                        {" "}
                        Switch:{" "}
                        {suggestedShifts.map(([k, s]) => (
                          <button
                            key={k}
                            className={styles.switchBtn}
                            onClick={() => handleShiftChange(k)}
                          >
                            {SHIFT_EMOJI[k]} {s.label}
                          </button>
                        ))}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Shift selector */}
              <div className="card">
                <div className={styles.shiftLabel}>Select shift</div>
                <div className={styles.shiftTabs}>
                  {Object.entries(SHIFTS).map(([key, s]) => (
                    <button
                      key={key}
                      className={`${styles.shiftTab} ${shift === key ? styles.active : ""} ${editRecordId ? styles.tabDisabled : ""}`}
                      onClick={() => !editRecordId && handleShiftChange(key)}
                      disabled={!!editRecordId}
                    >
                      {SHIFT_EMOJI[key]} {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Collapsible shift details card ── */}
              <div className={`card ${styles.formCard}`} id="form-card">
                <button
                  className={styles.formCardHeader}
                  onClick={() => setFormOpen((v) => !v)}
                  aria-expanded={formOpen}
                >
                  <div className={styles.formCardHeaderLeft}>
                    <span className={styles.formCardTitle}>Shift Details</span>
                    <span className={styles.formCardMeta}>
                      {SHIFTS[shift].label} · {fmtDate(meta.date)}
                    </span>
                    {!formOpen && formSummary && (
                      <span className={styles.formCardSummary}>
                        {formSummary}
                      </span>
                    )}
                    {!formOpen && !formSummary && (
                      <span className={styles.formCardEmpty}>
                        Tap to fill in hotel stats, notes &amp; handoff
                      </span>
                    )}
                  </div>
                  <svg
                    className={`${styles.chevron} ${formOpen ? styles.chevronOpen : ""}`}
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                  >
                    <path
                      d="M4 6l4 4 4-4"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>

                {formOpen && (
                  <div className={styles.formCardBody}>
                    <div className={styles.agentBadge}>
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 12 12"
                        fill="none"
                      >
                        <circle
                          cx="6"
                          cy="4"
                          r="2.5"
                          stroke="currentColor"
                          strokeWidth="1.4"
                        />
                        <path
                          d="M1.5 10.5c0-2.485 2.015-4.5 4.5-4.5s4.5 2.015 4.5 4.5"
                          stroke="currentColor"
                          strokeWidth="1.4"
                          strokeLinecap="round"
                        />
                      </svg>
                      {agent.name}
                    </div>

                    {shift === "night" ? (
                      <NightAuditForm
                        meta={meta}
                        onMetaChange={handleMetaChange}
                      />
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
                )}
              </div>

              {/* Rate Shop */}
              <div className="card">
                <div className={styles.shiftLabel} style={{ marginBottom: 10 }}>
                  Rate Shop
                </div>
                <RateShopSection
                  shiftKey={shift}
                  rateShops={rateShops}
                  onChange={handleRateShopsChange}
                  onVarianceAlert={handleVarianceAlert}
                  varianceThreshold={handoff?.variance_threshold ?? undefined}
                />
              </div>
            </div>
            {/* /dashLeft */}

            {/* RIGHT — task list + actions (sticky) */}
            <div className={styles.dashRight}>
              <div className={styles.dashRightInner}>
                {/* Hotel Snapshot */}
                {!prevLogsLoading && prevLogs.length > 0 && !posted && (
                  <HotelSnapshot record={prevLogs[0]} />
                )}

                {/* Task list */}
                <div className={`card ${styles.taskCard}`}>
                  <div className={styles.tasksHeader}>
                    <span className={styles.tasksTitle}>
                      {SHIFTS[shift].label} Tasks
                    </span>
                    <span className={styles.tasksCount}>
                      {doneCount} / {tasks.length}
                    </span>
                  </div>
                  <div className={styles.progressWrap}>
                    <div className={styles.progressBg}>
                      <div
                        className={styles.progressFill}
                        style={{ transform: `scaleX(${pct / 100})` }}
                      />
                    </div>
                  </div>
                  <div className={styles.taskScrollable}>
                    <div className={styles.taskList}>
                      {tasks.map((t) => (
                        <TaskItem
                          key={t.id}
                          task={t}
                          state={taskState[t.id]}
                          onChange={handleTaskChange}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Status banner */}
                {postStatus && (
                  <div
                    className={`status-banner ${postStatus}`}
                    style={{ marginBottom: 8 }}
                  >
                    {postStatus === "posting" && <div className="spinner" />}
                    {postStatus === "posting" &&
                      (editRecordId ? "Updating…" : "Posting to Shift Logs…")}
                    {postStatus === "success" &&
                      (editRecordId
                        ? "✓ Shift log updated!"
                        : "✓ Posted successfully!")}
                    {postStatus === "error" &&
                      "⚠ Could not post — copy the text below and paste manually."}
                  </div>
                )}

                {/* Actions */}
                <div className={styles.actions}>
                  <button
                    className={`btn btn-secondary ${styles.actionBtn}`}
                    onClick={() => {
                      if (!confirm("Clear all completions and notes?")) return;
                      setTaskState({});
                      setShowOutput(false);
                      setPosted(false);
                      setPostStatus(null);
                      localStorage.removeItem(sessionKey);
                    }}
                  >
                    Clear
                  </button>
                  <button
                    className={`btn btn-primary ${styles.actionBtn}`}
                    onClick={handlePreview}
                    disabled={!!(shiftConflict && !editRecordId)}
                  >
                    {editRecordId ? "✦ Preview Update" : "✦ Preview Post"}
                  </button>
                  {showOutput && !posted && (
                    <button
                      className={`btn btn-submit ${styles.actionBtn}`}
                      onClick={handleSubmitOnly}
                      disabled={
                        postStatus === "posting" ||
                        !!(shiftConflict && !editRecordId)
                      }
                    >
                      {editRecordId ? "✓ Save Changes" : "✓ Submit"}
                    </button>
                  )}
                  {showOutput && !posted && (
                    <button
                      className={`btn btn-success ${styles.actionBtn}`}
                      onClick={handlePost}
                      disabled={
                        postStatus === "posting" ||
                        !!(shiftConflict && !editRecordId)
                      }
                    >
                      {editRecordId ? "▶ Save & Post" : "▶ Post to Teams"}
                    </button>
                  )}
                  {posted && postedRecordId && postStatus === "success" && (
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
            </div>
            {/* /dashRight */}
          </div>
          {/* /dashGrid */}

          {/* ── Full-width post preview ── */}
          {showOutput && (
            <div id="output-section" className={styles.outputSection}>
              {agent.is_admin && (
                <div className={styles.statRow}>
                  <div className={styles.statBox}>
                    <div className={styles.statNum}>{doneCount}</div>
                    <div className={styles.statLbl}>Completed</div>
                  </div>
                  <div className={styles.statBox}>
                    <div className={styles.statNum}>
                      {tasks.length - doneCount}
                    </div>
                    <div className={styles.statLbl}>Not done</div>
                  </div>
                  <div className={styles.statBox}>
                    <div className={styles.statNum}>
                      {tasks.filter((t) => taskState[t.id]?.note).length}
                    </div>
                    <div className={styles.statLbl}>With notes</div>
                  </div>
                </div>
              )}
              <div className="card">
                <div className={styles.cardHeader}>
                  <span className={styles.cardTitle}>
                    📋 Teams post preview
                  </span>
                  <button
                    className="btn-sm"
                    onClick={() =>
                      copyToClipboard(
                        agent.is_admin
                          ? postText
                          : filterManagerNotes(postText),
                      )
                    }
                  >
                    Copy
                  </button>
                </div>
                <PostPreview
                  text={
                    agent.is_admin ? postText : filterManagerNotes(postText)
                  }
                />
              </div>
              <div className="card">
                <div className={styles.cardHeader}>
                  <span className={styles.cardTitle}>
                    📄 Full checklist detail
                  </span>
                  <button
                    className="btn-sm"
                    onClick={() => {
                      const text = tasks
                        .map((t) => {
                          const s = taskState[t.id] || {};
                          const ts = s.timestamp
                            ? ` — completed ${s.timestamp}`
                            : "";
                          return `[${s.done ? "X" : " "}] ${t.name} (${t.time})${ts}${s.note ? `\n      ↳ ${s.note}` : ""}`;
                        })
                        .join("\n");
                      copyToClipboard(
                        `${SHIFTS[shift].label} — ${agent.name}\n${"─".repeat(40)}\n${text}`,
                      );
                    }}
                  >
                    Copy as text
                  </button>
                </div>
                {tasks.map((t) => {
                  const s = taskState[t.id] || {};
                  return (
                    <div key={t.id} className={styles.summaryRow}>
                      <span
                        className={`badge ${s.done ? "badge-done" : "badge-skip"}`}
                      >
                        {s.done ? "Done" : "Skip"}
                      </span>
                      <div>
                        <div className={styles.summaryName}>
                          {t.name}{" "}
                          <span className={styles.summaryTime}>({t.time})</span>
                          {s.timestamp && (
                            <span className={styles.summaryTs}>
                              {" "}
                              ⏱ {s.timestamp}
                            </span>
                          )}
                        </div>
                        {s.note && (
                          <div className={styles.summaryNote}>↳ {s.note}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
      {showPrior && (
        <PriorShifts agent={agent} onClose={() => setShowPrior(false)} />
      )}
      {showFeedback && (
        <FeedbackModal agent={agent} onClose={() => setShowFeedback(false)} />
      )}
    </>
  );
}
