export const THEMES = [
  { id: 'theme-navy',    label: 'Navy',    brand: '#1E3A5F', mid: '#3B6FA0', light: '#EDF2F8' },
  { id: 'theme-slate',   label: 'Slate',   brand: '#334155', mid: '#64748B', light: '#F1F5F9' },
  { id: 'theme-crimson', label: 'Crimson', brand: '#991B1B', mid: '#DC2626', light: '#FEF2F2' },
  { id: 'theme-amber',   label: 'Amber',   brand: '#92400E', mid: '#D97706', light: '#FFFBEB' },
  { id: 'theme-forest',  label: 'Forest',  brand: '#14532D', mid: '#16A34A', light: '#F0FDF4' },
  { id: 'theme-teal',    label: 'Teal',    brand: '#0E5F75', mid: '#0891B2', light: '#ECFEFF' },
  { id: 'theme-violet',  label: 'Violet',  brand: '#4C1D95', mid: '#7C3AED', light: '#F5F3FF' },
  { id: 'theme-rose',    label: 'Rose',    brand: '#881337', mid: '#E11D48', light: '#FFF1F2' },
]

function hexToRgb(hex) {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)]
}

function mixWhite(hex, t) {
  const [r,g,b] = hexToRgb(hex)
  const c = v => Math.round(v + (255-v)*t).toString(16).padStart(2,'0')
  return `#${c(r)}${c(g)}${c(b)}`
}

function isLight(hex) {
  const [r,g,b] = hexToRgb(hex)
  // Perceived brightness (W3C formula)
  return (r * 299 + g * 587 + b * 114) / 1000 > 155
}

export function deriveTheme(brand) {
  return { brand, mid: mixWhite(brand, 0.38), light: mixWhite(brand, 0.90) }
}

export function applyTheme({ brand, mid, light }) {
  const root = document.documentElement
  root.style.setProperty('--brand', brand)
  root.style.setProperty('--brand-mid', mid)
  root.style.setProperty('--brand-light', light)

  // Topbar text/button colours — switch to dark when brand is a light colour
  const light_topbar = isLight(brand)
  root.style.setProperty('--topbar-text',       light_topbar ? '#1a1a2e'              : '#ffffff')
  root.style.setProperty('--topbar-btn-bg',      light_topbar ? 'rgba(0,0,0,0.08)'    : 'rgba(255,255,255,0.14)')
  root.style.setProperty('--topbar-btn-hover',   light_topbar ? 'rgba(0,0,0,0.14)'    : 'rgba(255,255,255,0.24)')
  root.style.setProperty('--topbar-border',      light_topbar ? 'rgba(0,0,0,0.15)'    : 'rgba(255,255,255,0.25)')
  root.style.setProperty('--topbar-icon-bg',     light_topbar ? 'rgba(0,0,0,0.08)'    : 'rgba(255,255,255,0.15)')
  root.style.setProperty('--topbar-muted-bar',   light_topbar ? 'rgba(0,0,0,0.15)'    : 'rgba(255,255,255,0.25)')

  // Page background — very light pastel tint of the brand colour
  root.style.setProperty('--page-bg', mixWhite(brand, 0.95))
}

const storageKey = (id) => `home2_theme_${id}`

export function loadSavedTheme(agentId, dbTheme = null) {
  try {
    let theme = dbTheme
    if (!theme && agentId) {
      const cached = localStorage.getItem(storageKey(agentId))
      if (cached) theme = JSON.parse(cached)
    }
    theme = theme || THEMES[0]
    applyTheme(theme)
    // Keep localStorage in sync with DB value
    if (dbTheme && agentId) {
      try { localStorage.setItem(storageKey(agentId), JSON.stringify(dbTheme)) } catch {}
    }
  } catch {
    applyTheme(THEMES[0])
  }
}

export function saveTheme(agentId, theme) {
  applyTheme(theme)
  if (!agentId) return
  try { localStorage.setItem(storageKey(agentId), JSON.stringify(theme)) } catch {}
}

export function getSavedBrand(agentId) {
  try {
    const saved = localStorage.getItem(storageKey(agentId))
    return saved ? JSON.parse(saved).brand : null
  } catch { return null }
}
