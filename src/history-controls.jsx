import { useRef, useState } from 'react'
import { Redo2, Undo2 } from 'lucide-react'
import { createHistory } from './history.js'
import { historyShortcut } from './keyboard.js'

const actions = [
  ['undo', Undo2, '실행 취소', 'Ctrl+Z / ⌘Z', 'Control+Z Meta+Z'],
  ['redo', Redo2, '다시 실행', 'Ctrl+Shift+Z / ⌘⇧Z', 'Control+Shift+Z Meta+Shift+Z'],
]

export function HistoryButtons({ canUndo, canRedo, onStep }) {
  return <div className="history-buttons" role="group" aria-label="편집 기록">
    {actions.map(([direction, Icon, label, keys, shortcuts]) => <button key={direction} type="button" className="icon-button"
      aria-label={label} title={label + ' (' + keys + ')'} aria-keyshortcuts={shortcuts}
      disabled={direction === 'undo' ? !canUndo : !canRedo}
      onMouseDown={event => event.preventDefault()} onClick={() => onStep(direction)}><Icon size={18} /></button>)}
  </div>
}

export function useDraftHistory(initialValue) {
  const [value, setValue] = useState(initialValue)
  const [history] = useState(createHistory)
  const current = useRef(value)

  function preview(next) {
    current.current = next
    setValue(next)
  }

  function change(updater, { before = current.current, group } = {}) {
    const after = updater(current.current)
    if (before === after) return
    history.record({ before, after, group })
    preview(after === current.current ? { ...after } : after)
  }

  function step(direction) {
    const entry = history.step(direction)
    if (entry) preview(entry.value)
  }

  return { value, read: () => current.current, change, preview, step, canUndo: history.canUndo, canRedo: history.canRedo }
}

export function handleDraftHistory(event, step) {
  const direction = historyShortcut(event)
  if (!direction) return
  event.preventDefault()
  step(direction)
}
