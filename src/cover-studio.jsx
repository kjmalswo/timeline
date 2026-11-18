import { useEffect, useRef, useState } from 'react'
import {
  ArrowDown, ArrowUp, FlipHorizontal2, ImagePlus, Layers, MousePointer2, Paintbrush, Save, Trash2, Type, Undo2,
} from 'lucide-react'
import { COVERS, FONTS, newId, PAPERS } from './catalog.js'
import { CoverArtwork } from './cover-artwork.jsx'
import { Dialog } from './dialogs.jsx'
import {
  COVER_LAYER_LIMIT, COVER_STROKE_LIMIT, COVER_TEXT_LIMIT, STROKE_POINT_LIMIT, coverLayerName,
  initialCover, photoLayer, textLayer,
} from './cover-model.js'
import { BOOK_PHOTO_LIMIT, bookPhotoLength, importPhoto, PHOTO_ACCEPT } from './media.js'
import { isSaveShortcut } from './keyboard.js'

const limit = (value, min, max) => Math.max(min, Math.min(max, value))
const stepPoint = value => Math.round(value * 100) / 100

function RangeField({ label, value, min, max, onChange, suffix = '', step = 1 }) {
  const display = Math.round(value / step) * step
  return <label className="cover-range">
    <span>{label}<output>{Number(display.toFixed(2))}{suffix}</output></span>
    <input type="range" min={min} max={max} step={step} value={value} onChange={event => onChange(Number(event.target.value))} />
  </label>
}

function LayerFields({ layer, onChange }) {
  const photo = layer.type === 'photo'
  return <>
    {photo ? (
      <>
        <label className="field">사진 맞춤
          <select value={layer.fit} onChange={event => onChange({ fit: event.target.value })}>
            <option value="contain">전체 보여주기</option>
            <option value="cover">프레임 채우기 (자르기)</option>
          </select>
        </label>
        {layer.fit === 'cover' && <>
          <RangeField label="자르기 위치 (가로)" value={layer.cropX} min={0} max={100} suffix="%" onChange={cropX => onChange({ cropX })} />
          <RangeField label="자르기 위치 (세로)" value={layer.cropY} min={0} max={100} suffix="%" onChange={cropY => onChange({ cropY })} />
        </>}
        <RangeField label="밝기" value={Math.round(layer.brightness * 100)} min={40} max={160} suffix="%" onChange={value => onChange({ brightness: value / 100 })} />
        <button className="button button-secondary cover-flip" type="button" aria-pressed={layer.flip}
          onClick={() => onChange({ flip: !layer.flip })}><FlipHorizontal2 size={15} /> 좌우 반전</button>
      </>
    ) : (
      <>
        <label className="field">{layer.role === 'title' ? '표지 제목' : '저자명'}
          <input value={layer.text} maxLength={COVER_TEXT_LIMIT} onChange={event => onChange({ text: event.target.value })} />
        </label>
        <div className="cover-field-pair">
          <label className="field">글꼴
            <select value={layer.font} onChange={event => onChange({ font: event.target.value })}>
              {Object.entries(FONTS).map(([key, font]) => <option key={key} value={key}>{font.name}</option>)}
            </select>
          </label>
          <label className="field">글자색<input type="color" value={layer.color} onChange={event => onChange({ color: event.target.value })} /></label>
        </div>
        <div className="cover-field-pair">
          <label className="field">정렬
            <select value={layer.align} onChange={event => onChange({ align: event.target.value })}>
              <option value="left">왼쪽</option><option value="center">가운데</option><option value="right">오른쪽</option>
            </select>
          </label>
          <label className="cover-check"><input type="checkbox" checked={layer.bold} onChange={event => onChange({ bold: event.target.checked })} /> 굵게</label>
        </div>
        <RangeField label="글자 크기" value={layer.size} min={2} max={22} step={0.5} suffix="%" onChange={size => onChange({ size })} />
      </>
    )}
    <RangeField label="가로 크기" value={layer.w} min={4} max={100} suffix="%" onChange={w => onChange({ w })} />
    {photo && <RangeField label="세로 크기" value={layer.h} min={4} max={100} suffix="%" onChange={h => onChange({ h })} />}
    <div className="cover-field-pair">
      <RangeField label="가로 위치" value={layer.x} min={0} max={100} suffix="%" onChange={x => onChange({ x })} />
      <RangeField label="세로 위치" value={layer.y} min={0} max={100} suffix="%" onChange={y => onChange({ y })} />
    </div>
    <RangeField label="회전" value={layer.angle} min={-180} max={180} suffix="°" onChange={angle => onChange({ angle })} />
    <RangeField label="불투명도" value={Math.round(layer.opacity * 100)} min={0} max={100} suffix="%" onChange={value => onChange({ opacity: value / 100 })} />
  </>
}

