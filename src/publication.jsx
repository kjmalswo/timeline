import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { BookOpen, FileDown, Printer } from 'lucide-react'
import { FONTS, PAPERS, TEMPLATES } from './catalog.js'
import { Dialog } from './dialogs.jsx'
import { handleDraftHistory, HistoryButtons, useDraftHistory } from './history-controls.jsx'
import { paragraphSpacing, paperStyle } from './document.js'
import { FormattedChapter } from './chapter-flow.jsx'
import { ChapterHeading } from './chapter-heading.jsx'
import { PAGE_NUMBER_POSITIONS, pageNumberPosition, printPageNumbers } from './page-numbers.js'
import { CoverWrap, coverSize, FrontCover } from './spine.jsx'

function PrintDocument({ job }) {
  const { book, type, includeCover } = job
  if (type === 'wrap') {
    const { width, height } = coverSize(book)
    return <section className="print-manuscript print-wrap" style={{ '--front-width': width + 'mm' }}>
      <style media="print">{`@page { size: ${width}mm ${height}mm; margin: 0; }`}</style>
      <CoverWrap book={book} />
    </section>
  }
  const paper = PAPERS[book.layout.paper]
  const { top, right, bottom, left } = book.layout.margins
  const trim = `${paper.width}mm ${paper.height}mm`
  return <section className="print-manuscript" style={{
    ...paperStyle(book.layout), '--front-width': paper.width + 'mm', '--front-height': paper.height + 'mm',
    '--body-image-max': (paper.height - top - bottom - 6) + 'mm',
  }}>
    <style media="print">{`@page { size: ${trim}; margin: ${top}mm ${right}mm ${bottom}mm ${left}mm; }
      @page yeobaek-cover { size: ${trim}; margin: 0; counter-increment: page 0; }
      ${printPageNumbers(book.layout)}`}</style>
    {includeCover && <div className="print-front"><FrontCover book={book} /></div>}
    <div className="print-text">
      {book.chapters.map((chapter, index) => <article className="print-chapter chapter-entry" key={chapter.id}>
        <ChapterHeading chapter={chapter} index={index} />
        <FormattedChapter content={chapter.content} />
      </article>)}
    </div>
  </section>
}

function PrintSpecification({ book }) {
  const { layout } = book
  const paper = PAPERS[layout.paper]
  const { top, right, bottom, left } = layout.margins
  return <dl className="print-spec">
    <dt>서식</dt><dd>{TEMPLATES[book.template].name}</dd>
    <dt>판형</dt><dd>{paper.name} ({paper.width} × {paper.height} mm)</dd>
    <dt>본문</dt><dd>{FONTS[layout.font].name} {layout.fontSize} pt · 행간 {layout.lineHeight}배 · 문단 간격 {paragraphSpacing(layout)} em · 들여쓰기 {layout.firstLine}자</dd>
    <dt>여백</dt><dd>위 {top} · 오른쪽 {right} · 아래 {bottom} · 왼쪽 {left} mm</dd>
    <dt>페이지 번호</dt><dd>{PAGE_NUMBER_POSITIONS[pageNumberPosition(layout)]}</dd>
  </dl>
}

function PrintSettings({ book, onClose, onPrint }) {
  const draft = useDraftHistory(() => ({ includeCover: true }))
  const { includeCover } = draft.value
  return <Dialog className="output-dialog" title="인쇄 설정" onClose={onClose} onKeyDown={event => handleDraftHistory(event, draft.step)}>
    <PrintSpecification book={book} />
    <label className="output-checkbox"><input type="checkbox" checked={includeCover}
      onChange={event => draft.change(() => ({ includeCover: event.target.checked }))} /> 앞표지 포함</label>
    <div className="dialog-actions">
      <HistoryButtons canUndo={draft.canUndo} canRedo={draft.canRedo} onStep={draft.step} />
      <button type="button" className="button button-secondary" onClick={onClose}>취소</button>
      <button type="button" className="button button-primary" onClick={() => onPrint('manuscript', includeCover)}><Printer size={17} /> 인쇄 창 열기</button>
    </div>
  </Dialog>
}

