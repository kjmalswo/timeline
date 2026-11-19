import { FONTS, PAPERS } from './catalog.js'
import { CoverArtwork } from './cover-artwork.jsx'
import { COVER_TEXT_LIMIT, defaultSpine, frontDesign, SPINE_WIDTH_RANGE } from './cover-model.js'
import { Dialog } from './dialogs.jsx'
import { handleDraftHistory, HistoryButtons, useDraftHistory } from './history-controls.jsx'

export function coverSize(book, spine = book.spine ?? defaultSpine(book)) {
  const paper = PAPERS[book.layout.paper]
  return { width: paper.width * 2 + spine.width, height: paper.height }
}

export function FrontCover({ book }) {
  return <CoverArtwork book={book} design={frontDesign(book)} />
}

export function CoverWrap({ book, spine = book.spine ?? defaultSpine(book) }) {
  const title = spine.title.trim() || book.title
  const author = spine.author.trim()
  const paper = PAPERS[book.layout.paper]
  const { width, height } = coverSize(book, spine)
  const characters = Array.from(title + author).length + 4
  const font = Math.min(65, 90 * height / (spine.width * characters))
  return <div className="cover-wrap" aria-label="뒤표지, 책등, 앞표지" style={{
    '--wrap-width': width + 'mm', '--wrap-height': height + 'mm',
    '--wrap-ratio': width / height,
    gridTemplateColumns: `${paper.width}fr ${spine.width}fr ${paper.width}fr`,
  }}>
    <div className="wrap-back" style={{ backgroundColor: spine.background }} />
    <div className="wrap-spine" style={{ backgroundColor: spine.background, color: spine.color }}>
      <div className="spine-lettering" style={{ fontFamily: FONTS[spine.font].family, fontSize: font + 'cqw' }}>
        <strong>{title}</strong>{author && <span>{author}</span>}
      </div>
    </div>
    <FrontCover book={book} />
  </div>
}

export function SpineEditor({ book, onClose, onApply }) {
  const history = useDraftHistory(() => book.spine ?? defaultSpine(book))
  const draft = history.value
  const { min, max } = SPINE_WIDTH_RANGE
  const preview = { ...draft, width: Math.max(min, Math.min(max, Number(draft.width) || min)) }
  const size = coverSize(book, preview)
  function change(field, value, merge = true) {
    history.change(current => current[field] === value ? current : { ...current, [field]: value }, { group: merge ? field : undefined })
  }

  return <Dialog className="spine-dialog" title="책등 편집" onClose={onClose} onKeyDown={event => handleDraftHistory(event, history.step)}>
    <form onSubmit={event => {
      event.preventDefault()
      if (draft === book.spine) onClose()
      else onApply({ ...draft, width: Number(draft.width), title: draft.title.trim(), author: draft.author.trim() })
    }}>
      <HistoryButtons canUndo={history.canUndo} canRedo={history.canRedo} onStep={history.step} />
      <div className="spine-workbench">
        <div className="spine-preview">
          <CoverWrap book={book} spine={preview} />
          <p>뒤표지 · 책등 · 앞표지 <span>{size.width} × {size.height} mm</span></p>
        </div>
        <div className="spine-fields">
          <label className="field">책등 너비 (mm)
            <input type="number" required min={min} max={max} step="0.1" value={draft.width} onChange={event => change('width', event.target.value)} />
          </label>
          <label className="field">제목
            <input value={draft.title} placeholder={book.title} maxLength={COVER_TEXT_LIMIT} onChange={event => change('title', event.target.value)} />
          </label>
          <label className="field">저자명
            <input value={draft.author} maxLength={COVER_TEXT_LIMIT} onChange={event => change('author', event.target.value)} />
          </label>
          <label className="field">글꼴
            <select value={draft.font} onChange={event => change('font', event.target.value, false)}>
              {Object.entries(FONTS).map(([value, { name }]) => <option key={value} value={value}>{name}</option>)}
            </select>
          </label>
          <div className="spine-colors">
            <label className="field">책등 배경색
              <input type="color" value={draft.background} onChange={event => change('background', event.target.value)} />
            </label>
            <label className="field">글자색
              <input type="color" value={draft.color} onChange={event => change('color', event.target.value)} />
            </label>
          </div>
        </div>
      </div>
      <div className="dialog-actions">
        <button type="button" className="button button-secondary" onClick={onClose}>취소</button>
        <button type="submit" className="button button-primary">책등 적용</button>
      </div>
    </form>
  </Dialog>
}
