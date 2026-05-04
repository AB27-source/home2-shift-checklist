import { useState, useRef, useEffect } from 'react'
import { THEMES, deriveTheme, saveTheme, getSavedBrand } from '../lib/theme'
import { saveAgentTheme } from '../lib/supabase'
import styles from './ThemePicker.module.css'

export default function ThemePicker({ agentId }) {
  const [open, setOpen] = useState(false)
  const [customColor, setCustomColor] = useState(
    () => getSavedBrand(agentId) || '#282A36'
  )
  const ref = useRef()
  const dbSaveTimer = useRef(null)

  useEffect(() => {
    if (!open) return
    function onDown(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  function handlePreset(theme) {
    saveTheme(agentId, theme)
    saveAgentTheme(agentId, theme).catch(() => {})
    setCustomColor(theme.brand)
    setOpen(false)
  }

  function handleCustom(hex) {
    setCustomColor(hex)
    const theme = deriveTheme(hex)
    saveTheme(agentId, theme)
    // Debounce DB write — color picker fires on every drag pixel
    clearTimeout(dbSaveTimer.current)
    dbSaveTimer.current = setTimeout(() => {
      saveAgentTheme(agentId, theme).catch(() => {})
    }, 600)
  }

  return (
    <div className={styles.wrap} ref={ref}>
      <button
        className="signout-btn"
        onClick={() => setOpen(o => !o)}
        title="Change theme"
        aria-label="Change theme"
      >
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ marginRight: 4, verticalAlign: 'middle' }}>
          <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.3"/>
          <circle cx="4.5" cy="6" r="1" fill="currentColor"/>
          <circle cx="7" cy="4.5" r="1" fill="currentColor"/>
          <circle cx="9.5" cy="6" r="1" fill="currentColor"/>
          <path d="M5.5 9.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
        </svg>
        Theme
      </button>
      {open && (
        <div className={styles.popover}>
          <div className={styles.heading}>Theme</div>
          <div className={styles.swatches}>
            {THEMES.map(t => (
              <button
                key={t.id}
                className={styles.swatch}
                style={{ background: t.brand }}
                title={t.label}
                onClick={() => handlePreset(t)}
              />
            ))}
          </div>
          <div className={styles.divider} />
          <div className={styles.customRow}>
            <div>
              <div className={styles.customLabel}>Custom color</div>
              <div className={styles.customHint}>Pick any color</div>
            </div>
            <label className={styles.colorWrap} title="Pick a custom color">
              <span className={styles.colorPreview} style={{ background: customColor }} />
              <input
                type="color"
                value={customColor}
                onChange={e => handleCustom(e.target.value)}
                className={styles.colorInput}
              />
            </label>
          </div>
        </div>
      )}
    </div>
  )
}
