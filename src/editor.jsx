import { useEffect, useMemo, useRef, useState } from 'react'
import { generateHTML } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import {
  AlignCenter, AlignJustify, AlignLeft, AlignRight, ArrowDown, ArrowLeft, ArrowUp, Bold, ChevronDown, Cloud,
  CloudAlert, CloudCheck, FileText, Italic, List, ListOrdered, ListTree, Plus, Printer,
  Redo2, SlidersHorizontal, Trash2, Underline, Undo2, X,
} from 'lucide-react'
import { bookCharacters, characterCount, COVERS, FONTS, newChapter, PAPERS, TEMPLATES } from './catalog.js'
import { AccountButton } from './dashboard.jsx'
import { Dialog } from './dialogs.jsx'
import { BLOCK_INDENTS, COLORS, INDENTS, LETTER_SPACINGS, LINE_HEIGHTS, paperStyle, TEXT_SIZES, writingExtensions } from './document.js'

const formatNumber = new Intl.NumberFormat('ko-KR')
const alignments = [
  ['left', '왼쪽 정렬', AlignLeft], ['center', '가운데 정렬', AlignCenter],
  ['right', '오른쪽 정렬', AlignRight], ['justify', '양쪽 정렬', AlignJustify],
]
const fontOptions = Object.entries(FONTS).map(([value, font]) => [value, font.name])
const papers = Object.entries(PAPERS).map(([value, paper]) => [value, paper.name])

function IconCommand({ icon: Icon, label, press, active, disabled }) {
  return (
    <button className={'icon-button tool-button' + (active ? ' tool-active' : '')} type="button"
      aria-label={label} title={label} aria-pressed={active} disabled={disabled} onMouseDown={event => event.preventDefault()} onClick={press}>
      <Icon size={17} strokeWidth={1.9} />
    </button>
  )
}

function ToolSelect({ label, value, onChange, options, className = '' }) {
  return (
    <label className={'tool-select ' + className} title={label}>
      <select value={value ?? ''} aria-label={label} onChange={event => onChange(event.target.value)}>
        {options.map(([key, name]) => <option key={key} value={key}>{name}</option>)}
      </select>
      <ChevronDown size={12} aria-hidden="true" />
    </label>
  )
}

function numberOptions(values, label, suffix, active) {
  const configured = typeof active === 'number' && !values.includes(active) ? [...values, active].sort((a, b) => a - b) : values
  return [['', label], ...configured.map(value => [value, String(value) + suffix])]
}