export function CoverStudio({ book, onClose, onApply }) {
  const [design, setDesign] = useState(() => book.coverDesign ?? initialCover(book))
  const [selected, setSelected] = useState(null)
  const [tool, setTool] = useState('select')
  const [color, setColor] = useState(COVERS[book.cover].ink)
  const [brush, setBrush] = useState(5)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState([])
  const pointer = useRef(null)
  const fileInput = useRef(null)
  const draft = useRef(design)
  const open = useRef(true)
  const apply = useRef(null)
  const paper = PAPERS[book.layout.paper]
  const layer = design.layers.find(item => item.id === selected)
  const index = design.layers.indexOf(layer)

  function show(next) {
    draft.current = next
    setDesign(next)
  }

  function remember(previous) {
    setHistory(items => [...items.slice(-23), previous])
  }

  function change(next) {
    remember(draft.current)
    show(next)
    setError('')
  }

  function undo() {
    const previous = history.at(-1)
    if (!previous) return
    setHistory(history.slice(0, -1))
    show(previous)
    setError('')
  }

  function choose(id) {
    setSelected(id)
    setTool('select')
  }

  function updateLayer(partial) {
    change({ ...design, layers: design.layers.map(item => item.id === selected ? { ...item, ...partial } : item) })
  }

  function addLayer(item) {
    const current = draft.current
    if (current.layers.length >= COVER_LAYER_LIMIT) {
      setError('표지에 넣을 수 있는 레이어는 최대 ' + COVER_LAYER_LIMIT + '개입니다.')
      return
    }
    change({ ...current, layers: [...current.layers, item] })
    choose(item.id)
  }

  function addText(role) {
    const existing = design.layers.find(item => item.type === 'text' && item.role === role)
    if (existing) choose(existing.id)
    else {
      const text = textLayer(book, role)
      if (design.background) text.color = '#292433'
      addLayer(text)
    }
  }

  async function addPhoto(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setLoading(true)
    setError('')
    try {
      const photo = await importPhoto(file)
      if (!open.current) return
      if (bookPhotoLength(book, draft.current) + photo.src.length > BOOK_PHOTO_LIMIT) {
        throw new Error('이 책의 사진 저장 용량이 가득 찼습니다. 다른 사진을 지운 후 추가해 주세요.')
      }
      addLayer(photoLayer(photo, paper))
    } catch (failure) {
      if (open.current) setError(failure.message)
    } finally {
      if (open.current) setLoading(false)
    }
  }

  function reorder(amount) {
    const layers = [...design.layers]
    layers.splice(index, 1)
    layers.splice(index + amount, 0, layer)
    change({ ...design, layers })
  }

  function remove() {
    change({ ...design, layers: design.layers.filter(item => item.id !== selected) })
    setSelected(null)
  }

  function point(event) {
    const rect = event.currentTarget.getBoundingClientRect()
    return [stepPoint(limit((event.clientX - rect.left) * 100 / rect.width, 0, 100)),
      stepPoint(limit((event.clientY - rect.top) * 100 / rect.height, 0, 100))]
  }

  function begin(event) {
    if (event.button !== 0 || pointer.current) return
    const start = point(event)
    const previous = draft.current
    if (tool === 'brush') {
      const ink = previous.layers.find(item => item.type === 'ink')
      if (ink?.strokes.length >= COVER_STROKE_LIMIT || (!ink && previous.layers.length >= COVER_LAYER_LIMIT)) {
        setError('손그림 레이어의 저장 한도에 도달했습니다. 레이어를 정리한 후 그려 주세요.')
        return
      }
      const id = ink?.id ?? newId()
      const stroke = { color, size: brush, points: [start] }
      const strokes = ink?.strokes ?? []
      const base = ink ? previous.layers : [...previous.layers, { id, type: 'ink', strokes: [] }]
      pointer.current = { pointer: event.pointerId, previous, id, mode: 'brush', base, strokes, stroke }
      show({ ...previous, layers: base.map(item => item.id === id ? { ...item, strokes: [...strokes, stroke] } : item) })
      setSelected(id)
    } else {
      const id = event.target.closest('[data-cover-layer]')?.dataset.coverLayer
      const picked = previous.layers.find(item => item.id === id)
      if (!picked) { setSelected(null); return }
      const mode = event.target.closest('[data-cover-handle]') ? 'resize' : 'move'
      pointer.current = { pointer: event.pointerId, previous, id, mode, start, picked }
      setSelected(id)
    }
    setError('')
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  function move(event) {
    const active = pointer.current
    if (!active || event.pointerId !== active.pointer) return
    const position = point(event)
    if (active.mode === 'brush') {
      const stroke = active.stroke
      const last = stroke.points.at(-1)
      if (stroke.points.length >= STROKE_POINT_LIMIT || Math.hypot(last[0] - position[0], last[1] - position[1]) < 0.18) return
      active.stroke = { ...stroke, points: [...stroke.points, position] }
      show({ ...active.previous, layers: active.base.map(item =>
        item.id === active.id ? { ...item, strokes: [...active.strokes, active.stroke] } : item) })
      return
    }
    const [dx, dy] = [position[0] - active.start[0], position[1] - active.start[1]]
    const item = active.picked
    let updated
    if (active.mode === 'resize') {
      const radians = item.angle * Math.PI / 180
      const aspect = paper.height / paper.width
      const localX = dx * Math.cos(radians) + dy * aspect * Math.sin(radians)
      const localY = dy * Math.cos(radians) - dx / aspect * Math.sin(radians)
      updated = { ...item, w: limit(item.w + localX, 4, 100), ...(item.type === 'photo' ? { h: limit(item.h + localY, 4, 100) } : {}) }
    } else {
      updated = { ...item, x: limit(item.x + dx, 0, 100 - Math.min(item.w, 8)), y: limit(item.y + dy, 0, 96) }
    }
    show({ ...active.previous, layers: active.previous.layers.map(entry => entry.id === active.id ? updated : entry) })
  }

  function end(event) {
    const active = pointer.current
    if (!active || active.pointer !== event.pointerId) return
    pointer.current = null
    if (event.type === 'pointercancel') show(active.previous)
    else if (active.previous !== draft.current) remember(active.previous)
  }

  apply.current = () => {
    if (loading || pointer.current) return
    if (bookPhotoLength(book, draft.current) > BOOK_PHOTO_LIMIT) {
      setError('이 책의 사진 저장 용량이 가득 찼습니다.')
      return
    }
    onApply(draft.current)
  }

  useEffect(() => {
    open.current = true
    function key(event) {
      if (!isSaveShortcut(event)) return
      event.preventDefault()
      if (!event.repeat && !event.isComposing) apply.current()
    }
    window.addEventListener('keydown', key)
    return () => {
      open.current = false
      window.removeEventListener('keydown', key)
    }
  }, [])

  return (
    <Dialog className="cover-workshop" title="표지 편집" onClose={onClose}>
      <div className="cover-tools" role="group" aria-label="표지 도구">
        <button className="button button-secondary" aria-pressed={tool === 'select'} type="button" onClick={() => setTool('select')}><MousePointer2 size={16} /> 선택</button>
        <button className="button button-secondary" aria-pressed={tool === 'brush'} type="button" onClick={() => setTool('brush')}><Paintbrush size={16} /> 붓</button>
        <button className="button button-secondary" type="button" disabled={loading} onClick={() => fileInput.current.click()}><ImagePlus size={16} /> {loading ? '불러오는 중…' : '사진 불러오기'}</button>
        <input type="file" hidden accept={PHOTO_ACCEPT} ref={fileInput} onChange={addPhoto} />
        <button className="button button-secondary" type="button" onClick={() => addText('title')}><Type size={16} /> 제목</button>
        <button className="button button-secondary" type="button" onClick={() => addText('author')}><Type size={16} /> 저자</button>
        <button className="icon-button" type="button" onClick={undo} disabled={!history.length} title="실행 취소" aria-label="실행 취소"><Undo2 size={18} /></button>
      </div>
      {error && <p className="cover-error form-error" role="alert">{error}</p>}
      <div className="cover-workbench">
        <div className={'cover-board' + (tool === 'brush' ? ' cover-board-brush' : '')}>
          <CoverArtwork book={book} design={design} activeId={tool === 'select' ? selected : undefined}
            aria-label="표지 디자인 화면" onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end} />
        </div>
        <aside className="cover-properties" aria-label="표지 레이어와 설정">
          <div className="cover-panel">
            <h3><Layers size={16} /> 레이어</h3>
            <div className="cover-layers">
              {[...design.layers].reverse().map(item => <button type="button" key={item.id} aria-pressed={item.id === selected}
                onClick={() => choose(item.id)} title={coverLayerName(item)}>
                {item.type === 'text' ? <Type size={16} /> : item.type === 'photo' ? <ImagePlus size={16} /> : <Paintbrush size={16} />}
                <span>{coverLayerName(item)}</span>
              </button>)}
            </div>
            <div className="cover-layer-order" role="group" aria-label="레이어 순서와 삭제">
              <button type="button" className="icon-button" aria-label="앞으로 가져오기" title="앞으로 가져오기" disabled={!layer || index === design.layers.length - 1} onClick={() => reorder(1)}><ArrowUp size={17} /></button>
              <button type="button" className="icon-button" aria-label="뒤로 보내기" title="뒤로 보내기" disabled={!layer || index === 0} onClick={() => reorder(-1)}><ArrowDown size={17} /></button>
              <button type="button" className="icon-button" aria-label="레이어 삭제" title="레이어 삭제" disabled={!layer} onClick={remove}><Trash2 size={17} /></button>
            </div>
          </div>
          <div className="cover-panel">
            <h3>{tool === 'brush' ? '붓 설정' : layer && layer.type !== 'ink' ? coverLayerName(layer) + ' 설정' : '표지 배경'}</h3>
            {tool === 'brush' ? <>
              <label className="field">붓 색상<input type="color" value={color} onChange={event => setColor(event.target.value)} /></label>
              <RangeField label="붓 두께" value={brush} min={1} max={32} onChange={setBrush} />
            </> : layer && layer.type !== 'ink' ? <LayerFields layer={layer} onChange={updateLayer} /> : <div className="cover-field-pair">
              <label className="field">배경색<input type="color" value={design.background ?? '#fffdf7'} onChange={event => change({ ...design, background: event.target.value })} /></label>
              <button className="button button-secondary" type="button" disabled={!design.background} onClick={() => change({ ...design, background: null })}>기본 배경</button>
            </div>}
          </div>
        </aside>
      </div>
      <footer className="dialog-actions">
        <button className="button button-secondary" type="button" onClick={onClose}>취소</button>
        <button className="button button-primary" type="button" disabled={loading} onClick={() => apply.current()}><Save size={16} /> 표지 저장</button>
      </footer>
    </Dialog>
  )
}
