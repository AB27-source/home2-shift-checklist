export const THEMES = [
  { id: 'dracula-bg',     label: 'Background', brand: '#282A36', mid: '#6272a4', light: '#eeeef8' },
  { id: 'dracula-red',    label: 'Red',        brand: '#FF5555', mid: '#ff9090', light: '#fff0f0' },
  { id: 'dracula-orange', label: 'Orange',     brand: '#FFB86C', mid: '#c47a0a', light: '#fff7ee' },
  { id: 'dracula-yellow', label: 'Yellow',     brand: '#F1FA8C', mid: '#8a9e00', light: '#fafde8' },
  { id: 'dracula-green',  label: 'Green',      brand: '#50FA7B', mid: '#00a832', light: '#eafff1' },
  { id: 'dracula-cyan',   label: 'Cyan',       brand: '#8BE9FD', mid: '#0088bb', light: '#e8f9ff' },
  { id: 'dracula-purple', label: 'Purple',     brand: '#BD93F9', mid: '#7c3aed', light: '#f3edff' },
  { id: 'dracula-pink',   label: 'Pink',       brand: '#FF79C6', mid: '#cc0080', light: '#ffe8f5' },
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

export function loadSavedTheme(agentId) {
  try {
    const saved = agentId ? localStorage.getItem(storageKey(agentId)) : null
    applyTheme(saved ? JSON.parse(saved) : THEMES[0])
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