function Toolbar({ editor, layout }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      if (!current) return null
      const paragraph = current.isActive('heading') ? current.getAttributes('heading') : current.getAttributes('paragraph')
      return {
        paragraph, text: current.getAttributes('textStyle'),
        bold: current.isActive('bold'), italic: current.isActive('italic'), underline: current.isActive('underline'),
        bullets: current.isActive('bulletList'), numbers: current.isActive('orderedList'),
        undo: current.can().undo(), redo: current.can().redo(),
      }
    },
  })
  if (!state) return <div className="toolbar" />

  const chain = () => editor.chain().focus()
  const mark = attrs => chain().setMark('textStyle', attrs).removeEmptyTextStyle().run()
  const paragraph = attrs => chain().updateAttributes('paragraph', attrs).updateAttributes('heading', attrs).run()
  const numeric = value => value === '' ? null : Number(value)

  return (
    <div className="toolbar" role="group" aria-label="본문 서식">
      <div className="tool-group">
        <IconCommand icon={Undo2} label="실행 취소" disabled={!state.undo} press={() => chain().undo().run()} />
        <IconCommand icon={Redo2} label="다시 실행" disabled={!state.redo} press={() => chain().redo().run()} />
      </div>
      <div className="tool-group">
        <ToolSelect label="문단 스타일" value={state.paragraph.level} className="paragraph-select"
          options={[[ '', '본문' ], [1, '제목 1'], [2, '제목 2'], [3, '제목 3']]}
          onChange={value => value ? chain().setHeading({ level: Number(value) }).run() : chain().setParagraph().run()} />
        <ToolSelect label="글꼴" value={state.text.font} className="font-select"
          options={[[ '', FONTS[layout.font].name + ' (기본)' ], ...fontOptions]} onChange={value => mark({ font: value || null })} />
        <ToolSelect label="글자 크기" value={state.text.fontSize}
          options={numberOptions(TEXT_SIZES, layout.fontSize + ' pt', ' pt', state.text.fontSize)} onChange={value => mark({ fontSize: numeric(value) })} />
      </div>
      <div className="tool-group">
        <IconCommand icon={Bold} label="굵게" active={state.bold} press={() => chain().toggleBold().run()} />
        <IconCommand icon={Italic} label="기울임" active={state.italic} press={() => chain().toggleItalic().run()} />
        <IconCommand icon={Underline} label="밑줄" active={state.underline} press={() => chain().toggleUnderline().run()} />
        <label className="tool-select color-select" title="글자 색">
          <span aria-hidden="true" style={{ '--text-color': state.text.color ?? COLORS[0] }}>A</span>
          <select aria-label="글자 색" value={state.text.color ?? ''} onChange={event => mark({ color: event.target.value || null })}>
            {['기본 색', '먹색', '보라', '초록', '자주', '황토', '파랑'].map((name, index) =>
              <option key={name} value={COLORS[index - 1] ?? ''}>{name}</option>)}
          </select><ChevronDown size={11} aria-hidden="true" />
        </label>
      </div>
      <div className="tool-group">
        {alignments.map(([align, label, icon]) => <IconCommand key={align} icon={icon} label={label}
          active={(state.paragraph.align ?? 'left') === align} press={() => paragraph({ align })} />)}
        <IconCommand icon={List} label="글머리 기호" active={state.bullets} press={() => chain().toggleBulletList().run()} />
        <IconCommand icon={ListOrdered} label="번호 목록" active={state.numbers} press={() => chain().toggleOrderedList().run()} />
      </div>
      <div className="tool-group textual-tools">
        <ToolSelect label="자간" value={state.text.letterSpacing} options={numberOptions(LETTER_SPACINGS, '자간', ' em', state.text.letterSpacing)}
          onChange={value => mark({ letterSpacing: numeric(value) })} />
        <ToolSelect label="줄 간격" value={state.paragraph.lineHeight} options={numberOptions(LINE_HEIGHTS, '줄 간격', '배', state.paragraph.lineHeight)}
          onChange={value => paragraph({ lineHeight: numeric(value) })} />
        <ToolSelect label="첫 줄 들여쓰기" value={state.paragraph.firstLine} options={numberOptions(INDENTS, '첫 줄', ' 글자', state.paragraph.firstLine)}
          onChange={value => paragraph({ firstLine: numeric(value) })} />
        <ToolSelect label="문단 들여쓰기" value={state.paragraph.blockIndent} options={numberOptions(BLOCK_INDENTS, '들여쓰기', ' 글자', state.paragraph.blockIndent)}
          onChange={value => paragraph({ blockIndent: numeric(value) })} />
      </div>
    </div>
  )
}

function NameInput({ value, onSave, label, className, autoFocus = false }) {
  const [name, setName] = useState(value)
  useEffect(() => { setName(value) }, [value])
  return (
    <input className={className} aria-label={label} value={name} maxLength={160} autoFocus={autoFocus}
      onFocus={event => { if (autoFocus) event.target.select() }}
      onChange={event => setName(event.target.value)}
      onKeyDown={event => {
        if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
          event.preventDefault()
          event.currentTarget.blur()
        }
      }}
      onBlur={() => {
        const next = name.trim() || value
        setName(next)
        if (next !== value) onSave(next)
      }} />
  )
}

function ChapterRail({ book, chapter, open, onClose, onSelect, onAdd, onMove, onDelete }) {
  const index = book.chapters.findIndex(item => item.id === chapter.id)
  return (
    <aside className={'chapter-rail' + (open ? ' chapter-rail-open' : '')} aria-label="책의 장 목록">
      <div className="rail-heading"><span><ListTree size={17} /> 원고 구성</span>
        <button type="button" className="icon-button rail-close" onClick={onClose} aria-label="장 목록 닫기"><X size={18} /></button>
      </div>
      <div className="chapter-list">
        {book.chapters.map((item, position) => (
          <button type="button" key={item.id} className={'chapter-item' + (item.id === chapter.id ? ' current' : '')}
            onClick={() => { onSelect(item.id); onClose() }} aria-current={item.id === chapter.id ? 'page' : undefined}>
            <span className="chapter-number">{String(position + 1).padStart(2, '0')}</span><span>{item.title}</span>
          </button>
        ))}
      </div>
      <button type="button" className="add-chapter text-button" onClick={() => { onAdd(); onClose() }} disabled={book.chapters.length >= 200}>
        <Plus size={16} /> 장 추가
      </button>
      <div className="rail-actions" aria-label="현재 장 관리">
        <IconCommand icon={ArrowUp} label="현재 장을 위로 이동" disabled={index === 0} press={() => onMove(-1)} />
        <IconCommand icon={ArrowDown} label="현재 장을 아래로 이동" disabled={index === book.chapters.length - 1} press={() => onMove(1)} />
        <IconCommand icon={Trash2} label="현재 장 삭제" disabled={book.chapters.length <= 1} press={onDelete} />
      </div>
    </aside>
  )
}

