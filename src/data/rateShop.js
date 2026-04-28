// ── Competitor hotels for rate shopping ──────────────────────────────────────
// Add the direct booking page URL for each property.
// These are placeholders — update name/url as needed.
export const HOTELS = [
  { id: 'comp_1', name: 'TownePlace Suites', url: 'https://www.marriott.com/en-us/hotels/lasne-towneplace-suites-las-vegas-north-i-15/overview/' },
  { id: 'comp_2', name: 'Springhill Suites', url: 'https://www.marriott.com/en-us/hotels/lasvn-springhill-suites-las-vegas-north-speedway/overview/' },
  { id: 'comp_3', name: 'Homewood Suites', url: 'https://www.hilton.com/en/hotels/lasdahw-homewood-suites-north-las-vegas-speedway/' },
  { id: 'comp_4', name: 'Hampton Inn', url: 'https://www.hilton.com/en/hotels/lasnohx-hampton-las-vegas-north-speedway/' },
  { id: 'comp_5', name: 'Home2 Suites Las Vegas Northwest', url: 'https://www.hilton.com/en/hotels/lasnwht-home2-suites-las-vegas-northwest/' },
]

// Dollar variance that triggers a manager alert (e.g. $15 = 15 dollars)
export const VARIANCE_THRESHOLD = 15

// ── Time windows (minutes from midnight) for each shift ──────────────────────
// Night shift windows are in "shift minutes" (0 = 10 PM, 480 = 6 AM next day).
export const RATE_SHOP_WINDOWS = {
  morning: {
    start: [6 * 60,        9 * 60 + 30],   // 6:00 AM – 9:29 AM
    mid:   [9 * 60 + 30,   12 * 60 + 30],  // 9:30 AM – 12:29 PM
    end:   [12 * 60 + 30,  14 * 60],       // 12:30 PM – 2:00 PM
  },
  swing: {
    start: [14 * 60,       17 * 60 + 30],  // 2:00 PM – 5:29 PM
    mid:   [17 * 60 + 30,  20 * 60 + 30],  // 5:30 PM – 8:29 PM
    end:   [20 * 60 + 30,  22 * 60],       // 8:30 PM – 10:00 PM
  },
  night: {
    // Minutes since 22:00 (10 PM). Midnight = 120 min, 6 AM = 480 min.
    start: [0,   180],   // 10:00 PM – 12:59 AM
    mid:   [180, 360],   // 1:00 AM  –  3:59 AM
    end:   [360, 480],   // 4:00 AM  –  6:00 AM
  },
}

export const PERIOD_LABELS = {
  start: 'Start of Shift',
  mid:   'Mid Shift',
  end:   'End of Shift',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convert the current clock time to the window-relative minute value for a shift. */
function currentWindowMinutes(shiftKey) {
  const now = new Date()
  const total = now.getHours() * 60 + now.getMinutes()
  if (shiftKey === 'night') {
    // Night shift starts at 22:00; after midnight wrap by adding 120 min offset
    return total >= 22 * 60 ? total - 22 * 60 : 120 + total
  }
  return total
}

/** Format a window-relative minute value back to a readable time string. */
function fmtWindowMin(shiftKey, mins) {
  let abs = shiftKey === 'night' ? (mins + 22 * 60) % (24 * 60) : mins
  const h = Math.floor(abs / 60) % 24
  const m = abs % 60
  const ap = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ap}`
}

/**
 * Returns the period key that is currently open ('start' | 'mid' | 'end'),
 * or null if no window is active right now.
 */
export function getActivePeriod(shiftKey) {
  const windows = RATE_SHOP_WINDOWS[shiftKey]
  if (!windows) return null
  const cur = currentWindowMinutes(shiftKey)
  for (const p of ['start', 'mid', 'end']) {
    const [from, to] = windows[p]
    if (cur >= from && cur < to) return p
  }
  return null
}

/**
 * Returns a status object describing the current window state:
 *   { active: 'mid' | null, message: string }
 */
export function getWindowStatus(shiftKey) {
  const windows = RATE_SHOP_WINDOWS[shiftKey]
  if (!windows) return { active: null, message: '' }
  const cur = currentWindowMinutes(shiftKey)
  const periods = ['start', 'mid', 'end']

  for (let i = 0; i < periods.length; i++) {
    const p = periods[i]
    const [from, to] = windows[p]

    if (cur >= from && cur < to) {
      return {
        active: p,
        message: `${PERIOD_LABELS[p]} window open — closes at ${fmtWindowMin(shiftKey, to)}`,
      }
    }
    // Before this window's open time → next window is `p`
    if (cur < from) {
      return {
        active: null,
        message: `Next window: ${PERIOD_LABELS[p]} opens at ${fmtWindowMin(shiftKey, from)}`,
      }
    }
  }

  return { active: null, message: 'All rate shop windows have closed for this shift' }
}
