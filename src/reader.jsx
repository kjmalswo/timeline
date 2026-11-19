import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, BookOpen, FileUp, LibraryBig, RefreshCw } from 'lucide-react'
import { request } from './api-request.js'
import { BookReader } from './book-reader.jsx'
import { BookCover } from './dashboard.jsx'
import { isReadableBook, readingCopy, shareLinkPattern } from './reader-book.js'
import './reader.css'

function ReaderMessage({ title, description, onBack, action, busy }) {
  return <main className="reader-message">
    <span className="reader-home-mark"><BookOpen size={27} /></span>
    <h1 role={busy ? 'status' : undefined}>{title}</h1>
    {description && <p>{description}</p>}
    <div className="reader-message-actions">
      <button type="button" className="button button-secondary" onClick={onBack}><ArrowLeft size={16} /> 리더 홈</button>
      {action}
    </div>
  </main>
}

function SharedReader({ token, onBack }) {
  const [state, setState] = useState({})
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!shareLinkPattern.test(token)) {
      setState({ missing: true })
      return
    }
    const controller = new AbortController()
    request('/shares/' + token, 'GET', undefined, false, controller.signal)
      .then(result => setState({ book: result.book }))
      .catch(error => { if (!controller.signal.aborted) setState({ missing: error.status === 404, error: true }) })
    return () => controller.abort()
  }, [token, attempt])

  if (state.book) return <BookReader book={state.book} identity={'shared.' + token} onBack={onBack} />
  if (state.missing) return <ReaderMessage title="공유된 책을 열 수 없어요" description="링크 주소와 공유 상태를 확인해 주세요." onBack={onBack} />
  if (state.error) return <ReaderMessage title="책을 불러오지 못했어요" description="인터넷 연결을 확인한 뒤 다시 시도해 주세요." onBack={onBack}
    action={<button type="button" className="button button-primary" onClick={() => { setState({}); setAttempt(value => value + 1) }}><RefreshCw size={16} /> 다시 시도</button>} />
  return <ReaderMessage title="공유된 책을 여는 중…" onBack={onBack} busy />
}

function ReaderHome({ books, accountId, ready, localBook, onRead, onLocalRead, onOpenFile, onLibrary, onLogin }) {
  const input = useRef(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const completeBooks = accountId ? books.filter(book => !book.example && isReadableBook(book)) : []
  const open = useRef(false)
  useEffect(() => { open.current = true; return () => { open.current = false } }, [])

  async function importFile(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || busy) return
    setBusy(true)
    setError('')
    try {
      const { readEpub } = await import('./epub-reader.js')
      const book = await readEpub(file)
      if (open.current) onOpenFile(book, `${file.name}.${file.size}.${file.lastModified}`)
    } catch (failure) {
      if (open.current) setError(failure.message || 'EPUB 파일을 열 수 없어요.')
    } finally {
      if (open.current) setBusy(false)
    }
  }

  return <div className="reader-home">
    <header className="reader-home-top">
      <div className="reader-home-brand"><BookOpen size={21} /> 여백 리더</div>
      <button type="button" className="reader-back" onClick={onLibrary}><ArrowLeft size={16} /> 내 서재</button>
    </header>
    <main className="reader-home-main">
      <section className="reader-home-intro">
        <div>
          <h1>리더</h1>
          <p>완성된 책을 펼치거나 받은 EPUB 파일을 열어 보세요.</p>
          <input type="file" ref={input} accept=".epub,application/epub+zip" hidden onChange={importFile} />
          <button type="button" className="button button-primary" disabled={busy} onClick={() => input.current.click()}>
            <FileUp size={17} /> {busy ? 'EPUB을 읽는 중…' : 'EPUB 파일 열기'}</button>
          {error && <p className="form-error" role="alert">{error}</p>}
        </div>
        <div className="reader-home-art" aria-hidden="true" />
      </section>
      {localBook && <section className="reader-home-local" aria-label="불러온 EPUB">
        <div><strong>{localBook.title}</strong>{localBook.author && <p>{localBook.author}</p>}</div>
        <button type="button" className="text-button" onClick={onLocalRead}>리더에서 읽기 <ArrowRight size={16} /></button>
      </section>}
      <section className="reader-home-shelf" aria-labelledby="reader-shelf-title">
        <h2 id="reader-shelf-title">내가 완성한 책</h2>
        {!ready ? <p role="status">서재를 불러오는 중…</p> : !accountId ? <button type="button" className="text-button" onClick={onLogin}>로그인하고 내 책 열기 <ArrowRight size={16} /></button> :
          completeBooks.length ? <div className="reader-library-books">
            {completeBooks.map(book => <button key={book.id} type="button" className="reader-library-book" onClick={() => onRead(book.id)}>
              <span className={'reader-library-cover stage-' + book.cover}><BookCover book={book} /></span>
              <strong>{book.title}</strong><small>리더에서 읽기 <ArrowRight size={14} /></small>
            </button>)}
          </div> : <p>편집기에서 초고 완료로 표시하면 이곳에서 책을 열 수 있어요.</p>}
      </section>
    </main>
  </div>
}

export function ReaderWorkspace({ route, accountId, ready, books, onNavigate, onLogin }) {
  const [file, setFile] = useState(null)
  const selected = accountId && route.view === 'read' ? books.find(book => book.id === route.id && isReadableBook(book)) : null
  const ownBook = useMemo(() => selected ? readingCopy(selected) : null, [selected])
  const back = () => onNavigate('reader')

  useEffect(() => {
    if (!ownBook && (route.view !== 'read-file' || !file)) document.title = '여백 리더'
  }, [route.view, ownBook, file])

  if (route.view === 'shared') return <SharedReader key={route.id} token={route.id} onBack={back} />
  if (route.view === 'read-file' && file) return <BookReader key={file.identity} {...file} onBack={back} />
  if (route.view === 'read') {
    if (ownBook) {
      const identity = `account.${accountId}.${selected.id}`
      return <BookReader key={identity} book={ownBook} identity={identity} onBack={back} />
    }
    return <ReaderMessage title={ready ? '이 책을 열 수 없어요' : '책을 여는 중…'} busy={!ready} onBack={back}
      description={ready ? (accountId ? '서재에서 초고 완료로 표시된 책을 열어 보세요.' : '내 책을 열려면 로그인해 주세요.') : undefined}
      action={ready && !accountId && <button type="button" className="button button-primary" onClick={onLogin}>로그인</button>} />
  }
  return <ReaderHome books={books} accountId={accountId} ready={ready} localBook={file?.book}
    onRead={id => onNavigate('read', id)} onLocalRead={() => onNavigate('read-file')}
    onOpenFile={(book, id) => { setFile({ book, identity: 'file.' + id }); onNavigate('read-file') }}
    onLibrary={() => onNavigate('library')} onLogin={onLogin} />
}