function Inspector({ book, onLayout, onCover, onClose }) {
  const layout = book.layout
  const paper = PAPERS[layout.paper]
  const numericOptions = values => values.map(value => [value, String(value)])
  return (
    <aside className="design-rail" aria-label="책 디자인 설정">
      <div className="rail-heading"><span><SlidersHorizontal size={17} /> 판형 설정</span>
        <button type="button" className="icon-button" onClick={onClose} aria-label="판형 설정 닫기"><X size={18} /></button>
      </div>
      <div className="inspector-section">
        <label className="field">판형
          <select value={layout.paper} onChange={event => onLayout({ paper: event.target.value })}>
            {papers.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <p className="paper-dimensions">{paper.width} × {paper.height} mm</p>
        <label className="field">표지 디자인
          <select value={book.cover} onChange={event => onCover(event.target.value)}>
            {Object.entries(COVERS).map(([value, cover]) => <option key={value} value={value}>{cover.name}</option>)}
          </select>
        </label>
      </div>
      <div className="inspector-section">
        <h3>본문 기본 서식</h3>
        <label className="field">기본 글꼴
          <select value={layout.font} onChange={event => onLayout({ font: event.target.value })}>
            {fontOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <div className="inspector-pair">
          {[
            ['fontSize', '크기 (pt)', TEXT_SIZES],
            ['lineHeight', '줄 간격 (배)', LINE_HEIGHTS],
            ['firstLine', '첫 줄 들여쓰기', INDENTS],
          ].map(([key, label, values]) => (
            <label key={key} className="field">{label}
              <select value={layout[key]} onChange={event => onLayout({ [key]: Number(event.target.value) })}>
                {numericOptions(values).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
              </select>
            </label>
          ))}
        </div>
      </div>
      <div className="inspector-section margin-fields">
        <h3>본문 여백 (mm)</h3>
        <div className="inspector-pair">
          {[['top', '위'], ['right', '오른쪽'], ['bottom', '아래'], ['left', '왼쪽']].map(([side, label]) =>
            <label key={side} className="field">{label}
              <MarginInput value={layout.margins[side]} onSave={value => onLayout({ margins: { ...layout.margins, [side]: value } })} />
            </label>,
          )}
        </div>
      </div>
    </aside>
  )
}

function MarginInput({ value, onSave }) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => { setDraft(String(value)) }, [value])
  return <input type="number" min="5" max="40" value={draft} onChange={event => setDraft(event.target.value)}
    onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }}
    onBlur={() => { const next = Math.max(5, Math.min(40, Number(draft) || value)); setDraft(String(next)); if (value !== next) onSave(next) }} />
}

function SaveStatus({ user, state, onFix }) {
  if (state?.state === 'conflict' || state?.state === 'error') {
    return <button type="button" className="save-status save-error" title={state.message} onClick={onFix}><CloudAlert size={17} /> 저장 확인</button>
  }
  if (state?.state === 'saving') return <span className="save-status" role="status"><Cloud size={17} /> 저장 중…</span>
  if (!user) return <span className="save-status" role="status"><Cloud size={17} /> 이 기기에 저장</span>
  return <span className="save-status save-ok" role="status"><CloudCheck size={17} /> 클라우드에 저장됨</span>
}

function PrintManuscript({ book }) {
  const paper = PAPERS[book.layout.paper]
  const { top, right, bottom, left } = book.layout.margins
  return (
    <section className="print-manuscript" style={paperStyle(book.layout)}>
      <style media="print">{'@page { size: ' + paper.width + 'mm ' + paper.height + 'mm; margin: ' + [top, right, bottom, left].map(value => value + 'mm').join(' ') + '; }'}</style>
      <div className="print-title"><h1>{book.title}</h1></div>
      {book.chapters.map((chapter, index) => (
        <article className="print-chapter" key={chapter.id}>
          <span className="chapter-kicker">제 {index + 1}장</span>
          <h2>{chapter.title}</h2>
          <div className="paper-body" dangerouslySetInnerHTML={{ __html: generateHTML(chapter.content, writingExtensions) }} />
        </article>
      ))}
    </section>
  )
}

