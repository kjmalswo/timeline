import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { NodeSelection } from '@tiptap/pm/state'
import { useEditor, useEditorState } from '@tiptap/react'
import {
  AlignCenter, AlignJustify, AlignLeft, AlignRight, ArrowDown, ArrowLeft, ArrowUp, Bold, Book, BookOpen, ChevronDown, Cloud,
  CloudAlert, CloudCheck, FileDown, FileText, Focus, Italic, List, ListOrdered, ListTree, Minus, Paintbrush, Plus, Printer,
  Save, Search, SlidersHorizontal, Trash2, Underline, X,
} from 'lucide-react'
import { bookCharacters, characterCount, COVERS, FONTS, newChapter, PAPERS, TEMPLATES } from './catalog.js'
import { AccountButton } from './dashboard.jsx'
import { Dialog } from './dialogs.jsx'
import { CoverStudio } from './cover-studio.jsx'
import { ChapterFlow } from './chapter-flow.jsx'
import { EditorPhotoTools } from './editor-photo.jsx'
import { isSaveShortcut } from './keyboard.js'
import { HistoryButtons } from './history-controls.jsx'
import { createDocumentSerializer, editPosition, formatEdit, historyRestore, marksChanged, restoreManuscript, typingGroup } from './manuscript-history.js'
import { pixelsPerMillimeter, revealVerticalCaret, WritingSpread } from './spread.jsx'
import { Publication } from './publication.jsx'
import { SpineEditor } from './spine.jsx'
import { WriterDock, WriterPanel, writerShortcut } from './writer-tools.jsx'
import { minZoom, maxZoom } from './writing-view.js'
import { BLOCK_INDENTS, COLORS, DEFAULT_ALIGNMENT, formatSelection, INDENTS, LETTER_SPACINGS, LINE_HEIGHTS, paperStyle, TEXT_SIZES, writingExtensions } from './document.js'

const formatNumber = new Intl.NumberFormat('ko-KR')
const zoomStep = 10

const alignments = [
  [DEFAULT_ALIGNMENT, '양쪽 정렬', AlignJustify], ['left', '왼쪽 정렬', AlignLeft],
  ['center', '가운데 정렬', AlignCenter], ['right', '오른쪽 정렬', AlignRight],
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

function ToolSelect({ label, title = label, value, onChange, options, className = '' }) {
  return (
    <label className={'tool-select ' + className} title={title}>
      <select value={value ?? ''} aria-label={label} onChange={event => onChange(event.target.value)}>
        {options.map(([key, name, disabled]) => <option key={key} value={key} disabled={disabled}>{name}</option>)}
      </select>
      <ChevronDown size={12} aria-hidden="true" />
    </label>
  )
}

function numberOptions(values, label, suffix, active) {
  const configured = typeof active === 'number' && !values.includes(active) ? [...values, active].sort((a, b) => a - b) : values
  return [['', label], ...configured.map(value => [value, String(value) + suffix])]
}

function NumericFormat({ label, values, unit, reading, onChange }) {
  const { selected, base } = reading
  const options = numberOptions(values, `${base}${unit} (기본)`, unit, selected)
    .map(([value, name]) => [value, label + ' ' + name])
  if (selected === 'mixed') options.unshift(['mixed', label + ' 혼합', true])
  return <ToolSelect label={label} title={`${label} · 기본 ${base}${unit}`} value={selected} options={options}
    onChange={value => onChange(value === '' ? null : Number(value))} />
}

function Toolbar({ editor, book, history, onFocusMode }) {
  const { layout } = book
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      if (!current) return null
      const paragraph = current.isActive('heading') ? current.getAttributes('heading') : current.getAttributes('paragraph')
      const selection = current.state.selection
      const image = selection instanceof NodeSelection && selection.node.type.name === 'manuscriptImage' ? selection.node.attrs : null
      return {
        paragraph, image, text: current.getAttributes('textStyle'),
        formats: formatSelection(current.state, layout),
        bold: current.isActive('bold'), italic: current.isActive('italic'), underline: current.isActive('underline'),
        bullets: current.isActive('bulletList'), numbers: current.isActive('orderedList'),
      }
    },
  })
  if (!state) return <div className="toolbar"><HistoryButtons {...history} /></div>

  const chain = () => editor.chain().focus().setMeta(formatEdit, true)
  const mark = attrs => chain().setMark('textStyle', attrs).removeEmptyTextStyle().run()
  const paragraph = attrs => chain().updateAttributes('paragraph', attrs).updateAttributes('heading', attrs).run()
  const numeric = value => value === '' ? null : Number(value)

  return (
    <div className="toolbar" role="group" aria-label="본문 서식">
      <div className="tool-group"><HistoryButtons {...history} /></div>
      <div className="tool-group">
        {alignments.map(([align, label, icon]) => <IconCommand key={align} icon={icon} label={label}
          active={(state.paragraph.align ?? DEFAULT_ALIGNMENT) === align} press={() => paragraph({ align })} />)}
        <IconCommand icon={List} label="글머리 기호" active={state.bullets} press={() => chain().toggleBulletList().run()} />
        <IconCommand icon={ListOrdered} label="번호 목록" active={state.numbers} press={() => chain().toggleOrderedList().run()} />
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
      <EditorPhotoTools editor={editor} book={book} image={state.image} />
      <div className="tool-group textual-tools">
        <NumericFormat label="자간" reading={state.formats.letterSpacing} values={LETTER_SPACINGS} unit=" em"
          onChange={letterSpacing => mark({ letterSpacing })} />
        <NumericFormat label="줄 간격" reading={state.formats.lineHeight} values={LINE_HEIGHTS} unit="배"
          onChange={lineHeight => paragraph({ lineHeight })} />
        <NumericFormat label="첫 줄 들여쓰기" reading={state.formats.firstLine} values={INDENTS} unit="자"
          onChange={firstLine => paragraph({ firstLine })} />
        <ToolSelect label="문단 들여쓰기" value={state.paragraph.blockIndent} options={numberOptions(BLOCK_INDENTS, '들여쓰기', ' 글자', state.paragraph.blockIndent)}
          onChange={value => paragraph({ blockIndent: numeric(value) })} />
      </div>
      <button type="button" className="button button-secondary focus-toggle" title="집중 모드 (Alt+Shift+F)"
        aria-keyshortcuts="Alt+Shift+F" onMouseDown={event => event.preventDefault()} onClick={onFocusMode}>
        <Focus size={17} /> 집중 모드
      </button>
    </div>
  )
}

