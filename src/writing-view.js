const paperViewKey = 'yeobaek.paper-view'
const zoomKey = 'yeobaek.paper-zoom'
export const minZoom = 50
export const maxZoom = 200

export function readWritingView() {
  try {
    const zoom = Number(localStorage.getItem(zoomKey))
    return { showSpread: localStorage.getItem(paperViewKey) !== 'single',
      zoom: Number.isInteger(zoom) && zoom >= minZoom && zoom <= maxZoom ? zoom : 100 }
  } catch {
    return { showSpread: true, zoom: 100 }
  }
}

export function saveWritingView(fields) {
  try {
    if ('showSpread' in fields) localStorage.setItem(paperViewKey, fields.showSpread ? 'spread' : 'single')
    if ('zoom' in fields) localStorage.setItem(zoomKey, String(fields.zoom))
  } catch {}
}
