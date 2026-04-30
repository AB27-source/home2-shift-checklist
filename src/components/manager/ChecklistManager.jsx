import { useState } from 'react'
import { addShiftTask, updateShiftTask, deleteShiftTask, moveShiftTask, toggleLockTask } from '../../lib/supabase'
import styles from './ChecklistManager.module.css'

const SHIFT_LABELS = {
  morning: 'Morning Shift',
  swing:   'Swing Shift',
  night:   'Night Audit',
}

const SHIFT_KEYS = ['morning', 'swing', 'night']

export default function ChecklistManager({ shiftTasks, onShiftTasksChange, showToast }) {
  const [activeShift, setActiveShift] = useState('morning')

  function updateTasks(shiftKey, newList) {
    onShiftTasksChange({ ...shiftTasks, [shiftKey]: newList })
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <div className={styles.title}>Checklist Items</div>
        <div className={styles.sub}>Changes take effect immediately for all staff on their next shift start</div>
      </div>

      <div className={styles.shiftTabs}>
        {SHIFT_KEYS.map(k => (
          <button
            key={k}
            className={`${styles.shiftTab} ${activeShift === k ? styles.shiftTabActive : ''}`}
            onClick={() => setActiveShift(k)}
          >
            {SHIFT_LABELS[k]}
            <span className={styles.taskCount}>{shiftTasks[k]?.length ?? 0}</span>
          </button>
        ))}
      </div>

      <ShiftTaskList
        shiftKey={activeShift}
        tasks={shiftTasks[activeShift] ?? []}
        onUpdate={list => updateTasks(activeShift, list)}
        showToast={showToast}
      />
    </div>
  )
}

function ShiftTaskList({ shiftKey, tasks, onUpdate, showToast }) {
  const [editingId, setEditingId]   = useState(null)
  const [adding, setAdding]         = useState(false)
  const [saving, setSaving]         = useState(false)

  async function handleAdd(name, time) {
    setSaving(true)
    try {
      const newTask = await addShiftTask(shiftKey, name, time)
      onUpdate([...tasks, newTask])
      setAdding(false)
      showToast('Task added')
    } catch {
      showToast('Failed to add task')
    } finally {
      setSaving(false)
    }
  }

  async function handleEdit(id, name, time) {
    setSaving(true)
    try {
      await updateShiftTask(id, { name, time })
      onUpdate(tasks.map(t => t.id === id ? { ...t, name, time } : t))
      setEditingId(null)
      showToast('Task updated')
    } catch {
      showToast('Failed to update task')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    const task = tasks.find(t => t.id === id)
    if (!confirm(`Remove "${task?.name}"?`)) return
    try {
      await deleteShiftTask(id)
      onUpdate(tasks.filter(t => t.id !== id))
      showToast('Task removed')
    } catch {
      showToast('Failed to remove task')
    }
  }

  async function handleMove(id, direction) {
    const idx = tasks.findIndex(t => t.id === id)
    const siblingIdx = direction === 'up' ? idx - 1 : idx + 1
    if (siblingIdx < 0 || siblingIdx >= tasks.length) return
    const sibling = tasks[siblingIdx]
    try {
      await moveShiftTask(id, sibling.id)
      const next = [...tasks]
      ;[next[idx], next[siblingIdx]] = [next[siblingIdx], next[idx]]
      onUpdate(next)
    } catch {
      showToast('Failed to reorder tasks')
    }
  }

  async function handleToggleLock(id, currentLocked) {
    const next = !currentLocked
    try {
      await toggleLockTask(id, next)
      onUpdate(tasks.map(t => t.id === id ? { ...t, locked: next } : t))
      showToast(next ? 'Task locked' : 'Task unlocked')
    } catch {
      showToast('Failed to update lock')
    }
  }

  return (
    <div className={styles.listWrap}>
      {tasks.length === 0 && !adding && (
        <div className={styles.empty}>No tasks yet — add one below</div>
      )}

      {tasks.map((task, idx) => (
        editingId === task.id ? (
          <TaskForm
            key={task.id}
            defaultName={task.name}
            defaultTime={task.time}
            saving={saving}
            onSave={(name, time) => handleEdit(task.id, name, time)}
            onCancel={() => setEditingId(null)}
          />
        ) : (
          <div key={task.id} className={`${styles.taskRow} ${task.locked ? styles.taskRowLocked : ''}`}>
            <div className={styles.taskNum}>{idx + 1}</div>
            <div className={styles.taskBody}>
              <span className={styles.taskName}>{task.name}</span>
              {task.time && <span className={styles.taskTime}>{task.time}</span>}
            </div>
            <div className={styles.taskActions}>
              <button
                className={`${styles.lockBtn} ${task.locked ? styles.lockBtnActive : ''}`}
                onClick={() => handleToggleLock(task.id, task.locked)}
                title={task.locked ? 'Unlock task' : 'Lock task'}
              >
                {task.locked ? '🔒' : '🔓'}
              </button>
              <button
                className={styles.iconBtn}
                onClick={() => handleMove(task.id, 'up')}
                disabled={idx === 0 || task.locked}
                title="Move up"
              >▲</button>
              <button
                className={styles.iconBtn}
                onClick={() => handleMove(task.id, 'down')}
                disabled={idx === tasks.length - 1 || task.locked}
                title="Move down"
              >▼</button>
              <button
                className="btn-sm"
                onClick={() => setEditingId(task.id)}
                disabled={task.locked}
                title={task.locked ? 'Unlock to edit' : undefined}
              >Edit</button>
              <button
                className="btn-sm danger"
                onClick={() => handleDelete(task.id)}
                disabled={task.locked}
                title={task.locked ? 'Unlock to remove' : undefined}
              >Remove</button>
            </div>
          </div>
        )
      ))}

      {adding ? (
        <TaskForm
          saving={saving}
          onSave={handleAdd}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <button className={styles.addBtn} onClick={() => setAdding(true)}>
          + Add task
        </button>
      )}
    </div>
  )
}

function TaskForm({ defaultName = '', defaultTime = '', saving, onSave, onCancel }) {
  const [name, setName] = useState(defaultName)
  const [time, setTime] = useState(defaultTime)
  const [error, setError] = useState('')

  function handleSave() {
    if (!name.trim()) { setError('Task name is required'); return }
    onSave(name.trim(), time.trim())
  }

  return (
    <div className={styles.taskForm}>
      <div className={styles.taskFormFields}>
        <input
          className={styles.nameInput}
          type="text"
          placeholder="Task description"
          value={name}
          onChange={e => setName(e.target.value)}
          autoFocus
        />
        <input
          className={styles.timeInput}
          type="text"
          placeholder="Time (e.g. 15 mins)"
          value={time}
          onChange={e => setTime(e.target.value)}
        />
      </div>
      {error && <div className={styles.formError}>{error}</div>}
      <div className={styles.taskFormActions}>
        <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}
