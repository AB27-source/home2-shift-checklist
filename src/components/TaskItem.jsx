import { useState } from 'react'
import styles from './TaskItem.module.css'

export default function TaskItem({ task, state = {}, onChange }) {
  const [noteOpen, setNoteOpen] = useState(state.noteOpen || false)

  function toggleDone() {
    onChange(task.id, {
      ...state,
      done: !state.done,
      timestamp: !state.done ? fmtTime(new Date()) : null,
    })
  }

  function handleNote(e) {
    onChange(task.id, { ...state, note: e.target.value })
  }

  return (
    <div className={`${styles.item} ${state.done ? styles.done : ''}`}>
      <div className={styles.row}>
        <button className={styles.check} onClick={toggleDone} aria-label="Toggle complete">
          {state.done && (
            <svg className="check-icon" width="11" height="11" viewBox="0 0 12 12" fill="none">
              <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </button>

        <div className={styles.info}>
          <div className={styles.name}>{task.name}</div>
          <div className={styles.meta}>
            <span>{task.time}</span>
            {state.timestamp && (
              <span className={styles.ts}>
                <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
                  <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M6 3.5V6l1.5 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                {state.timestamp}
              </span>
            )}
          </div>
        </div>

        <button
          className={`${styles.noteBtn} ${state.note ? styles.hasNote : ''}`}
          onClick={() => setNoteOpen(o => !o)}
        >
          {state.note ? '📝 note' : '+ note'}
        </button>
      </div>

      {noteOpen && (
        <div className={styles.noteArea}>
          <textarea
            placeholder="Add a note for this task…"
            defaultValue={state.note || ''}
            onChange={handleNote}
          />
        </div>
      )}
    </div>
  )
}

function fmtTime(date) {
  let h = date.getHours(), m = date.getMinutes()
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${h}:${String(m).padStart(2, '0')} ${ampm}`
}
