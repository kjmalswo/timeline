import { useEffect, useRef, useState } from 'react'
import { BookOpen, Check, Copy, Link2 } from 'lucide-react'
import { request } from './api-request.js'
import { relativeDate } from './catalog.js'
import { Dialog } from './dialogs.jsx'

export function ShareDialog({ book, accountId, onPublish, onClose }) {
  const [share, setShare] = useState(null)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [attempt, setAttempt] = useState(0)
  const linkField = useRef(null)
  const api = '/books/' + book.id + '/share'
  const link = share ? new URL('#/shared/' + share.token, window.location.href).href : ''

  useEffect(() => {
    const controller = new AbortController()
    request(api, 'GET', undefined, false, controller.signal)
      .then(result => { setShare(result.share); setLoaded(true) })
      .catch(failure => { if (!controller.signal.aborted) setError(failure.status ? failure.message : '공유 정보를 불러오지 못했어요.') })
    return () => controller.abort()
  }, [api, attempt])

  async function changeShare(revoke = false) {
    setBusy(true)
    setError('')
    setFeedback('')
    try {
      const result = revoke ? await request(api, 'DELETE', { accountId }) : await onPublish(book.id)
      setShare(result.share)
      setFeedback(revoke ? '공유 링크를 닫았어요.' : share ? '공유본을 업데이트했어요.' : '공유 링크를 만들었어요.')
    } catch (failure) {
      setError(failure.message || '공유를 완료할 수 없어요.')
    } finally {
      setBusy(false)
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link)
      setFeedback('공유 링크를 복사했어요.')
    } catch {
      linkField.current?.focus()
      linkField.current?.select()
      setFeedback('링크를 선택했어요. 복사해서 전달하세요.')
    }
  }

  return <Dialog title="원고 공유" description="링크를 받은 사람은 로그인 없이 표지와 본문을 읽을 수 있어요."
    className="share-dialog" onClose={() => { if (!busy) onClose() }}>
    <div className="share-book-title"><BookOpen size={17} /> <strong>{book.title}</strong></div>
    {!loaded && !error && <p className="dialog-description" role="status">공유 정보를 불러오는 중…</p>}
    {share && <>
      <label className="field share-url">공유 링크
        <input ref={linkField} readOnly value={link} onFocus={event => event.target.select()} />
      </label>
      <div className="share-link-actions">
        <button type="button" className="button button-primary" disabled={busy} onClick={copyLink}><Copy size={16} /> 링크 복사</button>
        <a className="button button-secondary" href={link} target="_blank" rel="noopener"><BookOpen size={16} /> 리더에서 읽기</a>
      </div>
      <p className="dialog-description">{relativeDate(share.publishedAt)} 공유 · 최신 원고를 반영하려면 공유본을 업데이트하세요.</p>
    </>}
    {feedback && <p className="share-feedback" role="status"><Check size={15} /> {feedback}</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="dialog-actions">
      {loaded && share && <button type="button" className="button button-secondary" disabled={busy} onClick={() => changeShare(true)}>공유 중지</button>}
      {loaded && <button type="button" className={share ? 'button button-secondary' : 'button button-primary'} disabled={busy}
        onClick={() => changeShare()}><Link2 size={16} /> {busy ? '처리 중…' : share ? '공유본 업데이트' : '공유 링크 만들기'}</button>}
      {!loaded && error && <button type="button" className="button button-secondary" onClick={() => { setError(''); setAttempt(count => count + 1) }}>다시 시도</button>}
    </div>
  </Dialog>
}
