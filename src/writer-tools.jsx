import { useState } from 'react'
import { ArrowUpRight, CalendarDays, ContactRound, Flag, LockKeyhole, Plus, StickyNote, Trash2, X } from 'lucide-react'
import { newId } from './catalog.js'
import { NOTE_BODY_LIMIT, NOTE_KINDS, NOTE_LIMIT, NOTE_TITLE_LIMIT } from './writer-notes.js'

const tools = {
  memo: { name: '메모', add: '메모 추가', title: '메모 제목', body: '메모 내용', icon: StickyNote },
  character: { name: '등장인물', add: '인물 카드 추가', title: '이름', detail: '역할', body: '성격과 설정', icon: ContactRound },
  timeline: { name: '연표', add: '사건 추가', title: '사건 이름', detail: '시간 또는 날짜', body: '사건 내용', icon: CalendarDays },
  foreshadow: { name: '복선', add: '복선 추가', title: '복선 제목', body: '단서와 회수 계획', icon: Flag },
}

export function writerShortcut(event) {
  if (!event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey) return undefined
  return NOTE_KINDS.find((_, index) => event.code === 'Digit' + (index + 1))
}

export function WriterDock({ active, onToggle }) {
  return <nav className="writer-dock" aria-label="집필 도구 바로가기">
    {NOTE_KINDS.map((kind, index) => {
      const { name, icon: Icon } = tools[kind]
      const key = index + 1
      return <button type="button" key={kind} className="icon-button" aria-label={name} aria-expanded={kind === active}
        aria-keyshortcuts={'Alt+Shift+' + key} title={name + ' (Alt+Shift+' + key + ')'} onClick={() => onToggle(kind)}>
        <Icon size={18} />
      </button>
    })}
  </nav>
}

function ChapterLink({ label, value, chapters, onChange, onJump }) {
  return <div className="writer-chapter-link">
    <label className="field">{label}
      <select value={value ?? ''} onChange={event => onChange(event.target.value || null)}>
        <option value="">연결 안 함</option>
        {chapters.map((item, index) => <option key={item.id} value={item.id}>{index + 1}장 · {item.title}</option>)}
      </select>
    </label>
    <button type="button" className="icon-button" title={label + '으로 이동'} aria-label={label + '으로 이동'}
      disabled={!value} onClick={() => onJump(value)}><ArrowUpRight size={16} /></button>
  </div>
}

export function WriterPanel({ kind, book, chapterId, onChange, onJump, onClose }) {
  const [openNote, setOpenNote] = useState(null)
  const tool = tools[kind]
  const notes = book.writerNotes ?? []
  const entries = notes.filter(note => note.kind === kind)
  const isForeshadow = kind === 'foreshadow'
  if (kind === 'timeline') {
    const dateKey = note => note.id === openNote?.id ? openNote.detail : note.detail
    entries.sort((a, b) => {
      const left = dateKey(a)
      const right = dateKey(b)
      if (!left || !right) return Number(!left) - Number(!right)
      return left.localeCompare(right, 'ko', { numeric: true })
    })
  }

  function addNote() {
    const entry = {
      id: newId(), kind, title: '', body: '', chapterId,
      ...(tool.detail ? { detail: '' } : {}),
      ...(isForeshadow ? { payoffChapterId: null, resolved: false } : {}),
    }
    onChange(current => current.length < NOTE_LIMIT ? [...current, entry] : current)
    setOpenNote({ id: entry.id, detail: entry.detail })
  }

  function updateNote(id, partial) {
    onChange(current => current.map(note => note.id === id ? { ...note, ...partial } : note))
  }

  return <aside className="writer-panel" aria-label={tool.name}>
    <div className="rail-heading"><span><tool.icon size={17} /> {tool.name}</span>
      <button type="button" className="icon-button" onClick={onClose} aria-label={tool.name + ' 닫기'}><X size={18} /></button>
    </div>
    <p className="writer-private"><LockKeyhole size={13} /> 작성자만 볼 수 있어요.</p>
    <button type="button" className="button button-secondary writer-add" disabled={notes.length >= NOTE_LIMIT} onClick={addNote}>
      <Plus size={16} /> {tool.add}
    </button>
    <div className="writer-entries">
      {entries.map(note => {
        const open = openNote?.id === note.id
        const update = partial => updateNote(note.id, partial)
        return <section className="writer-entry" key={note.id}>
          <button type="button" className="writer-entry-toggle" aria-expanded={open}
            onClick={() => setOpenNote(open ? null : { id: note.id, detail: note.detail })}>
            <strong>{note.title.trim() || '제목 없음'}</strong>
            {isForeshadow ? <small>{note.resolved ? '회수 완료' : '미회수'}</small> : note.detail && <small>{note.detail}</small>}
          </button>
          {open && <div className="writer-entry-fields">
            <label className="field">{tool.title}
              <input value={note.title} autoFocus maxLength={NOTE_TITLE_LIMIT} onChange={event => update({ title: event.target.value })} />
            </label>
            {tool.detail && <label className="field">{tool.detail}
              <input value={note.detail} maxLength={NOTE_TITLE_LIMIT} onChange={event => update({ detail: event.target.value })} />
            </label>}
            <label className="field">{tool.body}
              <textarea value={note.body} rows={4} maxLength={NOTE_BODY_LIMIT} onChange={event => update({ body: event.target.value })} />
            </label>
            <ChapterLink label={isForeshadow ? '단서를 심은 장' : '관련 장'} value={note.chapterId} chapters={book.chapters}
              onChange={chapterId => update({ chapterId })} onJump={onJump} />
            {isForeshadow && <>
              <ChapterLink label="회수하는 장" value={note.payoffChapterId} chapters={book.chapters}
                onChange={payoffChapterId => update({ payoffChapterId })} onJump={onJump} />
              <label className="writer-resolved"><input type="checkbox" checked={note.resolved}
                onChange={event => update({ resolved: event.target.checked })} /> 회수 완료</label>
            </>}
            <button type="button" className="text-button writer-delete" onClick={() => onChange(current => current.filter(item => item.id !== note.id))}>
              <Trash2 size={14} /> 삭제
            </button>
          </div>}
        </section>
      })}
    </div>
  </aside>
}
