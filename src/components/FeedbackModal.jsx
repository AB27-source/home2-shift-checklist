import { useState } from 'react'
import { createPortal } from 'react-dom'
import { saveFeedback, uploadAttachment, deleteAttachment } from '../lib/supabase'
import { postShiftLogToTeams } from '../lib/teamsClient'
import styles from './FeedbackModal.module.css'

const ACCEPTED = '.pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.webp,.txt,.csv'
const FILE_ICONS = {
  pdf: '📄', doc: '📝', docx: '📝', xls: '📊', xlsx: '📊',
  png: '🖼️', jpg: '🖼️', jpeg: '🖼️', gif: '🖼️', webp: '🖼️',
  txt: '📃', csv: '📃',
}
function getExt(name) { return (name?.split('.').pop() || '').toLowerCase() }
function getIcon(name) { return FILE_ICONS[getExt(name)] || '📎' }
function fmtSize(b) {
  if (!b) return ''
  if (b < 1024) return b + ' B'
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB'
  return (b / 1048576).toFixed(1) + ' MB'
}

export default function FeedbackModal({ agent, onClose }) {
  const [message,     setMessage]     = useState('')
  const [attachments, setAttachments] = useState([])
  const [uploading,   setUploading]   = useState(0)
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState('')
  const [done,        setDone]        = useState(false)

  const today = new Date().toISOString().split('T')[0]

  async function handleFiles(fileList) {
    const files = Array.from(fileList)
    if (!files.length) return
    setUploading(n => n + files.length)
    const added = []
    for (const file of files) {
      try {
        const url = await uploadAttachment(file, agent.id, `feedback/${today}`)
        added.push({ name: file.name, url, size: file.size })
      } catch {
        // skip failed uploads silently — user can retry
      } finally {
        setUploading(n => n - 1)
      }
    }
    if (added.length) setAttachments(prev => [...prev, ...added])
  }

  async function handleRemove(idx) {
    const file = attachments[idx]
    try { await deleteAttachment(file.url) } catch { /* best-effort */ }
    setAttachments(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleSubmit() {
    if (!message.trim()) { setError('Please enter a message.'); return }
    setSaving(true)
    setError('')
    try {
      await saveFeedback({
        agentId:   agent.id,
        agentName: agent.name,
        agentRole: agent.role,
        message:   message.trim(),
        attachments,
      })

      const attachLine = attachments.length
        ? `\n\n**Attachments (${attachments.length}):**\n` + attachments.map(a => `- [${a.name}](${a.url})`).join('\n')
        : ''

      const teamsMsg = [
        `## 💬 App Feedback`,
        `**From:** ${agent.name} · **Role:** ${agent.role}`,
        ``,
        message.trim(),
        attachLine,
      ].join('\n')

      postShiftLogToTeams(teamsMsg, 'manager').catch(() => {})
      setDone(true)
    } catch {
      setError('Failed to submit. Please try again.')
      setSaving(false)
    }
  }

  if (done) return createPortal(
    <div className={styles.overlay}>
      <div className={`modal ${styles.modal}`}>
        <div className={styles.doneIcon}>✅</div>
        <div className="modal-title" style={{ textAlign: 'center' }}>Feedback sent!</div>
        <div className="modal-sub" style={{ textAlign: 'center' }}>
          Thanks, {agent.name}. Your suggestion has been sent to management.
        </div>
        <div className="modal-actions">
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>,
    document.body
  )

  return createPortal(
    <div className={styles.overlay}>
      <div className={`modal ${styles.modal}`}>
        <div className="modal-title">💬 Share Feedback</div>
        <div className="modal-sub">Suggestions, issues, or ideas — your input goes straight to management.</div>

        <div className={styles.fromRow}>
          <span className={styles.fromLabel}>From</span>
          <span className={styles.fromName}>{agent.name}</span>
          <span className={styles.fromRole}>{agent.role}</span>
        </div>

        <div className="field" style={{ marginTop: 12 }}>
          <label>Your message</label>
          <textarea
            rows={4}
            placeholder="What's on your mind?"
            value={message}
            onChange={e => setMessage(e.target.value)}
            style={{ resize: 'vertical' }}
          />
        </div>

        {/* Attachments */}
        <div className={styles.attachSection}>
          <div className={styles.attachHeader}>
            <span className={styles.attachLabel}>Attachments</span>
            <label className={styles.attachAddBtn}>
              + Add Files
              <input
                type="file" multiple accept={ACCEPTED} style={{ display: 'none' }}
                onChange={e => { handleFiles(e.target.files); e.target.value = '' }}
              />
            </label>
          </div>

          {attachments.length > 0 && (
            <div className={styles.fileList}>
              {attachments.map((f, i) => (
                <div key={i} className={styles.fileChip}>
                  <span>{getIcon(f.name)}</span>
                  <span className={styles.fileName}>
                    <a href={f.url} target="_blank" rel="noreferrer">{f.name}</a>
                  </span>
                  <span className={styles.fileSize}>{fmtSize(f.size)}</span>
                  <button type="button" className={styles.fileRemove} onClick={() => handleRemove(i)}>✕</button>
                </div>
              ))}
            </div>
          )}

          {uploading > 0 && (
            <div className={styles.uploadingRow}>
              <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
              Uploading {uploading} file{uploading !== 1 ? 's' : ''}…
            </div>
          )}

          {attachments.length === 0 && uploading === 0 && (
            <div className={styles.attachEmpty}>
              PDF · Word · Excel · Images — drag &amp; drop or click Add Files
            </div>
          )}
        </div>

        <div className="modal-error">{error}</div>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving || uploading > 0}>
            {saving ? 'Sending…' : 'Send Feedback'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
