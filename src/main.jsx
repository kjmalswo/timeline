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

const WritingEditor = lazy(() => import('./editor.jsx').then(module => ({ default: module.WritingEditor })))
const shelfViews = new Set(['library', 'favorites', 'trash'])

function readRoute() {
  const [view, id] = window.location.hash.replace(/^#\/?/, '').split('/')
  if (view === 'book' && id) return { view, id }
  return { view: shelfViews.has(view) ? view : 'library' }
}

function App() {
  const library = useLibrary()
  const [route, setRoute] = useState(readRoute)
  const [modal, setModal] = useState(null)
  const [issueId, setIssueId] = useState(null)

  const previousBook = useRef(route.id)
  const authRoute = useRef(null)

  useEffect(() => {
    function onHashChange() { setRoute(readRoute()) }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  useEffect(() => {
    if (previousBook.current && previousBook.current !== route.id) library.flush(previousBook.current)
    previousBook.current = route.id
  }, [route.id])

  function navigate(view, id) {
    const hash = view === 'library' ? '#/' : '#/' + view + (id ? '/' + id : '')
    if (window.location.hash !== hash) window.location.hash = hash
    setRoute({ view, id })
    window.scrollTo(0, 0)
  }

  function requestRoute(view, id) {
    if (library.user || view === 'library') {
      navigate(view, id)
      return
    }
    authRoute.current = { view, id }
    setModal('auth-route')
  }

  useEffect(() => {
    if (library.ready && !library.user && (route.view !== 'library' || library.needsSignIn)) setModal(current => current ?? 'auth-route')
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

  const book = library.user && route.view === 'book' ? library.books.find(item => item.id === route.id && !item.trashed) : null
  const chapter = book?.chapters.find(item => item.id === book.activeChapterId) ?? book?.chapters[0]
  const unsaved = Object.values(library.statuses).some(item => ['saving', 'conflict', 'error'].includes(item.state))
  function close() {
    authRoute.current = null
    setModal(null)
  }

  useEffect(() => {
    document.title = book ? book.title + ' — 여백' : '여백 — 집필 스튜디오'
  }, [book?.title])

  return (
    <>
      {route.view !== 'book' ? (
        <Dashboard library={library} view={library.user ? route.view : 'library'} onNavigate={requestRoute}
          onOpen={id => requestRoute('book', id)} onCreate={requestNewBook} onAccount={openAccount} onSaveStatus={resolveIssue} />
      ) : book && chapter ? (
        <Suspense fallback={<main className="missing-book" role="status">편집기를 여는 중…</main>}>
          <WritingEditor key={library.user.id + '/' + book.id} book={book} chapter={chapter} library={library}
            onBack={() => navigate('library')} onAccount={openAccount} onSaveStatus={() => resolveIssue(book.id)} />
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
          if (target.view === 'book') {
            const id = imported.get(target.id) ?? target.id
            if (bookIds.has(id)) navigate('book', id)
            else navigate('library')
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