function ExportSettings({ book, onClose, onPrint }) {
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const { width, height } = coverSize(book)

  async function exportEbook() {
    setBusy(true)
    setFeedback(null)
    try {
      const { downloadEpub } = await import('./epub.js')
      await downloadEpub(book)
      setFeedback({ message: 'EPUB 파일 다운로드를 시작했어요.' })
    } catch {
      setFeedback({ message: 'EPUB을 만들 수 없습니다. 원고의 사진을 확인한 뒤 다시 시도해 주세요.', error: true })
    } finally {
      setBusy(false)
    }
  }

  return <Dialog className="output-dialog" title="내보내기" onClose={() => { if (!busy) onClose() }}>
    <section className="output-option">
      <h3><Printer size={18} /> 출판사 전달용 PDF</h3>
      <p>인쇄 창에서 PDF로 저장을 선택하세요.</p>
      <PrintSpecification book={book} />
      <p className="wrap-dimensions">표지 펼침면 {width} × {height} mm</p>
      <div className="output-actions">
        <button type="button" className="button button-secondary" disabled={busy} onClick={() => onPrint('manuscript', false)}>본문 PDF</button>
        <button type="button" className="button button-secondary" disabled={busy} onClick={() => onPrint('wrap')}>표지·책등 PDF</button>
      </div>
    </section>
    <section className="output-option">
      <h3><BookOpen size={18} /> 전자책용 EPUB</h3>
      <p>앞표지와 목차가 포함된 전자책 파일을 내려받습니다.</p>
      <button type="button" className="button button-primary" disabled={busy} onClick={exportEbook}>
        <FileDown size={17} /> {busy ? 'EPUB 만드는 중…' : 'EPUB 다운로드'}
      </button>
      {feedback && <p className={feedback.error ? 'form-error' : undefined} role={feedback.error ? 'alert' : 'status'}>{feedback.message}</p>}
    </section>
  </Dialog>
}

export function Publication({ book, mode, onClose }) {
  const [printing, setPrinting] = useState(null)
  const pending = useRef(null)

  function prepare(type, includeCover) {
    const job = { book, type, includeCover }
    pending.current = job
    setPrinting(job)
    onClose()
  }

  useEffect(() => {
    function beforePrint() {
      if (pending.current) return
      const job = { book, type: 'manuscript', includeCover: true, native: true }
      pending.current = job
      flushSync(() => setPrinting(job))
    }
    function afterPrint() {
      pending.current = null
      setPrinting(null)
    }
    window.addEventListener('beforeprint', beforePrint)
    window.addEventListener('afterprint', afterPrint)
    return () => {
      window.removeEventListener('beforeprint', beforePrint)
      window.removeEventListener('afterprint', afterPrint)
    }
  }, [book])

  useEffect(() => {
    if (!printing || printing.native) return
    const frame = requestAnimationFrame(async () => {
      const images = Array.from(document.querySelectorAll('.print-manuscript img'))
      const backgrounds = Array.from(document.querySelectorAll('.print-manuscript .cover-artwork'), element => {
        const url = getComputedStyle(element).backgroundImage.match(/url\("?([^"\)]+)"?\)/)?.[1]
        if (!url) return null
        const image = new Image()
        image.src = url
        return image
      }).filter(Boolean)
      await Promise.all([document.fonts.ready, ...[...images, ...backgrounds].map(image => image.decode().catch(() => {}))])
      if (pending.current === printing) window.print()
    })
    return () => cancelAnimationFrame(frame)
  }, [printing])

  useEffect(() => () => { pending.current = null }, [])

  return <>
    {printing && <PrintDocument job={printing} />}
    {mode === 'print' && <PrintSettings book={book} onClose={onClose} onPrint={prepare} />}
    {mode === 'export' && <ExportSettings book={book} onClose={onClose} onPrint={prepare} />}
  </>
}
