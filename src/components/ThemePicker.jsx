import { useState, useRef, useEffect } from 'react'
import { THEMES, deriveTheme, saveTheme, getSavedBrand } from '../lib/theme'
import styles from './ThemePicker.module.css'

export default function ThemePicker({ agentId }) {
  const [open, setOpen] = useState(false)
  const [customColor, setCustomColor] = useState(
    () => getSavedBrand(agentId) || '#1B1B6B'
  )
  const ref = useRef()

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
    setCustomColor(theme.brand)
    setOpen(false)
  }

  function handleCustom(hex) {
    setCustomColor(hex)
    saveTheme(agentId, deriveTheme(hex))
  }

  return (
    <div className={styles.wrap} ref={ref}>
      <button
        className="signout-btn"
        style={{ background: 'rgba(255,255,255,0.18)', padding: '4px 8px', fontSize: 15 }}
        onClick={() => setOpen(o => !o)}
        title="Change theme"
        aria-label="Change theme"
      >
        🎨
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