function NameInput({ value, onSave, onDirty, label, className, autoFocus = false }) {
  const [name, setName] = useState(value)
  useEffect(() => { setName(value) }, [value])
  const next = name.trim() || value
  return (
    <input className={className} aria-label={label} value={name} maxLength={160} autoFocus={autoFocus}
      data-book-draft={name === value ? undefined : next === value ? 'discard' : 'change'}
      onFocus={event => { if (autoFocus) event.target.select() }}
      onChange={event => { setName(event.target.value); onDirty(event.target.value !== value) }}
      onKeyDown={event => {
        if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
          event.preventDefault()
          event.currentTarget.blur()
        }
      }}
      onBlur={() => {
        onDirty(false)
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

function Inspector({ book, onLayout, onCover, onDesignCover, onSpine, onDirty, onClose }) {
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
        <button type="button" className="button button-secondary cover-inspector-button" onClick={onDesignCover}>
          <Paintbrush size={15} /> 표지 직접 편집
        </button>
        <button type="button" className="button button-secondary cover-inspector-button" onClick={onSpine}>
          <Book size={15} /> 책등 편집
        </button>
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
              <MarginInput value={layout.margins[side]} onDirty={onDirty} onSave={value => onLayout({ margins: { ...layout.margins, [side]: value } })} />
            </label>,
          )}
        </div>
      </div>
    </aside>
  )
}

function MarginInput({ value, onSave, onDirty }) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => { setDraft(String(value)) }, [value])
  const next = Math.max(5, Math.min(40, Number(draft) || value))
  return <input type="number" min="5" max="40" value={draft}
    data-book-draft={draft === String(value) ? undefined : next === value ? 'discard' : 'change'}
    onChange={event => { setDraft(event.target.value); onDirty(event.target.value !== String(value)) }}
    onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) event.currentTarget.blur() }}
    onBlur={() => { onDirty(false); setDraft(String(next)); if (value !== next) onSave(next) }} />
}

