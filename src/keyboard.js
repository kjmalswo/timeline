export function isSaveShortcut(event) {
  return !event.altKey && !event.shiftKey && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's'
}
