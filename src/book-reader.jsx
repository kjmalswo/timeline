import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowLeft, BookOpen, ChevronLeft, ChevronRight, List, Minus, Plus, SlidersHorizontal } from 'lucide-react'
import { FormattedChapter } from './chapter-flow.jsx'
import { ChapterHeading } from './chapter-heading.jsx'
import { chapterName } from './chapter-heading.js'
import { Dialog } from './dialogs.jsx'
import { paperStyle } from './document.js'
import { bookmarkPage, pageForSpread, readerPageSize, readingPoint } from './reader-position.js'
import { FrontCover } from './spine.jsx'

const prefsKey = 'yeobaek.reader.preferences'
const themes = { paper: '종이', sepia: '세피아', night: '야간' }

function readLocal(key) {
  try { return JSON.parse(localStorage.getItem(key)) } catch { return null }
}

function writeLocal(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
}

function readPreferences() {
  const saved = readLocal(prefsKey)
  return { theme: Object.hasOwn(themes, saved?.theme) ? saved.theme : 'paper',
    mode: saved?.mode === 'single' ? 'single' : 'auto',
    fontSize: Number.isInteger(saved?.fontSize) && saved.fontSize >= 80 && saved.fontSize <= 160 ? saved.fontSize : 100 }
}

const ReaderChapters = memo(function ReaderChapters({ book }) {
  return book.chapters.map((chapter, index) => <section className="reader-chapter" key={chapter.id} aria-label={chapterName(chapter, index)}>
    <div className="reader-chapter-anchor" data-chapter-anchor aria-hidden="true" />
    {book.imported ? <div className="paper-body reader-imported-body" dangerouslySetInnerHTML={{ __html: chapter.html }} /> : <>
      <ChapterHeading chapter={chapter} index={index} />
      <FormattedChapter content={chapter.content} />
    </>}
  </section>)
})

function ReaderSettings({ preferences, onChange, onClose }) {
  return <Dialog title="읽기 설정" onClose={onClose} className="reader-settings">
    <div className="reader-setting">
      <span>글자 크기</span>
      <div className="reader-font-controls">
        <button type="button" className="icon-button" aria-label="글자 작게" disabled={preferences.fontSize <= 80}
          onClick={() => onChange({ fontSize: preferences.fontSize - 10 })}><Minus size={17} /></button>
        <output>{preferences.fontSize}%</output>
        <button type="button" className="icon-button" aria-label="글자 크게" disabled={preferences.fontSize >= 160}
          onClick={() => onChange({ fontSize: preferences.fontSize + 10 })}><Plus size={17} /></button>
      </div>
    </div>
    <fieldset className="reader-setting">
      <legend>배경</legend>
      <div className="reader-setting-options">
        {Object.entries(themes).map(([key, label]) => <button type="button" key={key} className="button button-secondary"
          aria-pressed={preferences.theme === key} onClick={() => onChange({ theme: key })}>{label}</button>)}
      </div>
    </fieldset>
    <fieldset className="reader-setting">
      <legend>쪽 보기</legend>
      <div className="reader-setting-options">
        {[['auto', '자동 펼침'], ['single', '한 쪽']].map(([key, label]) => <button type="button" key={key}
          className="button button-secondary" aria-pressed={preferences.mode === key} onClick={() => onChange({ mode: key })}>{label}</button>)}
      </div>
    </fieldset>
  </Dialog>
}