function SaveStatus({ state, onFix }) {
  if (state?.state === 'conflict' || state?.state === 'error') {
    return <button type="button" className="save-status save-error" title={state.message} onClick={onFix}><CloudAlert size={17} /> 저장 확인</button>
  }
  if (state?.state === 'saving') return <span className="save-status" role="status"><Cloud size={17} /> 저장 중…</span>
  return <span className="save-status save-ok" role="status"><CloudCheck size={17} /> 클라우드에 저장됨</span>
}

function EditorMenu({ label, icon: Icon, items }) {
  const menu = useRef(null)
  useEffect(() => {
    function closeOutside(event) {
      if (!menu.current.contains(event.target)) menu.current.open = false
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [])
  return (
    <details ref={menu} className="dropdown editor-menu" onKeyDown={event => {
      if (event.key !== 'Escape' || !event.currentTarget.open) return
      event.stopPropagation()
      event.currentTarget.open = false
      event.currentTarget.querySelector('summary').focus()
    }}>
      <summary className="button button-secondary editor-action" aria-label={label} title={label}><Icon size={17} /> <span>{label}</span></summary>
      <div className="dropdown-panel">
        {items.map(([name, ItemIcon, action]) => <button type="button" key={name} onClick={event => {
          event.currentTarget.closest('details').open = false
          action()
        }}><ItemIcon size={16} /> {name}</button>)}
      </div>
    </details>
  )
}

function ZoomControls({ zoom, onZoom }) {
  return <div className="zoom-controls" role="group" aria-label="화면 확대 및 축소">
    <button type="button" className="icon-button" aria-label="축소" title="축소" disabled={zoom <= minZoom} onClick={() => onZoom(zoom - zoomStep)}><Minus size={17} /></button>
    <button type="button" className="zoom-reset" aria-label={'현재 ' + zoom + '%, 기본 배율로'} title="기본 배율 (100%)" onClick={() => onZoom(100)}>
      <Search size={16} /><span>{zoom}%</span>
    </button>
    <button type="button" className="icon-button" aria-label="확대" title="확대" disabled={zoom >= maxZoom} onClick={() => onZoom(zoom + zoomStep)}><Plus size={17} /></button>
  </div>
}

export function WritingEditor({ book, chapter, library, writingView, onViewChange, onBack, onAccount, onSaveStatus, onHistory }) {
  const [inspect, setInspect] = useState(false)
  const [writerTool, setWriterTool] = useState(null)
  const [focusMode, setFocusMode] = useState(false)
  const { showSpread, zoom } = writingView
  const [stageWidth, setStageWidth] = useState(0)
  const [coverOpen, setCoverOpen] = useState(false)
  const [spineOpen, setSpineOpen] = useState(false)
  const [saveFlash, setSaveFlash] = useState('')
  const stage = useRef(null)
  const saveTimer = useRef(null)
  const shortcuts = useRef(null)
  const [chaptersOpen, setChaptersOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [output, setOutput] = useState(null)
  const [focusChapter, setFocusChapter] = useState(null)
  const [pendingEdit, setPendingEdit] = useState(false)
  const callbacks = useRef({})
  const editorKeys = useRef(new WeakMap())
  const lastRestore = useRef(null)
  const [serialize] = useState(createDocumentSerializer)
  const documentKey = chapter.id + ':' + (library.versions[book.id] ?? 0)
  const initial = useMemo(() => ({ cursor: book.cursor, content: chapter.content }), [documentKey])
  const replay = library.historyReplay?.id === book.id ? library.historyReplay : null

  const patch = (updater, options) => library.update(book.id, updater, options)
  const chapterIndex = book.chapters.findIndex(item => item.id === chapter.id)

  callbacks.current = {
    history: onHistory,
    edit(current, next, transaction) {
      if (editorKeys.current.get(current) !== documentKey || transaction.getMeta(historyRestore)) return
      const before = current.state
      const changed = !before.doc.eq(next.doc)
      if (changed || marksChanged(before, next, transaction)) {
        const position = editPosition(next, chapter.id)
        patch(book => changed ? {
          ...book,
          chapters: book.chapters.map(item => item.id === chapter.id ? { ...item, content: serialize(next.doc) } : item),
          cursor: position.cursor,
        } : book, {
          beforePosition: editPosition(before, chapter.id), afterPosition: position,
          group: changed ? typingGroup(before, next, transaction, chapter.id) : undefined,
        })
      } else if (current.isFocused && !before.selection.eq(next.selection)) {
        const { anchor, head } = next.selection
        patch(book => book.activeChapterId === chapter.id ? { ...book, cursor: { anchor, head } } : book, { record: false })
      }
    },
  }
  const editor = useEditor({
    extensions: writingExtensions,
    content: initial.content,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: { 'aria-label': '장 본문', 'aria-multiline': 'true', role: 'textbox', spellcheck: 'true' },
      handleDOMEvents: { beforeinput: (_view, event) => {
        if (!['historyUndo', 'historyRedo'].includes(event.inputType)) return false
        event.preventDefault()
        callbacks.current.history(event.inputType === 'historyUndo' ? 'undo' : 'redo')
        return true
      } },
    },
    onBeforeCreate: ({ editor: current }) => {
      editorKeys.current.set(current, documentKey)
      current.on('beforeTransaction', ({ nextState, transaction }) => callbacks.current.edit(current, nextState, transaction))
    },
  }, [documentKey])

  useLayoutEffect(() => {
    if (!editor || editor.isDestroyed || editorKeys.current.get(editor) !== documentKey) return
    const fresh = lastRestore.current?.editor !== editor
    const restore = replay && replay !== lastRestore.current?.replay
    if (!fresh && !restore) return
    lastRestore.current = { editor, replay }
    const position = restore && replay.position?.chapterId === chapter.id ? replay.position : null
    restoreManuscript(editor, {
      content: !fresh && restore && serialize(editor.state.doc) !== chapter.content ? chapter.content : null,
      position,
      cursor: position ? position.cursor : fresh ? initial.cursor : null,
    })
  }, [editor, documentKey, chapter.id, chapter.content, initial, replay, serialize])

  const chapterOrder = book.chapters.map(item => item.id).join('/')
  useLayoutEffect(() => {
    if (!editor || showSpread) return
    const frame = requestAnimationFrame(() => {
      if (editor.isDestroyed) return
      if (initial.cursor || replay?.position || editor.isFocused) revealVerticalCaret(editor)
      else {
        const view = stage.current
        const heading = view.querySelector('[data-current-chapter]')
        const offset = Math.min(120, view.clientHeight * 0.25)
        view.scrollTop += heading.getBoundingClientRect().top - view.getBoundingClientRect().top - offset
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [editor, showSpread, initial, chapterOrder, replay?.position])

  useLayoutEffect(() => {
    const element = stage.current
    const styles = getComputedStyle(element)
    setStageWidth(element.clientWidth - parseFloat(styles.paddingLeft) - parseFloat(styles.paddingRight))
    const observer = new ResizeObserver(([entry]) => setStageWidth(entry.contentRect.width))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    function onKey(event) {
      if (!event.isComposing && !document.querySelector('dialog[open]')) shortcuts.current(event)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      clearTimeout(saveTimer.current)
    }
  }, [])

  function manualSave() {
    const field = document.activeElement
    if (field?.matches('.editor-book-title, .editor-chapter-title, .margin-fields input')) field.blur()
    void library.save(book.id).then(saved => {
      if (!saved || !stage.current) return
      clearTimeout(saveTimer.current)
      setSaveFlash('수동 저장 완료')
      saveTimer.current = setTimeout(() => setSaveFlash(''), 2200)
    })
  }

  function toggleWriterTool(kind) {
    setInspect(false)
    setFocusMode(false)
    setWriterTool(current => current === kind ? null : kind)
  }

  function toggleFocusMode() {
    setChaptersOpen(false)
    setInspect(false)
    setWriterTool(null)
    setFocusMode(current => !current)
    editor?.commands.focus(undefined, { scrollIntoView: false })
  }

  shortcuts.current = event => {
    if (event.defaultPrevented) return
    const kind = writerShortcut(event)
    const command = event.ctrlKey || event.metaKey
    const print = command && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'p'
    const focus = event.altKey && event.shiftKey && !command && event.code === 'KeyF'
    const escape = event.key === 'Escape' && focusMode
    if (!kind && !print && !focus && !escape && !isSaveShortcut(event)) return
    event.preventDefault()
    if (event.repeat) return
    if (kind) toggleWriterTool(kind)
    else if (print) {
      if (document.activeElement?.matches('input')) document.activeElement.blur()
      setOutput('print')
    } else if (focus || escape) toggleFocusMode()
    else manualSave()
  }

  function changeZoom(value) {
    onViewChange({ zoom: Math.max(minZoom, Math.min(maxZoom, value)) })
  }

  const counts = useMemo(() => [characterCount(chapter.content), characterCount(chapter.content, true), bookCharacters(book)], [chapter.content, book.chapters])
  const paper = PAPERS[book.layout.paper]
  const trimWidth = paper.width * pixelsPerMillimeter
  const sheetWidth = Math.min(trimWidth, stageWidth > 0 ? stageWidth : trimWidth)
  const { top, right, bottom, left } = book.layout.margins
  const articleStyle = {
    ...paperStyle(book.layout),
    '--trim-width': paper.width + 'mm', '--trim-height': paper.height + 'mm',
    '--m-top': top + 'mm', '--m-right': right + 'mm', '--m-bottom': bottom + 'mm', '--m-left': left + 'mm',
  }

  function toggleSpread() {
    onViewChange({ showSpread: !showSpread })
    setFocusChapter(null)
  }

  function selectChapter(id) {
    if (id !== chapter.id) patch(current => ({ ...current, cursor: null, activeChapterId: id }), { record: false })
    else stage.current?.querySelector('[data-current-chapter]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }

  function jumpFromNote(id) {
    selectChapter(id)
    if (window.matchMedia('(max-width: 850px)').matches) setWriterTool(null)
  }

  function updateWriterNotes(update, group) {
    patch(current => ({ ...current, writerNotes: update(current.writerNotes ?? []) }), { group })
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
      const writerNotes = current.writerNotes?.map(note => ({
        ...note,
        ...(note.chapterId === chapter.id ? { chapterId: null } : {}),
        ...(note.payoffChapterId === chapter.id ? { payoffChapterId: null } : {}),
      }))
      return { ...current, chapters, writerNotes, activeChapterId: chapters[Math.min(chapterIndex, chapters.length - 1)].id, cursor: null }
    })
    setConfirmDelete(false)
  }

  const manuscript = <ChapterFlow book={book} activeId={chapter.id} editor={editor} onSelect={selectChapter} single={!showSpread}>
    <NameInput value={chapter.title} label="장 제목" className="editor-chapter-title" autoFocus={chapter.id === focusChapter} onDirty={setPendingEdit}
      onSave={title => patch(current => ({
        ...current, chapters: current.chapters.map(item => item.id === chapter.id ? { ...item, title } : item),
      }))} />
  </ChapterFlow>
  const history = { canUndo: library.canUndo || pendingEdit, canRedo: library.canRedo && !pendingEdit, onStep: onHistory }
  const viewAction = showSpread ? '단면 보기' : '양면 보기'

  return (
    <>
      <div className={'editor-app' + (focusMode ? ' editor-focused' : '')}>
        <header className="editor-header">
          <div className="editor-header-left">
            <button type="button" className="icon-button rail-toggle" aria-label="장 목록 열기" aria-expanded={chaptersOpen} onClick={() => setChaptersOpen(!chaptersOpen)}><ListTree size={21} /></button>
            <button type="button" className="back-button" onClick={onBack}><ArrowLeft size={18} /><span>내 서재</span></button>
            <span className="header-divider" />
            <NameInput value={book.title} label="책 제목" className="editor-book-title" onDirty={setPendingEdit}
              onSave={title => patch(current => ({ ...current, title }))} />
          </div>
          <div className="editor-header-right">
            <div className="save-controls">
              <SaveStatus state={library.statuses[book.id]} onFix={onSaveStatus} />
              <button type="button" onClick={manualSave} className="icon-button manual-save-button"
                aria-label="수동 저장" aria-keyshortcuts="Control+S Meta+S" title="수동 저장 (Ctrl+S / ⌘S)"><Save size={17} /></button>
            </div>
            <button className="button button-secondary editor-action paper-view-toggle" type="button" onClick={toggleSpread}
              title={viewAction} aria-label={viewAction}>
              <BookOpen size={17} /> <span>{viewAction}</span>
            </button>
            <button className="button button-secondary editor-action" type="button" onClick={() => { setWriterTool(null); setInspect(!inspect) }}
              aria-pressed={inspect} title="판형 설정" aria-label="판형 설정">
              <SlidersHorizontal size={17} /> <span>판형 설정</span>
            </button>
            <EditorMenu label="표지·책등" icon={Paintbrush} items={[
              ['표지 편집', Paintbrush, () => setCoverOpen(true)], ['책등 편집', Book, () => setSpineOpen(true)],
            ]} />
            <EditorMenu label="인쇄·내보내기" icon={Printer} items={[
              ['인쇄 설정', Printer, () => setOutput('print')], ['내보내기', FileDown, () => setOutput('export')],
            ]} />
            <AccountButton user={library.user} onClick={onAccount} ready={library.ready} />
          </div>
        </header>
        <Toolbar editor={editor} book={book} history={history} onFocusMode={toggleFocusMode} />
        <main className={'workbench' + (inspect ? ' inspector-open' : '')}>
          <ChapterRail book={book} chapter={chapter} open={chaptersOpen} onClose={() => setChaptersOpen(false)}
            onSelect={selectChapter} onAdd={addChapter} onMove={moveChapter} onDelete={() => setConfirmDelete(true)} />
          {chaptersOpen && <button type="button" className="rail-backdrop" aria-label="장의 목록 닫기" onClick={() => setChaptersOpen(false)} />}
          <div className="writing-area">
            <div className="paper-stage" ref={stage}>
              {showSpread ? (
                <WritingSpread editor={editor} paper={paper} layout={book.layout} style={articleStyle} activeId={chapter.id}
                  chapterOrder={chapterOrder} restoreCursor={Boolean(initial.cursor)} zoom={zoom / 100}>{manuscript}</WritingSpread>
              ) : (
                <div className="single-sheet-area" style={{
                  ...articleStyle,
                  '--paper-base-width': sheetWidth + 'px',
                  '--paper-view-width': sheetWidth * zoom / 100 + 'px',
                  '--paper-view-scale': zoom / 100,
                }}>
                  {manuscript}
                </div>
              )}
            </div>
            {saveFlash && <p className="manual-save-feedback" role="status">{saveFlash}</p>}
            <ZoomControls zoom={zoom} onZoom={changeZoom} />
            {focusMode && <div className="focus-history"><HistoryButtons {...history} /></div>}
            {focusMode && <button type="button" className="button button-secondary focus-exit" onClick={toggleFocusMode}>
              <X size={16} /> 집중 모드 종료
            </button>}
          </div>
          {inspect && <Inspector book={book} onClose={() => setInspect(false)} onDirty={setPendingEdit}
            onLayout={partial => patch(current => ({ ...current, layout: { ...current.layout, ...partial } }))}
            onCover={cover => patch(current => ({ ...current, cover }))} onDesignCover={() => setCoverOpen(true)} onSpine={() => setSpineOpen(true)} />}
          {writerTool && <WriterPanel key={writerTool} kind={writerTool} book={book} chapterId={chapter.id}
            onChange={updateWriterNotes} onJump={jumpFromNote} onClose={() => setWriterTool(null)} />}
          <WriterDock active={writerTool} onToggle={toggleWriterTool} />
        </main>
        <footer className="editor-footer">
          <span><FileText size={14} /> {TEMPLATES[book.template].name} · {paper.width} × {paper.height} mm</span>
          <span>현재 장 {formatNumber.format(counts[0])}자 <small>(공백 포함 {formatNumber.format(counts[1])}자)</small> <i /> 전체 {formatNumber.format(counts[2])}자</span>
        </footer>
      </div>
      <Publication book={book} mode={output} onClose={() => setOutput(null)} />
      {coverOpen && <CoverStudio book={book} onClose={() => setCoverOpen(false)} onApply={coverDesign => {
        patch(current => ({ ...current, coverDesign }))
        setCoverOpen(false)
        manualSave()
      }} />}
      {spineOpen && <SpineEditor book={book} onClose={() => setSpineOpen(false)} onApply={spine => {
        patch(current => ({ ...current, spine }))
        setSpineOpen(false)
        manualSave()
      }} />}
      {confirmDelete && <Dialog title="현재 장을 삭제할까요?" description={'“' + chapter.title + '”의 제목과 본문을 삭제합니다.'} onClose={() => setConfirmDelete(false)}>
        <div className="dialog-actions">
          <button type="button" className="button button-secondary" onClick={() => setConfirmDelete(false)}>취소</button>
          <button type="button" className="button button-danger" onClick={deleteChapter}>장 삭제</button>
        </div>
      </Dialog>}
    </>
  )
}
