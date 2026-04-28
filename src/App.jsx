import { useState, useEffect, useCallback } from 'react'
import { getAgents, getHandoff, restoreAgentSession, signOutAgentSession, isAppSessionError } from './lib/supabase'
import LoginScreen     from './components/LoginScreen'
import PinScreen       from './components/PinScreen'
import StaffDashboard  from './components/StaffDashboard'
import ShiftLogBrowser from './components/ShiftLogBrowser'
import Dashboard       from './components/manager/Dashboard'
import Toast           from './components/Toast'
import PageTransition  from './components/PageTransition'
import './styles/app.css'
import './styles/animations.css'

const ACTIVE_AGENT_KEY = 'home2_active_agent'

export default function App() {
  const [screen, setScreen]         = useState('loading')
  const [agents, setAgents]         = useState([])
  const [handoff, setHandoff]       = useState(null)
  const [selectedAgent, setSelectedAgent] = useState(null)
  const [currentAgent, setCurrentAgent]   = useState(null)
  const [sessionToken, setSessionToken]   = useState(null)
  const [toast, setToast]           = useState(null)
  const [bootError, setBootError]   = useState('')

  const showToast = useCallback((msg) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }, [])

  const loadInitialData = useCallback(async () => {
    try {
      const [agentsData, handoffData] = await Promise.all([getAgents(), getHandoff()])
      setAgents(agentsData)
      setHandoff(handoffData)
      setBootError('')
      return { agentsData, handoffData }
    } catch (e) {
      console.error(e)
      setBootError(e?.message || 'Could not connect to database.')
      setScreen('error')
      return null
    }
  }, [])

  // On mount: load data, then check if an agent was already logged in
  useEffect(() => {
    loadInitialData().then(async (result) => {
      if (!result) return
      try {
        const saved = sessionStorage.getItem(ACTIVE_AGENT_KEY)
        if (saved) {
          const cachedSession = JSON.parse(saved)
          if (cachedSession?.sessionToken) {
            const restoredAgent = await restoreAgentSession(cachedSession.sessionToken)
            if (restoredAgent) {
              setCurrentAgent(restoredAgent)
              setSessionToken(cachedSession.sessionToken)
              try {
                sessionStorage.setItem(ACTIVE_AGENT_KEY, JSON.stringify({
                  agentId: restoredAgent.id,
                  sessionToken: cachedSession.sessionToken,
                }))
              } catch (e) {}
              setScreen(restoredAgent.is_admin ? 'manager' : 'home')
              return
            }
          }
        }
      } catch(e) {}
      try { sessionStorage.removeItem(ACTIVE_AGENT_KEY) } catch (e) {}
      setScreen('login')
    })
  }, [loadInitialData])

  useEffect(() => {
    if (!sessionToken) return

    const intervalId = setInterval(async () => {
      try {
        const restoredAgent = await restoreAgentSession(sessionToken)
        if (restoredAgent) {
          setCurrentAgent(prev => prev?.id === restoredAgent.id ? { ...prev, ...restoredAgent } : restoredAgent)
        }
      } catch (error) {
        if (!isAppSessionError(error)) {
          console.error(error)
          return
        }
        try { sessionStorage.removeItem(ACTIVE_AGENT_KEY) } catch { void 0 }
        setCurrentAgent(null)
        setSessionToken(null)
        setSelectedAgent(null)
        setScreen('login')
        showToast('Session expired. Sign in again.')
      }
    }, 5 * 60 * 1000)

    return () => clearInterval(intervalId)
  }, [sessionToken, showToast])

  function handleAgentSelect(agent) {
    setSelectedAgent(agent)
    setScreen('pin')
  }

  function handlePinSuccess({ agent, sessionToken: nextSessionToken }) {
    try {
      sessionStorage.setItem(ACTIVE_AGENT_KEY, JSON.stringify({
        agentId: agent.id,
        sessionToken: nextSessionToken,
      }))
    } catch(e) {}
    setCurrentAgent(agent)
    setSessionToken(nextSessionToken)
    setScreen(agent.is_admin ? 'manager' : 'home')
  }

  async function handleSignOut() {
    const activeSessionToken = sessionToken
    try { sessionStorage.removeItem(ACTIVE_AGENT_KEY) } catch(e) {}
    setCurrentAgent(null)
    setSessionToken(null)
    setSelectedAgent(null)
    setScreen('login')
    try {
      await signOutAgentSession(activeSessionToken)
    } catch (e) {
      console.error(e)
    }
    const result = await loadInitialData()
    if (result) setScreen('login')
  }

  if (screen === 'loading') return (
    <div className="loading-screen">
      <div className="loading-logo">
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <rect x="4" y="6" width="24" height="22" rx="3" stroke="white" strokeWidth="2"/>
          <path d="M10 6V3M22 6V3" stroke="white" strokeWidth="2" strokeLinecap="round"/>
          <path d="M4 13h24" stroke="white" strokeWidth="1.5"/>
          <path d="M11 20l3 3 7-7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      <div className="spinner" style={{ width: 24, height: 24, borderWidth: 3 }} />
      <span>Connecting to database…</span>
    </div>
  )

  if (screen === 'error') return (
    <div className="loading-screen">
      <span style={{ color: 'var(--danger)', fontSize: 15 }}>⚠ Could not connect to database.</span>
      {bootError && (
        <span style={{ color: 'var(--muted)', fontSize: 13, maxWidth: 420, textAlign: 'center', lineHeight: 1.5 }}>
          {bootError}
        </span>
      )}
      <button className="btn btn-primary" onClick={() => { setScreen('loading'); loadInitialData().then(r => r && setScreen('login')) }}>Retry</button>
    </div>
  )

  return (
    <>
      <PageTransition screen={screen}>
        {screen === 'login' && (
          <LoginScreen agents={agents} onSelect={handleAgentSelect} />
        )}
        {screen === 'pin' && (
          <PinScreen
            agent={selectedAgent}
            onSuccess={handlePinSuccess}
            onBack={() => setScreen('login')}
          />
        )}
        {screen === 'home' && currentAgent && (
          <StaffDashboard
            agent={currentAgent}
            handoff={handoff}
            onViewLogs={() => setScreen('logs')}
            onSignOut={handleSignOut}
            showToast={showToast}
            onHandoffUpdate={setHandoff}
          />
        )}
        {screen === 'logs' && currentAgent && (
          <ShiftLogBrowser
            agent={currentAgent}
            onBack={() => setScreen('home')}
          />
        )}
        {screen === 'manager' && currentAgent && (
          <Dashboard
            agent={currentAgent}
            agents={agents}
            sessionToken={sessionToken}
            onSignOut={handleSignOut}
            showToast={showToast}
            onAgentsChange={setAgents}
            handoff={handoff}
            onHandoffUpdate={setHandoff}
          />
        )}
      </PageTransition>
      {toast && <Toast message={toast} />}
    </>
  )
}
