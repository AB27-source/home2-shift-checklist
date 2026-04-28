import { useState, useEffect } from 'react'
import { verifyAgentPin } from '../lib/supabase'
import styles from './PinScreen.module.css'

const KEYS = ['1','2','3','4','5','6','7','8','9','','0','⌫']

export default function PinScreen({ agent, onSuccess, onBack }) {
  const [pin, setPin]     = useState('')
  const [error, setError] = useState('')
  const [shake, setShake] = useState(false)
  const [checking, setChecking] = useState(false)

  function handleKey(k) {
    if (checking) return
    if (k === '⌫') {
      setPin(p => p.slice(0, -1))
      setError('')
      return
    }
    if (k === '' || pin.length >= 4) return
    const next = pin + k
    setPin(next)
    if (next.length === 4) setTimeout(() => checkPin(next), 120)
  }

  // Keyboard support — digits, Backspace, and Enter
  useEffect(() => {
    function onKeyDown(e) {
      if (checking) return
      if (e.key >= '0' && e.key <= '9') handleKey(e.key)
      else if (e.key === 'Backspace') handleKey('⌫')
      else if (e.key === 'Enter' && pin.length === 4) checkPin(pin)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [pin, checking]) // re-register when pin changes so closures stay fresh

  async function checkPin(entered) {
    if (checking) return
    setChecking(true)
    try {
      const verified = await verifyAgentPin(agent.id, entered)
      if (verified) {
        setError('')
        onSuccess(verified)
        return
      }
      setShake(true)
      setError('Incorrect PIN. Try again.')
      setTimeout(() => { setPin(''); setShake(false) }, 700)
    } catch (e) {
      setShake(true)
      setError(e?.message || 'Could not verify PIN. Please try again.')
      setTimeout(() => { setShake(false) }, 700)
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.box}>
        <div className={styles.greeting}>Hi, {agent.name}!</div>
        <div className={styles.sub}>Enter your 4-digit PIN</div>

        <div className={`${styles.dots} ${shake ? styles.shake : ''}`}>
          {[0,1,2,3].map(i => (
            <div key={i} className={`${styles.dot} ${i < pin.length ? styles.filled : ''} ${shake && i < pin.length ? styles.error : ''}`} />
          ))}
        </div>

        <div className={styles.keypad}>
          {KEYS.map((k, i) => (
            <button
              key={i}
              className={`${styles.key} ${k === '' ? styles.empty : ''} ${k === '⌫' ? styles.delete : ''}`}
              onClick={() => handleKey(k)}
              disabled={k === '' || checking}
            >
              {k}
            </button>
          ))}
        </div>

        <div className={styles.error}>{checking ? 'Verifying…' : error}</div>
        <button className={styles.back} onClick={onBack} disabled={checking}>← Back</button>
      </div>
    </div>
  )
}
