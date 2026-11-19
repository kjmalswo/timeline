import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowLeft, BookOpen, Cloud, RefreshCw } from 'lucide-react'
import '@fontsource-variable/noto-sans-kr'
import '@fontsource-variable/noto-serif-kr'
import './styles.css'
import './editor.css'
import './cover.css'
import { Dashboard } from './dashboard.jsx'
import { AccountDialog, AuthDialog, ConflictDialog, CreateDialog, Dialog } from './dialogs.jsx'
import { useLibrary } from './library.js'
import { historyShortcut } from './keyboard.js'
import { readWritingView, saveWritingView } from './writing-view.js'
import { ShareDialog } from './share-dialog.jsx'
import { isReadableBook } from './reader-book.js'

const WritingEditor = lazy(() => import('./editor.jsx').then(module => ({ default: module.WritingEditor })))
const ReaderWorkspace = lazy(() => import('./reader.jsx').then(module => ({ default: module.ReaderWorkspace })))
const shelfViews = new Set(['library', 'favorites', 'trash'])
const readerViews = new Set(['reader', 'read', 'shared', 'read-file'])
const protectedViews = new Set(['book', 'read', 'favorites', 'trash'])

function readRoute() {
  const [view, id] = window.location.hash.replace(/^#\/?/, '').split('/')
  if (['book', 'read', 'shared'].includes(view) && id) return { view, id }
  if (readerViews.has(view)) return { view: view === 'read-file' ? view : 'reader' }
  return { view: shelfViews.has(view) ? view : 'library' }
}

function App() {
  const library = useLibrary()
  const [route, setRoute] = useState(readRoute)
  const [modal, setModal] = useState(null)
  const [issueId, setIssueId] = useState(null)
  const [writingView, setWritingView] = useState(readWritingView)
  const currentWritingView = useRef(writingView)

  const writingId = route.view === 'book' ? route.id : null
  const previousBook = useRef(writingId)
  const authRoute = useRef(null)
  const historyAction = useRef(null)

  useEffect(() => {
    function onHashChange() { setRoute(readRoute()) }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  useEffect(() => {
    if (previousBook.current && previousBook.current !== writingId) library.flush(previousBook.current)
    previousBook.current = writingId
  }, [writingId])

  function navigate(view, id) {
    const hash = view === 'library' ? '#/' : '#/' + view + (id ? '/' + id : '')
    if (window.location.hash !== hash) window.location.hash = hash
    setRoute({ view, id })
    window.scrollTo(0, 0)
  }

  function moveHistory(direction) {
    const field = document.activeElement
    if (field?.dataset.bookDraft) {
      const commitDraft = field.dataset.bookDraft === 'change'
      field.blur()
      if (!commitDraft) return
    }
    const change = library.stepHistory(direction)
    if (change?.view) applyWritingView(change.view)
    const changedBook = change?.book
    if (!changedBook || route.view !== 'book') return
    if (changedBook.trashed && changedBook.id === route.id) navigate('library')
    else if (!changedBook.trashed && changedBook.id !== route.id) navigate('book', changedBook.id)
  }

  function applyWritingView(fields) {
    const next = { ...currentWritingView.current, ...fields }
    currentWritingView.current = next
    setWritingView(next)
    saveWritingView(fields)
  }

  function changeWritingView(fields) {
    const previous = Object.fromEntries(Object.keys(fields).map(key => [key, currentWritingView.current[key]]))
    if (Object.keys(fields).every(key => previous[key] === fields[key])) return
    library.recordView(route.id, previous, fields)
    applyWritingView(fields)
  }

  historyAction.current = readerViews.has(route.view) ? null : moveHistory
  useEffect(() => {
    function onHistoryKey(event) {
      const direction = historyShortcut(event)
      if (!historyAction.current || !direction || event.defaultPrevented || document.querySelector('dialog[open]') || event.target?.matches?.('input[type="search"]')) return
      event.preventDefault()
      historyAction.current(direction)
    }
    window.addEventListener('keydown', onHistoryKey, true)
    return () => window.removeEventListener('keydown', onHistoryKey, true)
  }, [])

  function requestRoute(view, id) {
    if (library.user || !protectedViews.has(view)) {
      navigate(view, id)
      return
    }
    authRoute.current = { view, id }
    setModal('auth-route')
  }

  useEffect(() => {
    if (readerViews.has(route.view) && route.view !== 'read') {
      setModal(current => current === 'auth-route' ? null : current)
    } else if (library.ready && !library.user && (protectedViews.has(route.view) || library.needsSignIn)) {
      setModal(current => current ?? 'auth-route')
    }
  }, [library.ready, library.user, library.needsSignIn, route.view, route.id])

  useEffect(() => {
    if (modal !== 'auth-route' || !library.user || !authRoute.current) return
    const { view, id } = authRoute.current
    authRoute.current = null
    setModal(null)
    if (!id || library.books.some(book => book.id === id)) navigate(view, id)
  }, [modal, library.user])

  function requestNewBook() {
    setModal(library.user ? 'create' : 'auth-create')
  }

  useEffect(() => {
    if (modal === 'auth-create' && library.user) setModal('create')
  }, [modal, library.user])

  function openAccount() {
    setModal(library.user ? 'settings' : 'auth')
  }

  function resolveIssue(id) {
    const state = library.statuses[id]
    if (!state) return
    setIssueId(id)
    setModal(state.signIn ? 'auth' : state.state === 'conflict' ? 'conflict' : 'error')
  }

  function showShare(id) {
    setIssueId(id)
    setModal('share')
  }

  const book = library.user && route.view === 'book' ? library.books.find(item => item.id === route.id && !item.trashed) : null
  const chapter = book?.chapters.find(item => item.id === book.activeChapterId) ?? book?.chapters[0]
  const shareBook = modal === 'share' && library.user && library.books.find(item => item.id === issueId && isReadableBook(item) && !item.example)
  const unsaved = Object.values(library.statuses).some(item => ['saving', 'conflict', 'error'].includes(item.state))
  function close() {
    authRoute.current = null
    setModal(null)
  }

  useEffect(() => {
    if (!readerViews.has(route.view)) document.title = book ? book.title + ' — 여백' : '여백 — 집필 스튜디오'
  }, [book?.title, route.view])

  return (
    <>
      {readerViews.has(route.view) ? (
        <Suspense fallback={<main className="missing-book" role="status">리더를 여는 중…</main>}>
          <ReaderWorkspace route={route} accountId={library.user?.id} ready={library.ready} books={library.books}
            onNavigate={navigate} onLogin={openAccount} />
        </Suspense>
      ) : route.view !== 'book' ? (
        <Dashboard library={library} view={library.user ? route.view : 'library'} onNavigate={requestRoute}
          onOpen={id => requestRoute('book', id)} onCreate={requestNewBook} onAccount={openAccount}
          onSaveStatus={resolveIssue} onHistory={moveHistory} onRead={id => requestRoute('read', id)} onShare={showShare} />
      ) : book && chapter ? (
        <Suspense fallback={<main className="missing-book" role="status">편집기를 여는 중…</main>}>
          <WritingEditor key={library.user.id + '/' + book.id} book={book} chapter={chapter} library={library}
            writingView={writingView} onViewChange={changeWritingView} onRead={() => requestRoute('read', book.id)} onShare={() => showShare(book.id)}
            onBack={() => navigate('library')} onAccount={openAccount} onSaveStatus={() => resolveIssue(book.id)} onHistory={moveHistory} />
        </Suspense>
      ) : (
        <main className="missing-book">
          <div className="empty-icon"><BookOpen size={25} /></div>
          <h1>{!library.ready ? '원고를 여는 중…' : '이 원고를 열 수 없어요'}</h1>
          {library.ready && <p>{library.user ? '내 서재나 휴지통에서 책을 찾아보세요.' : '계정에 저장한 책이라면 먼저 로그인해 주세요.'}</p>}
          <div className="dialog-actions">
            <button type="button" className="button button-secondary" onClick={() => navigate('library')}><ArrowLeft size={16} /> 내 서재</button>
            {library.ready && !library.user && <button type="button" className="button button-primary" onClick={openAccount}>로그인</button>}
          </div>
        </main>
      )}
      {shareBook && <ShareDialog key={shareBook.id} book={shareBook} accountId={library.user.id} onPublish={library.publishBook} onClose={close} />}
      {modal === 'create' && library.user && <CreateDialog onClose={close} onCreate={newBook => {
        library.create(newBook)
        close()
        navigate('book', newBook.id)
      }} />}
      {(modal === 'auth' || (library.ready && !library.user && ['auth-create', 'auth-route'].includes(modal))) &&
        <AuthDialog onClose={close} onAuthenticate={library.authenticate} hasDrafts={library.guestHasDrafts}
        description={modal === 'auth-create' ? '새 책을 작성하려면 먼저 로그인하거나 계정을 만들어 주세요.' :
          modal === 'auth-route' ? '책을 열고 서재를 이용하려면 로그인해 주세요.' : undefined}
        onSuccess={({ imported, bookIds }) => {
          if (modal === 'auth-create') {
            setModal('create')
            return
          }
          const target = authRoute.current ?? route
          close()
          if (target.view === 'book' || target.view === 'read') {
            const id = imported.get(target.id) ?? target.id
            if (bookIds.has(id)) navigate(target.view, id)
            else navigate(target.view === 'read' ? 'reader' : 'library')
          } else if (target.view !== 'library') navigate(target.view)
        }} />}
      {modal === 'settings' && <AccountDialog user={library.user} unsaved={unsaved} onClose={close}
        onLogin={() => setModal('auth')} onSignOut={async () => { await library.signOut(); close(); navigate('library') }} />}
      {modal === 'conflict' && <ConflictDialog onClose={close} onResolve={copy => {
        const nextId = library.resolveConflict(issueId, copy)
        close()
        if (nextId && route.view === 'book') navigate('book', nextId)
      }} />}
      {modal === 'error' && <Dialog title="원고를 저장할 수 없어요" description={library.statuses[issueId]?.message ?? '연결을 확인한 뒤 다시 저장해 주세요.'} onClose={close}>
        <div className="dialog-actions">
          <button type="button" className="button button-secondary" onClick={close}>닫기</button>
          {library.user
            ? <button type="button" className="button button-primary" onClick={() => { library.flush(issueId); close() }}><RefreshCw size={16} /> 다시 저장</button>
            : <button type="button" className="button button-primary" onClick={() => setModal('auth')}><Cloud size={16} /> 로그인</button>}
        </div>
      </Dialog>}
    </>
  )
}

createRoot(document.getElementById('root')).render(<App />)
