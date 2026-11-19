export function isSaveShortcut(event) {
  return !event.altKey && !event.shiftKey && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's'
}

export function historyShortcut(event) {
  if (event.altKey || event.isComposing || event.nativeEvent?.isComposing || !(event.ctrlKey || event.metaKey)) return null
  const key = event.key.toLowerCase()
  if (key === 'z' || event.code === 'KeyZ') return event.shiftKey ? 'redo' : 'undo'
  if (key === 'y' && !event.shiftKey) return 'redo'
  return null
}
