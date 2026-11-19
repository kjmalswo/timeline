import { useLayoutEffect, useRef, useState } from 'react'
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

export function WritingSpread({ editor, paper, layout, style, activeId, chapterOrder, restoreCursor, zoom = 1, children }) {
  const frame = useRef(null)
  const flow = useRef(null)
  const viewport = useRef(null)
  const measuredCount = useRef(1)
  const pendingScroll = useRef(null)
  const following = useRef(true)
  const [width, setWidth] = useState(0)
  const [spreadCount, setSpreadCount] = useState(1)
  const [spread, setSpread] = useState(0)

  const { left, right, top, bottom } = layout.margins
  const pageWidth = paper.width * pixelsPerMillimeter
  const columnWidth = (paper.width - left - right) * pixelsPerMillimeter
  const pitch = pageWidth + seam
  const spreadWidth = pageWidth * 2 + seam
  const fitted = width ? Math.max(minimumScale, Math.min(1, width / spreadWidth)) : 1
  const scale = fitted * zoom
  const step = pitch * 2 * scale
  const windowWidth = spreadWidth * scale

  function updatePageLabel() {
    const view = viewport.current
    const middle = view.scrollLeft + view.clientWidth / 2
    setSpread(Math.max(0, Math.min(measuredCount.current - 1, Math.floor(middle / step))))
  }

  useLayoutEffect(() => {
    const resize = () => setWidth(frame.current.clientWidth)
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(frame.current)
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

  useLayoutEffect(() => { following.current = true }, [activeId])

  useLayoutEffect(() => {
    if (!editor || editor.isDestroyed) return
    let animation = 0
    let reveal = null

    function measure() {
      animation = 0
      const target = reveal
      reveal = null
      if (editor.isDestroyed) return
      const view = viewport.current
      const manuscript = flow.current
      if (!manuscript.contains(editor.view.dom)) return

      const columns = Math.max(2, Math.ceil((manuscript.scrollWidth - columnWidth - 1) / pitch) + 1)
      const nextCount = Math.ceil(columns / 2)
      const countChanged = nextCount !== measuredCount.current
      if (countChanged) {
        measuredCount.current = nextCount
        setSpreadCount(nextCount)
      }

      const anchor = target === 'cursor' ? editor.view.coordsAtPos(editor.state.selection.head) :
        target === 'chapter' ? manuscript.querySelector('[data-current-chapter]')?.getBoundingClientRect() : null
      if (anchor) {
        revealVerticalCaret(editor, anchor)
        const manuscriptLeft = manuscript.getBoundingClientRect().left
        const page = Math.max(0, Math.min(columns - 1, Math.floor((anchor.left - manuscriptLeft + 1) / (pitch * scale))))
        const targetSpread = Math.floor(page / 2)
        const start = targetSpread * step
        const clipped = view.clientWidth + 2 < windowWidth
        const viewLeft = view.getBoundingClientRect().left
        const anchorX = anchor.left - viewLeft + view.scrollLeft
        const outside = anchor.left < viewLeft || anchor.right > viewLeft + view.clientWidth
        const differentSpread = Math.floor((view.scrollLeft + view.clientWidth / 2) / step) !== targetSpread

        if (differentSpread || outside) {
          const left = clipped
            ? Math.max(start, Math.min(start + windowWidth - view.clientWidth, anchorX - view.clientWidth * 0.4))
            : start
          if (countChanged) pendingScroll.current = left
          else view.scrollLeft = left
        }
      }
      if (!countChanged) updatePageLabel()
    }

    function schedule(target) {
      if (target) reveal = target
      if (!animation) animation = requestAnimationFrame(measure)
    }

    const onTransaction = ({ transaction }) => {
      if (!transaction.docChanged && !transaction.selectionSet) return
      following.current = true
      schedule('cursor')
    }
    const remeasure = () => schedule(following.current ? (restoreCursor || editor.isFocused ? 'cursor' : 'chapter') : null)
    const view = viewport.current
    editor.on('transaction', onTransaction)
    document.fonts.addEventListener('loadingdone', remeasure)
    view.addEventListener('load', remeasure, true)
    remeasure()
    return () => {
      cancelAnimationFrame(animation)
      editor.off('transaction', onTransaction)
      document.fonts.removeEventListener('loadingdone', remeasure)
      view.removeEventListener('load', remeasure, true)
    }
  }, [editor, activeId, chapterOrder, restoreCursor, pitch, columnWidth, scale, step, windowWidth, paper.height, top, bottom,
    layout.font, layout.fontSize, layout.lineHeight, layout.firstLine])

  function turn(amount) {
    following.current = false
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
      <div ref={viewport} className="spread-window" onScroll={updatePageLabel}
        onPointerDown={() => { following.current = false }} onWheel={() => { following.current = false }}>
        <div className="spread-strip">
          <div className="spread-pages" aria-hidden="true">
            {Array.from({ length: spreadCount * 2 }, (_, index) => (
              <div key={index} className="spread-sheet"><span>{index + 1}</span></div>
            ))}
          </div>
          <article className="spread-manuscript" ref={flow}>{children}</article>
        </div>
      </div>
    </section>
  )
}
