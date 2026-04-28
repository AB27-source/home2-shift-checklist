import { useState, useRef } from 'react'
import { uploadAttachment, deleteAttachment } from '../lib/supabase'
import styles from './FileAttachments.module.css'

// Accepted MIME-safe extensions — no executables
const ACCEPTED = [
  '.pdf',
  '.doc', '.docx',
  '.xls', '.xlsx',
  '.ppt', '.pptx',
  '.png', '.jpg', '.jpeg', '.gif', '.webp',
  '.txt', '.csv',
].join(',')

const FILE_ICONS = {
  pdf:  '📄',
  doc:  '📝', docx: '📝',
  xls:  '📊', xlsx: '📊',
  ppt:  '📑', pptx: '📑',
  png:  '🖼️', jpg:  '🖼️', jpeg: '🖼️', gif: '🖼️', webp: '🖼️',
  txt:  '📃', csv:  '📃',
}

function getExt(name)  { return (name?.split('.').pop() || '').toLowerCase() }
function getIcon(name) { return FILE_ICONS[getExt(name)] || '📎' }
function fmtSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024)         return bytes + ' B'
  if (bytes < 1024 * 1024)  return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

export default function FileAttachments({ attachments = [], onChange, agentId, date }) {
  const [uploading, setUploading] = useState(0)
  const [over,      setOver]      = useState(false)
  const [errors,    setErrors]    = useState([])
  const inputRef = useRef()

  async function processFiles(fileList) {
    const files = Array.from(fileList)
    if (!files.length) return

    setUploading(n => n + files.length)
    const added  = []
    const failed = []

    for (const file of files) {
      try {
        const url = await uploadAttachment(file, agentId, date)
        added.push({ name: file.name, url, size: file.size, type: getExt(file.name) })
      } catch (err) {
        const msg = (err.message || '').toLowerCase()
        const friendly = msg.includes('bucket')
          ? 'Storage not set up — admin needs to create the "shift-attachments" bucket in Supabase Storage.'
          : (err.message || 'Upload failed')
        failed.push(`${file.name}: ${friendly}`)
      } finally {
        setUploading(n => n - 1)
      }
    }

    if (added.length)  onChange([...attachments, ...added])
    if (failed.length) setErrors(prev => [...prev, ...failed])
  }

  async function handleRemove(idx) {
    const file = attachments[idx]
    try { await deleteAttachment(file.url) } catch { /* best-effort */ }
    onChange(attachments.filter((_, i) => i !== idx))
  }

  function onDragOver(e)  { e.preventDefault(); setOver(true) }
  function onDragLeave(e) { if (!e.currentTarget.contains(e.relatedTarget)) setOver(false) }
  function onDrop(e) {
    e.preventDefault(); setOver(false)
    processFiles(e.dataTransfer.files)
  }

  return (
    <div className={styles.wrap}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.title}>
          {/* paperclip icon */}
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M11.2 5.8L6 11a3.4 3.4 0 01-4.8-4.8L6.8 1a2.27 2.27 0 013.2 3.2L4.4 9.8a1.13 1.13 0 01-1.6-1.6L8 3"
              stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Attachments
          {attachments.length > 0 && (
            <span className={styles.titleCount}>
              ({attachments.length} file{attachments.length !== 1 ? 's' : ''})
            </span>
          )}
        </div>
        <button type="button" className={styles.addBtn} onClick={() => inputRef.current?.click()}>
          + Add Files
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED}
          style={{ display: 'none' }}
          onChange={e => { processFiles(e.target.files); e.target.value = '' }}
        />
      </div>

      {/* Drop zone body */}
      <div
        className={`${styles.body}${over ? ' ' + styles.over : ''}`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {/* File list */}
        {attachments.length > 0 && (
          <div className={styles.list}>
            {attachments.map((f, i) => (
              <div key={i} className={styles.chip}>
                <span className={styles.chipIcon}>{getIcon(f.name)}</span>
                <span className={styles.chipName}>
                  <a href={f.url} target="_blank" rel="noreferrer">{f.name}</a>
                </span>
                <span className={styles.chipSize}>{fmtSize(f.size)}</span>
                <button
                  type="button"
                  className={styles.chipRemove}
                  onClick={() => handleRemove(i)}
                  title="Remove"
                >✕</button>
              </div>
            ))}
          </div>
        )}

        {/* Upload progress */}
        {uploading > 0 && (
          <div className={styles.uploading}>
            <div className="spinner" />
            Uploading {uploading} file{uploading !== 1 ? 's' : ''}…
          </div>
        )}

        {/* Errors */}
        {errors.length > 0 && (
          <div className={styles.errors}>
            {errors.map((e, i) => <div key={i} className={styles.errorRow}>⚠ {e}</div>)}
            <button className={styles.errorDismiss} onClick={() => setErrors([])}>Dismiss</button>
          </div>
        )}

        {/* Empty state */}
        {attachments.length === 0 && uploading === 0 && (
          <div className={styles.empty}>
            Drag &amp; drop files here, or click <em>Add Files</em><br />
            PDF · Word · Excel · PowerPoint · Images
          </div>
        )}
      </div>
    </div>
  )
}