export function BookReader({ book, identity, onBack }) {
  const [preferences, setPreferences] = useState(readPreferences)
  const [panel, setPanel] = useState(null)
  const [box, setBox] = useState({ width: 0, height: 0 })
  const [location, setLocation] = useState({ page: -1, count: 0, starts: [] })
  const [initialPoint] = useState(() => readLocal('yeobaek.reader.page.' + identity))
  const stage = useRef(null)
  const viewport = useRef(null)
  const columns = useRef(null)
  const touch = useRef(null)
  const progress = useRef(initialPoint)
  const locationRef = useRef(location)
  const { visible, width, height, left, right, top, bottom, gap, pitch, textWidth, textHeight } = readerPageSize(box, book.layout, preferences.mode)
  const scale = preferences.fontSize / 100
  const { page, count } = location
  const spreadCount = Math.ceil(count / visible)
  const visibleWidth = width * visible + gap * (visible - 1)
  const lastPage = pageForSpread(count - 1, count, visible)
  const showingCover = page < 0
  const pageLabel = showingCover ? '표지' : `${page + 1}${visible === 2 && page + 1 < count ? '–' + (page + 2) : ''} / ${count}쪽`

  useEffect(() => { document.title = book.title + ' — 여백 리더' }, [book.title])
  useEffect(() => { stage.current?.focus({ preventScroll: true }) }, [])

  useLayoutEffect(() => {
    const element = stage.current
    function resize() {
      const style = getComputedStyle(element)
      const width = element.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0)
      const height = element.clientHeight - (parseFloat(style.paddingTop) || 0) - (parseFloat(style.paddingBottom) || 0)
      setBox(previous => previous.width === width && previous.height === height ? previous : { width, height })
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  function updateLocation(next) {
    const previous = locationRef.current
    if (next.page !== previous.page || next.count !== previous.count || next.starts.length !== previous.starts.length ||
      next.starts.some((start, index) => start !== previous.starts[index])) {
      locationRef.current = next
      setLocation(next)
    }
  }

  useLayoutEffect(() => {
    const flow = columns.current
    if (!flow || textWidth < 1 || textHeight < 1) return
    let frame = 0

    function measure() {
      const start = flow.getBoundingClientRect().left
      const starts = Array.from(flow.querySelectorAll('[data-chapter-anchor]'), element =>
        Math.max(0, Math.floor((element.getBoundingClientRect().left - start + 1) / pitch)))
      const count = Math.max(1, starts.at(-1) + 1, Math.ceil((flow.scrollWidth * scale - textWidth - 2) / pitch) + 1)
      const page = pageForSpread(bookmarkPage(progress.current, starts, count, book.chapters), count, visible)
      updateLocation({ count, starts, page })
    }

    function schedule() {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    }

    measure()
    flow.addEventListener('load', schedule, true)
    document.fonts?.addEventListener('loadingdone', schedule)
    return () => {
      cancelAnimationFrame(frame)
      flow.removeEventListener('load', schedule, true)
      document.fonts?.removeEventListener('loadingdone', schedule)
    }
  }, [book, pitch, scale, textHeight, textWidth, visible])

  useLayoutEffect(() => {
    if (viewport.current) viewport.current.scrollLeft = Math.max(0, page) * pitch
  }, [page, pitch, count, visible])

  function openPage(requested) {
    const current = locationRef.current
    const page = pageForSpread(requested, current.count, visible)
    progress.current = readingPoint(page, current.starts, current.count, book.chapters)
    writeLocal('yeobaek.reader.page.' + identity, progress.current)
    updateLocation({ ...current, page })
  }

  function turn(direction) {
    const active = locationRef.current.page
    if (active < 0) {
      if (direction > 0) openPage(0)
    } else openPage(active + direction * visible)
  }

  function keydown(event) {
    if (panel || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.isComposing ||
      event.target.closest('input, select, textarea') || (event.key === ' ' && event.target.closest('button, a'))) return
    const moves = { ArrowLeft: -1, ArrowRight: 1, PageUp: -1, PageDown: 1, ' ': event.shiftKey ? -1 : 1 }
    if (Object.hasOwn(moves, event.key)) turn(moves[event.key])
    else if (event.key === 'Home') openPage(-1)
    else if (event.key === 'End') openPage(count - 1)
    else return
    event.preventDefault()
  }

  function endTouch(event) {
    const first = touch.current
    touch.current = null
    const end = event.changedTouches[0]
    if (!first || !end || !window.getSelection()?.isCollapsed) return
    const dx = end.clientX - first.clientX
    const dy = end.clientY - first.clientY
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4) turn(dx < 0 ? 1 : -1)
  }

  function changePreferences(partial) {
    const next = { ...preferences, ...partial }
    setPreferences(next)
    writeLocal(prefsKey, next)
  }

  function jump(page) {
    openPage(page)
    setPanel(null)
    requestAnimationFrame(() => stage.current?.focus({ preventScroll: true }))
  }

  const style = { '--reader-width': width + 'px', '--reader-height': height + 'px', '--reader-gap': gap + 'px',
    '--reader-spread': visibleWidth + 'px', '--reader-visible': visible, ...paperStyle(book.layout) }

  return <main className={'book-reader reader-theme-' + preferences.theme} onKeyDown={keydown}>
    <header className="reader-header">
      <button type="button" className="reader-back" onClick={onBack}><ArrowLeft size={18} /><span>리더</span></button>
      <div className="reader-title"><h1>{book.title}</h1>{book.author && <p>{book.author}</p>}</div>
      <nav className="reader-actions" aria-label="읽기 도구">
        <button type="button" className="icon-button" title="목차" aria-label="목차" onClick={() => setPanel('contents')}><List size={20} /></button>
        <button type="button" className="icon-button" title="읽기 설정" aria-label="읽기 설정" onClick={() => setPanel('settings')}><SlidersHorizontal size={19} /></button>
      </nav>
    </header>
    <section className="reader-stage" ref={stage} tabIndex={0} aria-label="책 본문"
      onTouchStart={event => { touch.current = event.touches.length === 1 ? event.touches[0] : null }}
      onTouchCancel={() => { touch.current = null }} onTouchEnd={endTouch}>
      {box.width > 0 && box.height > 0 && <div className="reader-book-frame" style={style}>
        {showingCover && <button type="button" className="reader-front" onClick={() => turn(1)} aria-label="표지에서 본문으로">
          {book.coverImage ? <img src={book.coverImage} alt={book.title + ' 표지'} /> : <FrontCover book={book} />}
        </button>}
        <div className={'reader-spread' + (showingCover ? ' reader-spread-hidden' : '')} aria-hidden={showingCover || undefined}>
          <div className="reader-sheets" aria-hidden="true">
            {Array.from({ length: visible }, (_, offset) => <div key={offset} className="reader-sheet">
              {page + offset < count && <span>{page + offset + 1}</span>}
            </div>)}
          </div>
          <div className="reader-viewport" ref={viewport}>
            <div className="reader-track" style={{ width: Math.max(visible, spreadCount * visible) * pitch - gap }}>
              <article className="reader-ink" style={{ top, left }}>
                <div className="reader-columns" ref={columns} style={{ zoom: scale, width: textWidth / scale, height: textHeight / scale,
                  columnGap: (left + right + gap) / scale, '--body-image-max': Math.max(20, textHeight / scale - 18) + 'px' }}>
                  <ReaderChapters book={book} />
                </div>
              </article>
            </div>
          </div>
        </div>
      </div>}
    </section>
    <footer className="reader-controls" aria-label="페이지 이동">
      <button type="button" className="icon-button" aria-label="이전 쪽" disabled={showingCover} onClick={() => turn(-1)}><ChevronLeft size={23} /></button>
      <div className="reader-progress">
        <span aria-live="polite">{pageLabel}</span>
        <input type="range" min="0" max={spreadCount} value={showingCover ? 0 : page / visible + 1} disabled={!count}
          onChange={event => openPage((Number(event.target.value) - 1) * visible)} aria-label="읽을 쪽" aria-valuetext={pageLabel} />
      </div>
      <button type="button" className="icon-button" aria-label="다음 쪽" disabled={!count || page >= lastPage} onClick={() => turn(1)}><ChevronRight size={23} /></button>
    </footer>
    {panel === 'contents' && <Dialog title="목차" onClose={() => setPanel(null)} className="reader-contents">
      <button type="button" className="reader-cover-link text-button" onClick={() => jump(-1)}><BookOpen size={17} /> 표지</button>
      <ol>
        {book.chapters.map((chapter, index) => <li key={chapter.id}><button type="button" disabled={!count}
          onClick={() => jump(location.starts[index])}>
          {chapterName(chapter, index)}<span>{count ? location.starts[index] + 1 + '쪽' : ''}</span>
        </button></li>)}
      </ol>
    </Dialog>}
    {panel === 'settings' && <ReaderSettings preferences={preferences} onChange={changePreferences} onClose={() => setPanel(null)} />}
  </main>
}
