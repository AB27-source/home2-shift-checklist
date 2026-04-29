import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://iqmlrcjstvuxmegqibim.supabase.co'
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlxbWxyY2pzdHZ1eG1lZ3FpYmltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2NjU3NDksImV4cCI6MjA5MTI0MTc0OX0.KA7DcJh6HxuUjw3NMrPF0vo6QL8VBxKgZNWhKhyQBeU'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON)

function isMissingRpc(error, fnName) {
  const message = String(error?.message || '')
  const details = String(error?.details || '')
  const hint = String(error?.hint || '')
  const haystack = `${message}\n${details}\n${hint}`
  return haystack.includes(fnName) || haystack.includes('Could not find the function') || haystack.includes('schema cache')
}

export function isAppSessionError(error) {
  const message = String(error?.message || '')
  return (
    message.includes('Session required') ||
    message.includes('Invalid or expired session') ||
    message.includes('Admin session required')
  )
}

function createMigrationRequiredError(action) {
  return new Error(`Database migration required before ${action}. Apply the latest Supabase migration and retry.`)
}

function normalizeAgent(row) {
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    color: row.color,
    is_admin: row.is_admin === true,
    is_super_admin: row.is_super_admin === true,
  }
}

// ── Agents / Sessions ───────────────────────
export async function getAgents() {
  const { data, error } = await supabase.rpc('get_agent_directory')
  if (error) {
    if (!isMissingRpc(error, 'get_agent_directory')) throw error
    const fallback = await supabase
      .from('agents')
      .select('id, name, role, color, is_admin')
      .eq('active', true)
      .order('created_at', { ascending: true })
    if (fallback.error) throw fallback.error
    return (fallback.data || []).map(normalizeAgent)
  }
  return (data || []).map(normalizeAgent)
}

export async function verifyAgentPin(agentId, pin) {
  const { data, error } = await supabase.rpc('verify_agent_pin', {
    p_agent_id: agentId,
    p_pin_attempt: pin,
  })
  if (error) {
    if (isMissingRpc(error, 'verify_agent_pin')) throw createMigrationRequiredError('sign-in')
    throw error
  }
  const row = data?.[0]
  if (!row) return null
  return {
    agent: normalizeAgent(row),
    sessionToken: row.session_token,
  }
}

export async function restoreAgentSession(sessionToken) {
  const { data, error } = await supabase.rpc('restore_app_session', {
    p_session_token: sessionToken,
  })
  if (error) {
    if (isMissingRpc(error, 'restore_app_session')) return null
    throw error
  }
  return normalizeAgent(data?.[0] || null)
}

export async function signOutAgentSession(sessionToken) {
  if (!sessionToken) return
  const { error } = await supabase.rpc('sign_out_app_session', {
    p_session_token: sessionToken,
  })
  if (error && !isMissingRpc(error, 'sign_out_app_session')) throw error
}

export async function addAgent(sessionToken, agent) {
  const { data, error } = await supabase.rpc('admin_add_agent', {
    p_session_token: sessionToken,
    p_name: agent.name,
    p_role: agent.role,
    p_pin: agent.pin,
    p_color: agent.color,
    p_is_admin: agent.is_admin === true,
  })
  if (error) {
    if (isMissingRpc(error, 'admin_add_agent')) throw createMigrationRequiredError('adding agents')
    throw error
  }
  return normalizeAgent(data?.[0] || null)
}

export async function updateAgent(sessionToken, id, fields) {
  const { error } = await supabase.rpc('admin_update_agent', {
    p_session_token: sessionToken,
    p_agent_id: id,
    p_name: fields.name,
    p_role: fields.role,
    p_is_admin: fields.is_admin === true,
  })
  if (error) {
    if (isMissingRpc(error, 'admin_update_agent')) throw createMigrationRequiredError('editing agents')
    throw error
  }
}

export async function resetAgentPin(sessionToken, id, pin) {
  const { error } = await supabase.rpc('admin_reset_agent_pin', {
    p_session_token: sessionToken,
    p_agent_id: id,
    p_pin: pin,
  })
  if (error) {
    if (isMissingRpc(error, 'admin_reset_agent_pin')) throw createMigrationRequiredError('resetting PINs')
    throw error
  }
}

export async function deactivateAgent(sessionToken, id) {
  const { error } = await supabase.rpc('admin_deactivate_agent', {
    p_session_token: sessionToken,
    p_agent_id: id,
  })
  if (error) {
    if (isMissingRpc(error, 'admin_deactivate_agent')) throw createMigrationRequiredError('removing agents')
    throw error
  }
}

