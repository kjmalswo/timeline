import { useLayoutEffect, useRef, useState } from 'react'
import { EditorContent } from '@tiptap/react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export const pixelsPerMillimeter = 96 / 25.4
const seam = 4
const minimumScale = 0.58

export function revealVerticalCaret(editor, caret = editor.view.coordsAtPos(editor.state.selection.head)) {
  const stage = editor.view.dom.closest('.paper-stage')
  if (!stage) return
  const bounds = stage.getBoundingClientRect()
  const inset = 14
  if (caret.top < bounds.top + inset) stage.scrollTop += caret.top - bounds.top - inset
  else if (caret.bottom > bounds.bottom - inset) stage.scrollTop += caret.bottom - bounds.bottom + inset
}

export function WritingSpread({ editor, paper, layout, style, zoom = 1, children }) {
  const frame = useRef(null)
  const opening = useRef(null)
  const viewport = useRef(null)
  const measuredCount = useRef(1)
  const pendingScroll = useRef(null)
  const [dimensions, setDimensions] = useState({ width: 0, heading: 0 })
  const [spreadCount, setSpreadCount] = useState(1)
  const [spread, setSpread] = useState(0)

  const { left, right, top, bottom } = layout.margins
  const pageWidth = paper.width * pixelsPerMillimeter
  const columnWidth = (paper.width - left - right) * pixelsPerMillimeter
  const pitch = pageWidth + seam
  const spreadWidth = pageWidth * 2 + seam
  const fitted = dimensions.width ? Math.max(minimumScale, Math.min(1, dimensions.width / spreadWidth)) : 1
  const scale = fitted * zoom
  const step = pitch * 2 * scale
  const windowWidth = spreadWidth * scale

  function updatePageLabel() {
    const view = viewport.current
    const middle = view.scrollLeft + view.clientWidth / 2
    setSpread(Math.max(0, Math.min(measuredCount.current - 1, Math.floor(middle / step))))
  }

  useLayoutEffect(() => {
    function resize() {
      const width = frame.current.clientWidth
      const heading = opening.current.offsetHeight
      setDimensions(previous => previous.width === width && previous.heading === heading ? previous : { width, heading })
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(frame.current)
    observer.observe(opening.current)
    return () => observer.disconnect()
  }, [])

  useLayoutEffect(() => {
    const view = viewport.current
    if (pendingScroll.current !== null) {
      view.scrollLeft = pendingScroll.current
      pendingScroll.current = null
    }
    updatePageLabel()
  }, [spreadCount, step])

  useLayoutEffect(() => {
    if (!editor || editor.isDestroyed) return
    let animation = 0
    let revealCursor = false

    function measure() {
      animation = 0
      const reveal = revealCursor
      revealCursor = false
      if (editor.isDestroyed) return
      const view = viewport.current
      const body = editor.view.dom
      if (!view.contains(body)) return

      // A fixed-height column layout adds overflow columns to the right as the chapter grows.
      const columns = Math.max(2, Math.ceil((body.scrollWidth - columnWidth - 1) / pitch) + 1)
      const nextCount = Math.ceil(columns / 2)
      const countChanged = nextCount !== measuredCount.current
      if (countChanged) {
        measuredCount.current = nextCount
        setSpreadCount(nextCount)
      }

      if (reveal) {
        const caret = editor.view.coordsAtPos(editor.state.selection.head)
        revealVerticalCaret(editor, caret)
        const bodyLeft = body.getBoundingClientRect().left
        const page = Math.max(0, Math.min(columns - 1, Math.floor((caret.left - bodyLeft + 1) / (pitch * scale))))
        const targetSpread = Math.floor(page / 2)
        const start = targetSpread * step
        const clipped = view.clientWidth + 2 < windowWidth
        const viewLeft = view.getBoundingClientRect().left
        const caretX = caret.left - viewLeft + view.scrollLeft
        const outside = caret.left < viewLeft || caret.right > viewLeft + view.clientWidth
        const differentSpread = Math.floor((view.scrollLeft + view.clientWidth / 2) / step) !== targetSpread

        if (differentSpread || outside) {
          const left = clipped
            ? Math.max(start, Math.min(start + windowWidth - view.clientWidth, caretX - view.clientWidth * 0.4))
            : start
          if (countChanged) pendingScroll.current = left
          else view.scrollLeft = left
        }
      }
      if (!countChanged) updatePageLabel()
    }

    function schedule(reveal = false) {
      revealCursor ||= reveal
      if (!animation) animation = requestAnimationFrame(measure)
    }

    const onTransaction = ({ transaction }) => {
      if (transaction.docChanged || transaction.selectionSet) schedule(true)
    }
    const onFontLoad = () => schedule(true)
    const onPhotoLoad = () => schedule()
    const view = viewport.current
    editor.on('transaction', onTransaction)
    document.fonts.addEventListener('loadingdone', onFontLoad)
    view.addEventListener('load', onPhotoLoad, true)
    schedule(true)
    return () => {
      cancelAnimationFrame(animation)
      editor.off('transaction', onTransaction)
      document.fonts.removeEventListener('loadingdone', onFontLoad)
      view.removeEventListener('load', onPhotoLoad, true)
    }
  }, [editor, pitch, columnWidth, scale, step, windowWidth, paper.height, top, bottom,
    layout.font, layout.fontSize, layout.lineHeight, layout.firstLine, dimensions.heading])

  function turn(amount) {
    const next = Math.max(0, Math.min(spreadCount - 1, spread + amount))
    viewport.current.scrollLeft = next * step
    frame.current.parentElement.scrollTop = 0
    setSpread(next)
  }

  const pageNumber = spread * 2 + 1
  return (
    <section className="writing-spread" ref={frame} style={{
      ...style,
      '--spread-gap': seam + 'px',
      '--spread-scale': scale,
      '--spread-window-width': windowWidth + 'px',
      '--spread-heading-space': dimensions.heading + 'px',
    }} aria-label="양면 원고">
      <nav className="spread-turns" aria-label="펼침면 이동">
        <button type="button" className="icon-button" aria-label="이전 펼침면" disabled={spread === 0} onClick={() => turn(-1)}>
          <ChevronLeft size={18} />
        </button>
        <span aria-live="polite">{pageNumber}–{pageNumber + 1}쪽</span>
        <button type="button" className="icon-button" aria-label="다음 펼침면" disabled={spread === spreadCount - 1} onClick={() => turn(1)}>
          <ChevronRight size={18} />
        </button>
      </nav>
      <div ref={viewport} className="spread-window" onScroll={updatePageLabel}>
        <div className="spread-strip">
          <div className="spread-pages" aria-hidden="true">
            {Array.from({ length: spreadCount * 2 }, (_, index) => (
              <div key={index} className="spread-sheet"><span>{index + 1}</span></div>
            ))}
          </div>
          <article className="spread-manuscript">
            <div className="spread-opening" ref={opening}>{children}</div>
            <EditorContent className="paper-body spread-body" editor={editor} />
          </article>
        </div>
      </div>
    </section>
  )
}
