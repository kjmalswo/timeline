import { useRef, useState } from 'react'
import { ImagePlus, Trash2 } from 'lucide-react'
import { BOOK_PHOTO_LIMIT, bookPhotoLength, importPhoto, PHOTO_ACCEPT } from './media.js'
import { imageRatio } from './manuscript-image.js'

const widths = [15, 25, 40, 55, 65, 75, 90, 100]

export function EditorPhotoTools({ editor, book, image }) {
  const input = useRef(null)
  const latest = useRef(book)
  latest.current = book
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function insert(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setBusy(true)
    setError('')
    try {
      const photo = await importPhoto(file)
      if (editor.isDestroyed) return
      if (bookPhotoLength(latest.current) + photo.src.length > BOOK_PHOTO_LIMIT) {
        throw new Error('이 책의 사진 저장 용량이 가득 찼습니다.')
      }
      const inserted = editor.chain().focus().insertContent({
        type: 'manuscriptImage', attrs: { src: photo.src, alt: photo.alt, ratio: imageRatio(photo.ratio) },
      }).run()
      if (!inserted) setError('사진을 넣을 위치에 커서를 놓고 다시 시도해 주세요.')
    } catch (failure) {
      if (!editor.isDestroyed) setError(failure.message)
    } finally {
      if (!editor.isDestroyed) setBusy(false)
    }
  }

  return <div className="tool-group editor-photo-tools">
    <button type="button" className="icon-button tool-button" disabled={busy} onMouseDown={event => event.preventDefault()}
      onClick={() => input.current.click()} aria-label="본문에 사진 삽입" title="본문에 사진 삽입"><ImagePlus size={18} /></button>
    <input ref={input} type="file" accept={PHOTO_ACCEPT} hidden onChange={insert} />
    {busy && <span className="editor-photo-busy" role="status">사진 불러오는 중…</span>}
    {image && <>
      <select aria-label="본문 사진 크기" title="본문 사진 크기" value={image.width}
        onChange={event => editor.chain().focus().updateAttributes('manuscriptImage', { width: Number(event.target.value) }).run()}>
        {[...new Set([...widths, image.width])].sort((a, b) => a - b).map(width =>
          <option key={width} value={width}>{width}%</option>)}
      </select>
      <select aria-label="본문 사진 정렬" title="본문 사진 정렬" value={image.align}
        onChange={event => editor.chain().focus().updateAttributes('manuscriptImage', { align: event.target.value }).run()}>
        <option value="left">사진 왼쪽</option><option value="center">사진 가운데</option><option value="right">사진 오른쪽</option>
      </select>
      <button type="button" className="icon-button tool-button" onMouseDown={event => event.preventDefault()}
        onClick={() => editor.chain().focus().deleteSelection().run()}
        aria-label="본문 사진 삭제" title="본문 사진 삭제"><Trash2 size={16} /></button>
    </>}
    {error && <button type="button" className="editor-photo-error" role="alert" onClick={() => setError('')}>{error} ×</button>}
  </div>
}
