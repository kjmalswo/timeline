import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowLeft, Bookmark, BookOpen, ChevronLeft, ChevronRight, List, Minus, Plus, SlidersHorizontal, Trash2 } from 'lucide-react'
import { newId } from './catalog.js'
import { FormattedChapter } from './chapter-flow.jsx'
import { ChapterHeading } from './chapter-heading.jsx'
import { chapterName } from './chapter-heading.js'
import { Dialog } from './dialogs.jsx'
import { paperStyle } from './document.js'
import { pageNumberAlignment, pageNumberPosition } from './page-numbers.js'
import { bookmarkPage, pageForSpread, readerPageSize, readingPoint } from './reader-position.js'
import { FrontCover } from './spine.jsx'
import { maxZoom, minZoom } from './writing-view.js'

const prefsKey = 'yeobaek.reader.preferences'
const themes = { paper: '종이', sepia: '세피아', night: '야간' }
const defaultZoom = 100
const zoomStep = 10

function readLocal(key) {
  try { return JSON.parse(localStorage.getItem(key)) } catch { return null }
}

function writeLocal(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

function readPreferences() {
  const saved = readLocal(prefsKey)
  const zoom = saved?.zoom ?? saved?.fontSize
  return { theme: Object.hasOwn(themes, saved?.theme) ? saved.theme : 'paper',
    mode: saved?.mode === 'single' ? 'single' : 'auto',
    zoom: Number.isInteger(zoom) && zoom >= minZoom && zoom <= maxZoom ? zoom : defaultZoom }
}

function readBookmarks(key) {
  const saved = readLocal(key)
  return Array.isArray(saved) ? saved.filter(mark => typeof mark?.id === 'string' &&
    typeof mark.point?.id === 'string' && Number.isInteger(mark.point.index) && Number.isFinite(mark.point.fraction)) : null
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

function ReaderBookmarks({ bookmarks, page, savedHere, error, onAdd, onRemove, onJump, onClose }) {
  return <Dialog title="책갈피" onClose={onClose} className="reader-bookmarks">
    {page < 0 ? <p className="reader-bookmark-note">본문을 펼치면 책갈피를 추가할 수 있어요.</p> :
      <button type="button" className="button button-primary reader-bookmark-add" disabled={savedHere} onClick={onAdd}>
        <Bookmark size={16} /> {page + 1}쪽에 {savedHere ? '책갈피가 있어요' : '책갈피 추가'}
      </button>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {bookmarks.length ? <ol className="reader-bookmark-list">
      {bookmarks.map(mark => <li key={mark.id}>
        <button type="button" className="reader-bookmark-jump" disabled={mark.page < 0} onClick={() => onJump(mark.page)}>
          <span>{mark.title}</span>{mark.page >= 0 && <small>{mark.page + 1}쪽</small>}
        </button>
        <button type="button" className="icon-button" aria-label={`${mark.page >= 0 ? (mark.page + 1) + '쪽' : mark.title} 책갈피 삭제`}
          title="책갈피 삭제" onClick={() => onRemove(mark.id)}><Trash2 size={16} /></button>
      </li>)}
    </ol> : <p className="reader-bookmark-note">저장한 책갈피가 없어요.</p>}
  </Dialog>
}

export function BookReader({ book, identity, onBack }) {
  const progressKey = 'yeobaek.reader.page.' + identity
  const bookmarksKey = 'yeobaek.reader.bookmarks.' + identity
  const [preferences, setPreferences] = useState(readPreferences)
  const [bookmarks, setBookmarks] = useState(() => readBookmarks(bookmarksKey) ?? [])
  const [bookmarkError, setBookmarkError] = useState('')
  const [panel, setPanel] = useState(null)
  const [box, setBox] = useState({ width: 0, height: 0 })
  const [location, setLocation] = useState({ page: -1, count: 0, starts: [] })
  const [initialPoint] = useState(() => readLocal(progressKey))
  const stage = useRef(null)
  const pan = useRef(null)
  const viewport = useRef(null)
  const columns = useRef(null)
  const touch = useRef(null)
  const progress = useRef(initialPoint)
  const panPosition = useRef(null)
  const locationRef = useRef(location)
  const { visible, width, height, left, right, top, bottom, gap, pitch, spreadWidth, fit, textWidth, textHeight } = readerPageSize(box, book.layout, preferences.mode)
  const scale = fit * preferences.zoom / defaultZoom
  const ready = scale > 0
  const enlarged = preferences.zoom > defaultZoom
  const { page, count } = location
  const spreadPage = pageForSpread(page, count, visible)
  const spreadCount = Math.ceil(count / visible)
  const lastPage = pageForSpread(count - 1, count, visible)
  const showingCover = page < 0
  const pageLabel = showingCover ? '표지' : `${spreadPage + 1}${visible === 2 && spreadPage + 1 < count ? '–' + (spreadPage + 2) : ''} / ${count}쪽`
  const savedPages = bookmarks.map(mark => {
    const target = bookmarkPage(mark.point, location.starts, count, book.chapters)
    const index = Math.max(0, location.starts.findLastIndex(start => start <= target))
    return { id: mark.id, page: target, title: chapterName(book.chapters[index], index) }
  }).sort((a, b) => a.page - b.page)
  const savedHere = page >= 0 && savedPages.some(mark => mark.page === page)

  useEffect(() => { document.title = book.title + ' — 여백 리더' }, [book.title])
  useEffect(() => { stage.current?.focus({ preventScroll: true }) }, [])
  useEffect(() => {
    function sync(event) {
      if (event.key === bookmarksKey || event.key === null) setBookmarks(readBookmarks(bookmarksKey) ?? [])
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [bookmarksKey])

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
    if (!flow || !ready || textWidth < 1 || textHeight < 1) return
    let frame = 0

    function measure() {
      const bounds = flow.getBoundingClientRect()
      const scale = bounds.width / textWidth
      if (!scale) return
      const starts = Array.from(flow.querySelectorAll('[data-chapter-anchor]'), element =>
        Math.max(0, Math.round((element.getBoundingClientRect().left - bounds.left) / (pitch * scale))))
      const count = Math.max(1, starts.at(-1) + 1, Math.ceil((flow.scrollWidth - textWidth - 2) / pitch) + 1)
      const page = bookmarkPage(progress.current, starts, count, book.chapters)
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
  }, [book, pitch, ready, textHeight, textWidth])

  useLayoutEffect(() => {
    if (viewport.current) viewport.current.scrollLeft = Math.max(0, spreadPage) * pitch
  }, [spreadPage, pitch, count, visible])

  useLayoutEffect(() => {
    const scroller = pan.current
    if (!scroller || !ready) return
    const previous = panPosition.current
    const offset = Math.max(0, page - spreadPage) * pitch * scale
    if (!previous || previous.page !== page || previous.spreadPage !== spreadPage) {
      scroller.scrollLeft = offset
      scroller.scrollTop = 0
    } else if (previous.scale !== scale) {
      scroller.scrollLeft = Math.max(offset, scroller.scrollLeft * scale / previous.scale)
      scroller.scrollTop *= scale / previous.scale
    }
    panPosition.current = { page, spreadPage, scale }
  }, [page, spreadPage, pitch, scale, ready])

  function openPage(requested) {
    const current = locationRef.current
    const page = pageForSpread(requested, current.count, 1)
    progress.current = readingPoint(page, current.starts, current.count, book.chapters)
    writeLocal(progressKey, progress.current)
    updateLocation({ ...current, page })
  }

  function turn(direction) {
    const current = locationRef.current
    const active = pageForSpread(current.page, current.count, visible)
    if (active < 0) {
      if (direction > 0) openPage(0)
    } else openPage(active + direction * visible)
  }

  function keydown(event) {
    if (panel || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.isComposing ||
      event.target.closest('input, select, textarea') || (event.key === ' ' && event.target.closest('button, a'))) return
    if (event.target === pan.current && ['ArrowLeft', 'ArrowRight'].includes(event.key)) return
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

  function changeZoom(value) {
    changePreferences({ zoom: Math.max(minZoom, Math.min(maxZoom, value)) })
  }

  function changeBookmarks(revise) {
    const next = revise(readBookmarks(bookmarksKey) ?? bookmarks)
    if (!writeLocal(bookmarksKey, next)) {
      setBookmarkError('이 브라우저에 책갈피를 저장할 수 없어요.')
      return
    }
    setBookmarks(next)
    setBookmarkError('')
  }

  function addBookmark() {
    const point = readingPoint(page, location.starts, count, book.chapters)
    if (!point) return
    changeBookmarks(entries => entries.some(mark => bookmarkPage(mark.point, location.starts, count, book.chapters) === page)
      ? entries : [...entries, { id: newId(), point }])
  }

  function jump(page) {
    openPage(page)
    setPanel(null)
    requestAnimationFrame(() => stage.current?.focus({ preventScroll: true }))
  }

  const frameWidth = showingCover ? width : spreadWidth
  const font = ['book', 'batang'].includes(book.layout.font) ? 'serif' : book.layout.font
  const style = { '--reader-width': width + 'px', '--reader-height': height + 'px', '--reader-gap': gap + 'px',
    '--reader-spread': frameWidth + 'px', '--reader-visible': visible, '--reader-scale': scale,
    '--page-number-left': left + 'px', '--page-number-right': right + 'px',
    '--page-number-bottom': Math.min(9, bottom / 4) + 'px', ...paperStyle({ ...book.layout, font }) }
  const numberPosition = pageNumberPosition(book.layout)

  return <main className={'book-reader reader-theme-' + preferences.theme} onKeyDown={keydown}>
    <header className="reader-header">
      <button type="button" className="reader-back" onClick={onBack}><ArrowLeft size={18} /><span>리더</span></button>
      <div className="reader-title"><h1>{book.title}</h1>{book.author && <p>{book.author}</p>}</div>
      <nav className="reader-actions" aria-label="읽기 도구">
        <button type="button" className="icon-button" title="목차" aria-label="목차" onClick={() => setPanel('contents')}><List size={20} /></button>
        <button type="button" className="icon-button" title="책갈피" aria-label="책갈피" aria-haspopup="dialog"
          onClick={() => { setBookmarkError(''); setPanel('bookmarks') }}><Bookmark size={20} fill={savedHere ? 'currentColor' : 'none'} /></button>
        <button type="button" className="icon-button" title="읽기 설정" aria-label="읽기 설정" onClick={() => setPanel('settings')}><SlidersHorizontal size={19} /></button>
      </nav>
    </header>
    <section className="reader-stage" ref={stage} tabIndex={0} aria-label="책 본문">
      <div className="reader-pan" ref={pan} data-enlarged={enlarged ? '' : undefined} tabIndex={enlarged ? 0 : undefined}
        role={enlarged ? 'region' : undefined} aria-label={enlarged ? '확대 화면 이동' : undefined}
        onTouchStart={event => { touch.current = !enlarged && event.touches.length === 1 ? event.touches[0] : null }}
        onTouchCancel={() => { touch.current = null }} onTouchEnd={endTouch}>
        {ready && <div className="reader-zoom-frame" style={{ width: frameWidth * scale, height: height * scale }}>
          <div className="reader-book-frame" style={style}>
            {showingCover && <button type="button" className="reader-front" onClick={() => turn(1)} aria-label="표지에서 본문으로">
              {book.coverImage ? <img src={book.coverImage} alt={book.title + ' 표지'} /> : <FrontCover book={book} />}
            </button>}
            <div className={'reader-spread' + (showingCover ? ' reader-spread-hidden' : '')} aria-hidden={showingCover || undefined}>
              <div className="reader-sheets" aria-hidden="true">
                {Array.from({ length: visible }, (_, offset) => <div key={offset} className="reader-sheet">
                  {spreadPage + offset < count && <span className="page-number" style={{ textAlign: pageNumberAlignment(numberPosition, spreadPage + offset) }}>
                    {spreadPage + offset + 1}
                  </span>}
                </div>)}
              </div>
              <div className="reader-viewport" ref={viewport}>
                <div className="reader-track" style={{ width: Math.max(visible, spreadCount * visible) * pitch - gap }}>
                  <article className="reader-ink" style={{ top, left }}>
                    <div className="reader-columns" ref={columns} style={{ width: textWidth, height: textHeight,
                      columnGap: left + right + gap, '--body-image-max': Math.max(20, textHeight - 18) + 'px' }}>
                      <ReaderChapters book={book} />
                    </div>
                  </article>
                </div>
              </div>
            </div>
          </div>
        </div>}
      </div>
    </section>
    <footer className="reader-controls" aria-label="페이지 이동">
      <button type="button" className="icon-button" aria-label="이전 쪽" disabled={showingCover} onClick={() => turn(-1)}><ChevronLeft size={23} /></button>
      <div className="reader-progress">
        <span aria-live="polite">{pageLabel}</span>
        <input type="range" min="0" max={spreadCount} value={showingCover ? 0 : spreadPage / visible + 1} disabled={!count}
          onChange={event => openPage((Number(event.target.value) - 1) * visible)} aria-label="읽을 쪽" aria-valuetext={pageLabel} />
      </div>
      <button type="button" className="icon-button" aria-label="다음 쪽" disabled={!count || spreadPage >= lastPage} onClick={() => turn(1)}><ChevronRight size={23} /></button>
      <div className="reader-zoom-controls" role="group" aria-label="책 확대 및 축소">
        <button type="button" className="icon-button" aria-label="책 축소" title="축소" disabled={preferences.zoom <= minZoom}
          onClick={() => changeZoom(preferences.zoom - zoomStep)}><Minus size={17} /></button>
        <button type="button" className="reader-zoom-reset" aria-label={`현재 ${preferences.zoom}%, 화면에 맞춤`} title="화면에 맞춤 (100%)"
          onClick={() => changeZoom(defaultZoom)}>{preferences.zoom}%</button>
        <button type="button" className="icon-button" aria-label="책 확대" title="확대" disabled={preferences.zoom >= maxZoom}
          onClick={() => changeZoom(preferences.zoom + zoomStep)}><Plus size={17} /></button>
      </div>
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
    {panel === 'bookmarks' && <ReaderBookmarks bookmarks={savedPages} page={page} savedHere={savedHere} error={bookmarkError}
      onAdd={addBookmark} onRemove={id => changeBookmarks(entries => entries.filter(mark => mark.id !== id))}
      onJump={jump} onClose={() => setPanel(null)} />}
    {panel === 'settings' && <ReaderSettings preferences={preferences} onChange={changePreferences} onClose={() => setPanel(null)} />}
  </main>
}
