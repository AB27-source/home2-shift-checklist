import { useState } from 'react'
import { addAgent, updateAgent, resetAgentPin, deactivateAgent, isAppSessionError } from '../../lib/supabase'
import { AGENT_COLORS } from '../../data/shifts'
import styles from './AgentManager.module.css'

function initials(name) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

// Roles available for staff (no admin-level roles)
const STAFF_ROLES = [
  'Front Desk',
  'Front Desk Supervisor',
  'Night Auditor',
  'Front Desk/Night Auditor',
]
// Roles available for admin accounts
const ADMIN_ROLE_OPTIONS = [
  'Manager',
  'General Manager',
  'Front Desk Supervisor',
  'Night Auditor',
  'Front Desk/Night Auditor',
]

function getSaveErrorMessage(error, fallback = 'Failed to save. Try again.') {
  if (isAppSessionError(error)) {
    return 'Your manager session expired. Sign out and sign back in, then try again.'
  }
  return error?.message || fallback
}

export default function AgentManager({ agents, sessionToken, onAgentsChange, showToast }) {
  const [modal, setModal] = useState(null)

  const admins = agents.filter(a => a.is_admin)
  const staff  = agents.filter(a => !a.is_admin)

  async function handleAdd(fields) {
    const color = AGENT_COLORS[agents.length % AGENT_COLORS.length]
    const isAdmin = fields.is_admin || false
    const newAgent = await addAgent(sessionToken, {
      name: fields.name,
      role: fields.role === '__custom__' ? fields.custom_role : fields.role,
      pin: fields.pin,
      color,
      is_admin: isAdmin,
    })
    onAgentsChange([...agents, newAgent])
    setModal(null)
    showToast(`${fields.name} added`)
  }

  async function handleEdit(id, fields) {
    const updates = {
      name: fields.name,
      role: fields.role === '__custom__' ? fields.custom_role : fields.role,
      is_admin: fields.is_admin || false,
    }
    await updateAgent(sessionToken, id, updates)
    onAgentsChange(agents.map(a => a.id === id ? { ...a, ...updates } : a))
    setModal(null)
    showToast('Profile updated')
  }

  async function handleResetPin(id, pin) {
    await resetAgentPin(sessionToken, id, pin)
    setModal(null)
    showToast('PIN updated')
  }

  async function handleRemove(agent) {
    if (!confirm(`Remove ${agent.name}? Their shift history will be kept.`)) return
    try {
      await deactivateAgent(sessionToken, agent.id)
      onAgentsChange(agents.filter(a => a.id !== agent.id))
      showToast(`${agent.name} removed`)
    } catch (error) {
      showToast(getSaveErrorMessage(error, 'Failed to remove agent.'))
    }
  }

  function AgentCard({ agent }) {
    const isAdmin = agent.is_admin
    return (
      <div className={`${styles.card} ${isAdmin ? styles.adminCard : ''}`}>
        <div className={styles.cardTop}>
          <div className={styles.avatar} style={{ background: agent.color }}>
            {initials(agent.name)}
          </div>
          <div className={styles.info}>
            <div className={styles.nameRow}>
              <span className={styles.name}>{agent.name}</span>
              {isAdmin && <span className={styles.adminBadge}>Admin</span>}
            </div>
            <div className={styles.role}>{agent.role}</div>
          </div>
        </div>
        <div className={styles.actions}>
          <button className="btn-sm" onClick={() => setModal({ type: 'edit', agent })}>Edit</button>
          <button className="btn-sm" onClick={() => setModal({ type: 'pin', agent })}>Reset PIN</button>
          <button className="btn-sm danger" onClick={() => handleRemove(agent)}>Remove</button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.wrap}>
      {/* Admin section */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionTitle}>⭐ Admins & Managers</div>
          <div className={styles.sectionSub}>Admin accounts appear on the login screen and have full dashboard access</div>
        </div>
        <div className={styles.grid}>
          {admins.map(a => <AgentCard key={a.id} agent={a} />)}
          <button className={`${styles.addBtn} ${styles.addAdminBtn}`} onClick={() => setModal({ type: 'add', isAdmin: true })}>
            + Add admin account
          </button>
        </div>
      </div>

      {/* Staff section */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionTitle}>👤 Front Desk Staff</div>
          <div className={styles.sectionSub}>Staff accounts use a PIN to access their shift checklist</div>
        </div>
        <div className={styles.grid}>
          {staff.map(a => <AgentCard key={a.id} agent={a} />)}
          <button className={styles.addBtn} onClick={() => setModal({ type: 'add', isAdmin: false })}>
            + Add staff member
          </button>
        </div>
      </div>

      <div className={styles.sharedPinNotice}>
        <div className={styles.sharedPinTitle}>🔐 Admin Sign-In</div>
        <div className={styles.sharedPinText}>
          Manager access now uses each admin's own profile and PIN. Keep at least one active admin account available so the dashboard remains accessible.
        </div>
      </div>

      {/* Modals */}
      {modal?.type === 'add' && (
        <AgentFormModal
          title={modal.isAdmin ? 'Add admin account' : 'Add staff member'}
          sub={modal.isAdmin ? 'This person will appear on the login screen and have full dashboard access.' : 'This person will appear on the login screen and can complete shift checklists.'}
          defaultIsAdmin={modal.isAdmin}
          lockAdmin={true}
          onSave={handleAdd}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'edit' && (
        <AgentFormModal
          title={`Edit — ${modal.agent.name}`}
          defaultName={modal.agent.name}
          defaultRole={modal.agent.role}
          defaultIsAdmin={modal.agent.is_admin}
          lockAdmin={true}
          hidePin
          onSave={(fields) => handleEdit(modal.agent.id, fields)}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'pin' && (
        <PinModal
          agent={modal.agent}
          onSave={(pin) => handleResetPin(modal.agent.id, pin)}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}

function AgentFormModal({ title, sub, defaultName = '', defaultRole = '', defaultIsAdmin = false, hidePin = false, onSave, onClose }) {
  // Admin status is fixed by the modal that opened this form.
  const roleList = defaultIsAdmin ? ADMIN_ROLE_OPTIONS : STAFF_ROLES

  const [name, setName]             = useState(defaultName)
  const [role, setRole]             = useState(() => {
    // If saved role matches the available list, use it; otherwise default to first
    const allOptions = [...STAFF_ROLES, ...ADMIN_ROLE_OPTIONS, '__custom__']
    const inList = roleList.includes(defaultRole)
    return inList ? defaultRole : (defaultRole && !allOptions.includes(defaultRole) ? '__custom__' : roleList[0])
  })
  const [customRole, setCustomRole] = useState(() => {
    const allStandard = [...STAFF_ROLES, ...ADMIN_ROLE_OPTIONS]
    return !allStandard.includes(defaultRole) && defaultRole ? defaultRole : ''
  })
  const [pin, setPin]               = useState('')
  const [error, setError]           = useState('')
  const [saving, setSaving]         = useState(false)

  async function handleSave() {
    if (!name.trim()) { setError('Name is required.'); return }
    if (role === '__custom__' && !customRole.trim()) { setError('Please enter a custom role.'); return }
    if (!hidePin && !/^\d{4}$/.test(pin)) { setError('PIN must be exactly 4 digits.'); return }
    setSaving(true)
    try {
      await onSave({
        name: name.trim(),
        role,
        custom_role: customRole.trim(),
        pin,
        is_admin: defaultIsAdmin, // always use the fixed value — no toggle
      })
    } catch(error) {
      setError(getSaveErrorMessage(error))
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className={`modal ${styles.wideModal}`}>
        <div className="modal-title">{title}</div>
        {sub && <div className="modal-sub">{sub}</div>}

        <div className="field">
          <label>Full name</label>
          <input type="text" placeholder="e.g. Alex Rivera" value={name} onChange={e => setName(e.target.value)} />
        </div>

        <div className="field">
          <label>Role</label>
          <select value={role} onChange={e => setRole(e.target.value)}>
            {roleList.map(r => <option key={r} value={r}>{r}</option>)}
            <option value="__custom__">Custom role…</option>
          </select>
        </div>

        {role === '__custom__' && (
          <div className="field">
            <label>Custom role title</label>
            <input type="text" placeholder="Enter role title" value={customRole} onChange={e => setCustomRole(e.target.value)} />
          </div>
        )}

        {!hidePin && (
          <div className="field">
            <label>4-digit PIN</label>
            <input type="password" maxLength={4} placeholder="e.g. 1234" value={pin} onChange={e => setPin(e.target.value)} />
          </div>
        )}

        {/* Admin badge shown as info only — no toggle */}
        {defaultIsAdmin && (
          <div className={styles.adminInfo}>
            ⭐ This account has admin access and will appear in the Managers section on the login screen.
          </div>
        )}

        <div className="modal-error">{error}</div>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

function PinModal({ agent, onSave, onClose }) {
  const [pin, setPin]     = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!/^\d{4}$/.test(pin)) { setError('PIN must be exactly 4 digits.'); return }
    setSaving(true)
    try { await onSave(pin) }
    catch(error) {
      setError(getSaveErrorMessage(error, 'Failed to save.'))
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-title">Reset PIN — {agent.name}</div>
        <div className="modal-sub">Set a new 4-digit PIN for this person.</div>
        <div className="field">
          <label>New PIN</label>
          <input type="password" maxLength={4} placeholder="4 digits" value={pin} onChange={e => setPin(e.target.value)} />
        </div>
        <div className="modal-error">{error}</div>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save PIN'}</button>
        </div>
      </div>
    </div>
  )
}
