export const THEMES = [
  { id: 'navy',   label: 'Navy',   brand: '#1B1B6B', mid: '#5557a8', light: '#eeeef8' },
  { id: 'indigo', label: 'Indigo', brand: '#3730a3', mid: '#6366f1', light: '#eef2ff' },
  { id: 'blue',   label: 'Blue',   brand: '#1e40af', mid: '#3b82f6', light: '#eff6ff' },
  { id: 'teal',   label: 'Teal',   brand: '#0f766e', mid: '#14b8a6', light: '#f0fdfa' },
  { id: 'green',  label: 'Green',  brand: '#166534', mid: '#16a34a', light: '#f0fdf4' },
  { id: 'purple', label: 'Purple', brand: '#6b21a8', mid: '#9333ea', light: '#faf5ff' },
  { id: 'rose',   label: 'Rose',   brand: '#9f1239', mid: '#e11d48', light: '#fff1f2' },
  { id: 'slate',  label: 'Slate',  brand: '#1e293b', mid: '#64748b', light: '#f8fafc' },
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

export function deriveTheme(brand) {
  return { brand, mid: mixWhite(brand, 0.38), light: mixWhite(brand, 0.90) }
}

export function applyTheme({ brand, mid, light }) {
  const root = document.documentElement
  root.style.setProperty('--brand', brand)
  root.style.setProperty('--brand-mid', mid)
  root.style.setProperty('--brand-light', light)
}

const storageKey = (id) => `home2_theme_${id}`

export function loadSavedTheme(agentId) {
  if (!agentId) return
  try {
    const saved = localStorage.getItem(storageKey(agentId))
    if (saved) applyTheme(JSON.parse(saved))
  } catch {}
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
