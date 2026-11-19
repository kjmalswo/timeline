const paperViewKey = 'yeobaek.paper-view'
const zoomKey = 'yeobaek.paper-zoom'
const spellingKey = 'yeobaek.spellcheck'
export const minZoom = 50
export const maxZoom = 200

export function readWritingView() {
  try {
    const zoom = Number(localStorage.getItem(zoomKey))
    return { showSpread: localStorage.getItem(paperViewKey) !== 'single',
      zoom: Number.isInteger(zoom) && zoom >= minZoom && zoom <= maxZoom ? zoom : 100,
      spellcheck: localStorage.getItem(spellingKey) === 'on' }
  } catch {
    return { showSpread: true, zoom: 100, spellcheck: false }
  }
}

export function saveWritingView(fields) {
  try {
    if ('showSpread' in fields) localStorage.setItem(paperViewKey, fields.showSpread ? 'spread' : 'single')
    if ('zoom' in fields) localStorage.setItem(zoomKey, String(fields.zoom))
    if ('spellcheck' in fields) localStorage.setItem(spellingKey, fields.spellcheck ? 'on' : 'off')
  } catch {}
}
