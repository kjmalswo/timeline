import { Dialog } from './dialogs.jsx'
import { FONTS } from './catalog.js'
import { handleDraftHistory, HistoryButtons, useDraftHistory } from './history-controls.jsx'
import { chapterLabel, chapterNumber, headingAlignments, headingDefaults, headingSize, headingStyle } from './chapter-heading.js'

const alignmentLabels = ['왼쪽', '가운데', '오른쪽']

export function ChapterHeading({ chapter, index }) {
  const label = chapterLabel(chapter, index)
  if (!label && !chapter.title) return null
  return <header className="chapter-heading">
    {label && <span className="chapter-kicker" style={headingStyle(chapter.heading?.labelStyle)}>{label}</span>}
    {chapter.title && <h2 className="chapter-display-title" style={headingStyle(chapter.heading?.titleStyle)}>{chapter.title}</h2>}
  </header>
}

function HeadingFields({ style, type, onChange }) {
  return <div className="chapter-heading-fields">
    <label className="field">정렬
      <select value={style.align ?? 'left'} onChange={event => onChange('align', event.target.value)}>
        {headingAlignments.map((value, index) => <option key={value} value={value}>{alignmentLabels[index]}</option>)}
      </select>
    </label>
    <label className="field">크기 (pt)
      <input type="number" min={headingSize.min} max={headingSize.max} step="0.5" value={style.fontSize ?? ''}
        placeholder={headingDefaults[type].fontSize} onChange={event => onChange('fontSize', event.target.valueAsNumber || undefined)} />
    </label>
    <label className="field">글꼴
      <select value={style.font ?? ''} onChange={event => onChange('font', event.target.value || undefined)}>
        <option value="">기본 글꼴</option>
        {Object.entries(FONTS).map(([value, font]) => <option key={value} value={value}>{font.name}</option>)}
      </select>
    </label>
    <label className="field">글자색
      <input type="color" value={style.color ?? headingDefaults[type].color} onChange={event => onChange('color', event.target.value)} />
    </label>
    <label className="chapter-heading-bold"><input type="checkbox" checked={style.bold ?? true}
      onChange={event => onChange('bold', event.target.checked)} /> 굵게</label>
  </div>
}

export function ChapterHeadingDialog({ chapter, index, onSave, onClose }) {
  const history = useDraftHistory(() => ({ title: chapter.title, label: chapter.heading?.label ?? null,
    labelStyle: chapter.heading?.labelStyle ?? {}, titleStyle: chapter.heading?.titleStyle ?? {} }))
  const { title, label, labelStyle, titleStyle } = history.value

  function changeText(key, value, group) {
    history.change(current => current[key] === value ? current : { ...current, [key]: value }, { group })
  }

  function changeStyle(type, field, value) {
    history.change(current => ({ ...current, [type]: { ...current[type], [field]: value } }),
      { group: ['fontSize', 'color'].includes(field) ? `${type}:${field}` : undefined })
  }

  return <Dialog title="장 번호·제목 편집" description="각 줄의 문구를 비워 두면 원고에서 해당 줄이 숨겨져요."
    className="chapter-heading-dialog" onClose={onClose} onKeyDown={event => handleDraftHistory(event, history.step)}>
    <form onSubmit={event => {
      event.preventDefault()
      onSave({ title: title.trim(), heading: { label: label?.trim() ?? null, labelStyle, titleStyle } })
    }}>
      <HistoryButtons canUndo={history.canUndo} canRedo={history.canRedo} onStep={history.step} />
      <fieldset>
        <legend>윗줄</legend>
        <div className="chapter-label-row">
          <label className="field">장 번호 또는 문구
            <input maxLength={160} value={label ?? chapterNumber(index)} onChange={event => changeText('label', event.target.value, 'label')} />
          </label>
          <button type="button" className="button button-secondary" disabled={label === null} onClick={() => changeText('label', null)}>자동 번호</button>
        </div>
        <HeadingFields style={labelStyle} type="labelStyle" onChange={(field, value) => changeStyle('labelStyle', field, value)} />
      </fieldset>
      <fieldset>
        <legend>아래 줄</legend>
        <label className="field">장 제목
          <input maxLength={160} value={title} onChange={event => changeText('title', event.target.value, 'title')} />
        </label>
        <HeadingFields style={titleStyle} type="titleStyle" onChange={(field, value) => changeStyle('titleStyle', field, value)} />
      </fieldset>
      <div className="dialog-actions">
        <button type="button" className="button button-secondary" onClick={onClose}>취소</button>
        <button type="submit" className="button button-primary">적용</button>
      </div>
    </form>
  </Dialog>
}