// ── Shift Tasks ──────────────────────────────
export async function getShiftTasks() {
  const { data, error } = await supabase
    .from('shift_tasks')
    .select('id, shift, name, estimated_time, position')
    .eq('active', true)
    .order('position', { ascending: true })
  if (error) return null
  const grouped = { morning: [], swing: [], night: [] }
  for (const row of (data || [])) {
    if (grouped[row.shift]) {
      grouped[row.shift].push({ id: row.id, name: row.name, time: row.estimated_time })
    }
  }
  return grouped
}

export async function addShiftTask(shiftKey, name, estimatedTime) {
  const { data: existing } = await supabase
    .from('shift_tasks')
    .select('position')
    .eq('shift', shiftKey)
    .eq('active', true)
    .order('position', { ascending: false })
    .limit(1)
  const nextPos = (existing?.[0]?.position ?? -1) + 1
  const { data, error } = await supabase
    .from('shift_tasks')
    .insert({ shift: shiftKey, name, estimated_time: estimatedTime, position: nextPos })
    .select('id, name, estimated_time')
    .single()
  if (error) throw error
  return { id: data.id, name: data.name, time: data.estimated_time }
}

export async function updateShiftTask(id, { name, time }) {
  const { error } = await supabase
    .from('shift_tasks')
    .update({ name, estimated_time: time })
    .eq('id', id)
  if (error) throw error
}

export async function deleteShiftTask(id) {
  const { error } = await supabase
    .from('shift_tasks')
    .update({ active: false })
    .eq('id', id)
  if (error) throw error
}

export async function moveShiftTask(id, siblingId) {
  // Swap positions of two adjacent tasks
  const { data, error } = await supabase
    .from('shift_tasks')
    .select('id, position')
    .in('id', [id, siblingId])
  if (error) throw error
  const [a, b] = data
  await Promise.all([
    supabase.from('shift_tasks').update({ position: b.position }).eq('id', a.id),
    supabase.from('shift_tasks').update({ position: a.position }).eq('id', b.id),
  ])
}

// ── Rate Variance Alerts ─────────────────────
export async function saveVarianceAlert({ agentId, agentName, shift, date, hotel, period, startRate, newRate }) {
  const { error } = await supabase
    .from('rate_variance_alerts')
    .insert({ agent_id: agentId, agent_name: agentName, shift, date, hotel, period, start_rate: startRate, new_rate: newRate })
  if (error) throw error
}

export async function getTodayVarianceAlerts() {
  const today = new Date().toISOString().split('T')[0]
  const { data, error } = await supabase
    .from('rate_variance_alerts')
    .select('*')
    .eq('date', today)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export function subscribeVarianceAlerts(callback) {
  return supabase
    .channel('rate_variance_alerts_changes')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'rate_variance_alerts' }, callback)
    .subscribe()
}

// ── Live Rate Shop ───────────────────────────
export async function upsertLiveRateShop({ agentId, agentName, shift, date, rateShops }) {
  const { error } = await supabase
    .from('rate_shop_live')
    .upsert(
      { agent_id: agentId, agent_name: agentName, shift, date, rate_shops: rateShops, updated_at: new Date().toISOString() },
      { onConflict: 'agent_id,shift,date' }
    )
  if (error) throw error
}

export async function getLiveRateShops({ todayOnly = false } = {}) {
  const today = new Date().toISOString().split('T')[0]
  let query = supabase
    .from('rate_shop_live')
    .select('*')
    .order('updated_at', { ascending: false })
  if (todayOnly) query = query.eq('date', today)
  const { data, error } = await query
  if (error) throw error
  return data || []
}

export function subscribeLiveRateShops(callback) {
  return supabase
    .channel('rate_shop_live_changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rate_shop_live' }, callback)
    .subscribe()
}

// ── Shift Records ────────────────────────────
export async function saveShiftRecord(record) {
  const { data, error } = await supabase
    .from('shift_records')
    .insert(record)
    .select('id')
    .single()
  if (error) throw error
  return data?.id ?? null
}

export async function deleteShiftRecords(sessionToken, ids) {
  const { error } = await supabase.rpc('admin_delete_shift_records', {
    p_session_token: sessionToken,
    p_ids: ids,
  })
  if (error) {
    if (isMissingRpc(error, 'admin_delete_shift_records')) throw createMigrationRequiredError('deleting shift records')
    throw error
  }
}