export function WritingEditor({ book, chapter, library, onBack, onAccount, onSaveStatus }) {
  const [inspect, setInspect] = useState(false)
  const [chaptersOpen, setChaptersOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [printing, setPrinting] = useState(null)
  const [focusChapter, setFocusChapter] = useState(null)
  const callbacks = useRef({})
  const lastCursor = useRef(book.cursor)
  const documentKey = chapter.id + ':' + (library.versions[book.id] ?? 0)
  const initial = useMemo(() => ({ cursor: book.cursor, content: chapter.content }), [documentKey])
  useEffect(() => { lastCursor.current = initial.cursor }, [initial])

  const patch = updater => library.update(book.id, updater)
  const chapterIndex = book.chapters.findIndex(item => item.id === chapter.id)

  callbacks.current = {
    update(editor) {
      const { anchor, head } = editor.state.selection
      const cursor = { anchor, head }
      lastCursor.current = cursor
      patch(current => ({
        ...current,
        chapters: current.chapters.map(item => item.id === chapter.id ? { ...item, content: editor.getJSON() } : item),
        cursor: current.activeChapterId === chapter.id ? cursor : current.cursor,
      }))
    },
    cursor(editor) {
      const { anchor, head } = editor.state.selection
      if (anchor === lastCursor.current?.anchor && head === lastCursor.current?.head) return
      const cursor = { anchor, head }
      lastCursor.current = cursor
      library.update(book.id, current => current.activeChapterId === chapter.id ? { ...current, cursor } : current, { touch: false })
    },
  }
  const editor = useEditor({
    extensions: writingExtensions,
    content: initial.content,
    shouldRerenderOnTransaction: false,
    editorProps: { attributes: { 'aria-label': '장 본문', 'aria-multiline': 'true', role: 'textbox', spellcheck: 'true' } },
    onUpdate: ({ editor: current }) => callbacks.current.update(current),
    onSelectionUpdate: ({ editor: current, transaction }) => {
      if (current.isFocused && !transaction.docChanged) callbacks.current.cursor(current)
    },
    onCreate: ({ editor: current }) => {
      const cursor = initial.cursor
      if (!cursor || current.isDestroyed) return
      const { doc, tr } = current.state
      const max = doc.content.size
      const selection = TextSelection.between(doc.resolve(Math.min(cursor.anchor, max)), doc.resolve(Math.min(cursor.head, max)))
      current.view.dispatch(tr.setSelection(selection))
      requestAnimationFrame(() => {
        if (!current.isDestroyed) {
          const { node } = current.view.domAtPos(selection.head)
          const element = node instanceof HTMLElement ? node : node.parentElement
          element?.scrollIntoView({ block: 'nearest' })
        }
      })
    },
  }, [documentKey])

  useEffect(() => {
    if (!printing) return
    let alive = true
    document.fonts.ready.then(() => requestAnimationFrame(() => {
      if (alive) { window.print(); setPrinting(null) }
    }))
    return () => { alive = false }
  }, [printing])

  const counts = useMemo(() => [characterCount(chapter.content), characterCount(chapter.content, true), bookCharacters(book)], [chapter.content, book.chapters])
  const paper = PAPERS[book.layout.paper]
  const { top, right, bottom, left } = book.layout.margins
  const articleStyle = {
    ...paperStyle(book.layout),
    '--trim-width': paper.width + 'mm', '--trim-height': paper.height + 'mm',
    '--m-top': top + 'mm', '--m-right': right + 'mm', '--m-bottom': bottom + 'mm', '--m-left': left + 'mm',
  }

  function selectChapter(id) {
    if (id !== chapter.id) patch(current => ({ ...current, cursor: null, activeChapterId: id }))
  }

  function addChapter() {
    if (book.chapters.length >= 200) return
    const item = newChapter('제목 없는 장')
    setFocusChapter(item.id)
    patch(current => ({ ...current, chapters: [...current.chapters, item], activeChapterId: item.id, cursor: null }))
  }

  function moveChapter(direction) {
    patch(current => {
      const from = current.chapters.findIndex(item => item.id === chapter.id)
      const to = from + direction
      if (from < 0 || to < 0 || to >= current.chapters.length) return current
      const steps = [...current.chapters]
      ;[steps[from], steps[to]] = [steps[to], steps[from]]
      return { ...current, chapters: steps }
    })
  }

  function deleteChapter() {
    patch(current => {
      if (current.chapters.length <= 1) return current
      const chapters = current.chapters.filter(item => item.id !== chapter.id)
      return { ...current, chapters, activeChapterId: chapters[Math.min(chapterIndex, chapters.length - 1)].id, cursor: null }
    })
    setConfirmDelete(false)
  }

  return (
    <>
      <div className="editor-app">
        <header className="editor-header">
          <div className="editor-header-left">
            <button type="button" className="icon-button rail-toggle" aria-label="장 목록 열기" aria-expanded={chaptersOpen} onClick={() => setChaptersOpen(!chaptersOpen)}><ListTree size={21} /></button>
            <button type="button" className="back-button" onClick={onBack}><ArrowLeft size={18} /><span>내 서재</span></button>
            <span className="header-divider" />
            <NameInput value={book.title} label="책 제목" className="editor-book-title" onSave={title => patch(current => ({ ...current, title }))} />
          </div>
          <div className="editor-header-right">
            <SaveStatus user={library.user} state={library.statuses[book.id]} onFix={onSaveStatus} />
            <button className="button button-secondary editor-action" type="button" onClick={() => setInspect(!inspect)} aria-pressed={inspect} title="판형 설정" aria-label="판형 설정">
              <SlidersHorizontal size={17} /> <span>판형 설정</span>
            </button>
            <button className="button button-secondary editor-action" type="button" onClick={() => setPrinting(book)} title="인쇄 또는 PDF 저장" aria-label="인쇄 또는 PDF 저장">
              <Printer size={17} /> <span>인쇄</span>
            </button>
            <AccountButton user={library.user} onClick={onAccount} ready={library.ready} />
          </div>
        </header>
        <Toolbar editor={editor} layout={book.layout} />
        <main className={'workbench' + (inspect ? ' inspector-open' : '')}>
          <ChapterRail book={book} chapter={chapter} open={chaptersOpen} onClose={() => setChaptersOpen(false)}
            onSelect={selectChapter} onAdd={addChapter} onMove={moveChapter} onDelete={() => setConfirmDelete(true)} />
          {chaptersOpen && <button type="button" className="rail-backdrop" aria-label="장의 목록 닫기" onClick={() => setChaptersOpen(false)} />}
          <div className="paper-stage" key={chapter.id}>
            <article className="paper-article" style={articleStyle}>
              <span className="chapter-kicker">제 {chapterIndex + 1}장</span>
              <NameInput value={chapter.title} label="장 제목" className="editor-chapter-title" autoFocus={chapter.id === focusChapter}
                onSave={title => patch(current => ({
                  ...current,
                  chapters: current.chapters.map(item => item.id === chapter.id ? { ...item, title } : item),
                }))} />
              <EditorContent className="paper-body" editor={editor} />
            </article>
          </div>
          {inspect && <Inspector book={book} onClose={() => setInspect(false)}
            onLayout={partial => patch(current => ({ ...current, layout: { ...current.layout, ...partial } }))}
            onCover={cover => patch(current => ({ ...current, cover }))} />}
        </main>
        <footer className="editor-footer">
          <span><FileText size={14} /> {TEMPLATES[book.template].name} · {paper.width} × {paper.height} mm</span>
          <span>현재 장 {formatNumber.format(counts[0])}자 <small>(공백 포함 {formatNumber.format(counts[1])}자)</small> <i /> 전체 {formatNumber.format(counts[2])}자</span>
        </footer>
      </div>
      {printing && <PrintManuscript book={printing} />}
      {confirmDelete && <Dialog title="현재 장을 삭제할까요?" description={'“' + chapter.title + '”의 제목과 본문을 삭제합니다.'} onClose={() => setConfirmDelete(false)}>
        <div className="dialog-actions">
          <button type="button" className="button button-secondary" onClick={() => setConfirmDelete(false)}>취소</button>
          <button type="button" className="button button-danger" onClick={deleteChapter}>장 삭제</button>
        </div>
      </Dialog>}
    </>
  )
}
