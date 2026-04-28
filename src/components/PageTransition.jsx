import { useEffect, useRef, useState } from 'react'

// Maps each screen name to its enter animation class
const ENTER_CLASSES = {
  loading:   'screen-enter',
  login:     'screen-login-enter',
  pin:       'screen-pin-enter',
  home:      'screen-checklist-enter',
  checklist: 'screen-checklist-enter',
  logs:      'screen-checklist-enter',
  manager:   'screen-dashboard-enter',
  error:     'screen-enter',
}

export default function PageTransition({ screen, children }) {
  const [displayed, setDisplayed] = useState(screen)
  const [animClass, setAnimClass] = useState(ENTER_CLASSES[screen] || 'screen-enter')
  const [exiting, setExiting]     = useState(false)
  const pendingScreen = useRef(null)

  useEffect(() => {
    if (screen === displayed) return

    // Start exit animation
    setExiting(true)
    pendingScreen.current = screen

    const exitDuration = 180 // ms — matches --dur-exit
    const t = setTimeout(() => {
      setDisplayed(pendingScreen.current)
      setAnimClass(ENTER_CLASSES[pendingScreen.current] || 'screen-enter')
      setExiting(false)
    }, exitDuration)

    return () => clearTimeout(t)
  }, [screen])

  return (
    <div
      key={displayed}
      className={exiting ? 'screen-exit' : animClass}
      style={{ minHeight: '100vh' }}
    >
      {children}
    </div>
  )
}
