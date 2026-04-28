// ─────────────────────────────────────────────────────────────────────────────
// teamsClient.js
// ─────────────────────────────────────────────────────────────────────────────
// Drop this file at:  src/lib/teamsClient.js
//
// Client-side helper for posting shift logs to Teams as Adaptive Cards.
// Calls the `post-shift-log` Supabase Edge Function, which keeps the Teams
// webhook URL server-side and renders the Adaptive Card before forwarding.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from './supabase'

/**
 * Post a shift log to a Teams channel as an Adaptive Card.
 *
 * @param {string} postText - Markdown produced by buildPost() / buildNightAuditPost().
 *                            The caller should already have run filterManagerNotes()
 *                            if posting to the staff-visible Shift Logs channel.
 * @param {'shiftLogs'|'manager'} [webhook='shiftLogs'] - Which channel to use.
 *                            Maps to TEAMS_SHIFT_LOGS_WEBHOOK or
 *                            TEAMS_MANAGER_WEBHOOK secret on the function.
 * @returns {Promise<{ ok: true, status: number }>}
 */
export async function postShiftLogToTeams(postText, webhook = 'shiftLogs') {
  const { data, error } = await supabase.functions.invoke('post-shift-log', {
    body: { postText, webhook },
  })
  if (error) throw error
  if (!data?.ok) {
    throw new Error(data?.error || 'Failed to post shift log to Teams')
  }
  return data
}