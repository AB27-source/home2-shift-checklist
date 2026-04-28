import styles from './LoginScreen.module.css'

function initials(name) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

export default function LoginScreen({ agents, onSelect }) {
  const adminAgents = agents.filter(a => a.is_admin)
  const staffAgents = agents.filter(a => !a.is_admin)

  return (
    <div className={styles.wrap}>
      <div className={styles.logo}>
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <rect x="4" y="6" width="24" height="22" rx="3" stroke="white" strokeWidth="2"/>
          <path d="M10 6V3M22 6V3" stroke="white" strokeWidth="2" strokeLinecap="round"/>
          <path d="M4 13h24" stroke="white" strokeWidth="1.5"/>
          <path d="M11 20l3 3 7-7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      <h1 className={styles.title}>Shift Checklist</h1>
      <p className={styles.sub}>Home2 Suites Las Vegas North — Select your profile</p>

      {/* Admin / Manager section */}
      {(adminAgents.length > 0) && (
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Managers & Admins</div>
          <div className={`${styles.grid} stagger-list`}>
            {adminAgents.map(agent => (
              <AgentCard key={agent.id} agent={agent} onSelect={onSelect} isAdmin />
            ))}
          </div>
        </div>
      )}

      {/* Staff section */}
      <div className={styles.section}>
        {adminAgents.length > 0 && <div className={styles.sectionLabel}>Front Desk Staff</div>}
        <div className={`${styles.grid} stagger-list`}>
          {staffAgents.map(agent => (
            <AgentCard key={agent.id} agent={agent} onSelect={onSelect} />
          ))}
        </div>
      </div>
    </div>
  )
}

function AgentCard({ agent, onSelect, isAdmin }) {
  return (
    <button
      className={`${styles.card} stagger-enter ${isAdmin ? styles.adminCard : ''}`}
      onClick={() => onSelect(agent)}
    >
      <div className={styles.avatar} style={{ background: agent.color }}>
        {isAdmin ? '⭐' : initials(agent.name)}
      </div>
      <div className={styles.name}>{agent.name}</div>
      <div className={styles.role}>{agent.role}</div>
      {isAdmin && <div className={styles.adminTag}>Admin</div>}
    </button>
  )
}