export async function updateShiftRecord(id, record) {
  const { data: current, error: fetchError } = await supabase
    .from('shift_records')
    .select('post_text, submitted_at, edit_history')
    .eq('id', id)
    .single()
  if (fetchError) throw fetchError

  const snapshot = {
    post_text: current.post_text,
    submitted_at: current.submitted_at,
    replaced_at: new Date().toISOString(),
  }
  const edit_history = [snapshot, ...(current.edit_history || [])]

  const { error } = await supabase
    .from('shift_records')
    .update({ ...record, edit_history })
    .eq('id', id)
  if (error) throw error
}

// All records for a given date across ALL agents (used for shift-conflict detection)
export async function getTodayAllRecords(date) {
  const { data, error } = await supabase
    .from('shift_records')
    .select('id, shift, date, agent_id, agent_name, submitted_at')
    .eq('date', date)
    .order('submitted_at', { ascending: false })
  if (error) throw error
  return data
}

export async function getAgentTodayRecords(agentId, date) {
  const { data, error } = await supabase
    .from('shift_records')
    .select('id, shift, date, agent_name, total_done, total_tasks, post_text, submitted_at, occupancy, adr, declined_payments, manager_notes, handoff_note, tasks, attachments, rate_shops, edit_history')
    .eq('agent_id', agentId)
    .eq('date', date)
    .order('submitted_at', { ascending: false })
  if (error) throw error
  return data
}

export async function getShiftRecords({ agentId, shift, days } = {}) {
  let query = supabase
    .from('shift_records')
    .select('*')
    .order('submitted_at', { ascending: false })
    .limit(200)

  if (agentId) query = query.eq('agent_id', agentId)
  if (shift) query = query.eq('shift', shift)
  if (days && days < 999) {
    const since = new Date()
    since.setDate(since.getDate() - days)
    query = query.gte('date', since.toISOString().split('T')[0])
  }

  const { data, error } = await query
  if (error) throw error
  return data
}

export async function getShiftRecordsByDateRange(startDate, endDate) {
  const { data, error } = await supabase
    .from('shift_records')
    .select('id, shift, date, agent_name, total_done, total_tasks, post_text, submitted_at, manager_notes, tasks, attachments, edit_history')
    .gte('date', startDate)
    .lte('date', endDate)
    .order('submitted_at', { ascending: true })
  if (error) throw error
  return data
}

export async function getPreviousShiftLogs(shiftLabels, dates) {
  const { data, error } = await supabase
    .from('shift_records')
    .select('id, shift, date, agent_name, total_done, total_tasks, post_text, submitted_at, attachments, occupancy, adr, declined_payments')
    .in('shift', shiftLabels)
    .in('date', dates)
    .order('submitted_at', { ascending: false })
    .limit(10)
  if (error) throw error
  return data
}

// ── Handoff Note ─────────────────────────────
export async function getHandoff() {
  const { data, error } = await supabase
    .from('handoff')
    .select('*')
    .eq('id', 1)
    .single()
  if (error && error.code !== 'PGRST116') throw error
  return data
}

export async function setHandoff(fields) {
  const { error } = await supabase
    .from('handoff')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', 1)
  if (error) throw error
}

// ── Shift Attachments (Supabase Storage) ─────
export async function uploadAttachment(file, agentId, date) {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${date}/${agentId}/${Date.now()}_${safeName}`
  const { error } = await supabase.storage
    .from('shift-attachments')
    .upload(path, file, { cacheControl: '3600', upsert: false })
  if (error) throw error
  const { data } = supabase.storage.from('shift-attachments').getPublicUrl(path)
  return data.publicUrl
}

export async function deleteAttachment(url) {
  const marker = '/shift-attachments/'
  const idx = url.indexOf(marker)
  if (idx === -1) return
  const path = decodeURIComponent(url.slice(idx + marker.length).split('?')[0])
  const { error } = await supabase.storage.from('shift-attachments').remove([path])
  if (error) throw error
}

// ── Teams Webhook ────────────────────────────
const SHIFT_LOGS_WEBHOOK = 'https://default0bdf1babc1064aac97a74f153f6527.93.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/9b281745a8654b8c8eed2bbd667c0072/triggers/manual/paths/invoke?api-version=1'
export const MANAGER_WEBHOOK = '' // add later

export async function postToTeams(text, webhookUrl = SHIFT_LOGS_WEBHOOK) {
  if (!webhookUrl) throw new Error('No webhook URL configured')
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  if (!res.ok && res.status !== 202) throw new Error(`HTTP ${res.status}`)
}
