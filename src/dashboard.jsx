import { useEffect, useRef, useState } from 'react'
import {
  ArrowDownUp, ArrowRight, BookOpen, ChevronDown, ChevronRight, Clock3, Cloud, CloudCheck, Ellipsis,
  FileText, LayoutGrid, LayoutTemplate, List, LockKeyhole, LogIn, Menu, Plus, RotateCcw, Search, Settings, Star, Trash2, X,
} from 'lucide-react'
import { COVERS, relativeDate, STATUSES, TEMPLATES } from './catalog.js'
import { CoverArtwork } from './cover-artwork.jsx'
import { HistoryButtons } from './history-controls.jsx'

const views = {
  library: { label: '내 서재', icon: BookOpen },
  favorites: { label: '즐겨찾기', icon: Star },
  trash: { label: '휴지통', icon: Trash2 },
}

export function AccountButton({ user, onClick, ready = true }) {
  return (
    <button type="button" className="account-button" onClick={onClick} disabled={!ready} aria-label={user ? '계정 설정' : '로그인'}>
      {user ? <span className="account-avatar">{user.email.slice(0, 1).toUpperCase()}</span> : <LogIn size={17} />}
      <span>{user ? '내 계정' : '로그인'}</span>
    </button>
  )
}

function Sidebar({ view, navigate, onCreate, onSettings, user, unsaved, open, onClose }) {
  const networkIcon = user && !unsaved ? <CloudCheck size={19} /> : <Cloud size={19} />
  return (
    <>
      {open && <button type="button" className="sidebar-backdrop" aria-label="메뉴 닫기" onClick={onClose} />}
      <aside className={'sidebar' + (open ? ' sidebar-open' : '')}>
        <button className="brand" type="button" aria-label="여백 내 서재" onClick={() => navigate('library')}>
          <span className="brand-mark"><BookOpen size={23} strokeWidth={1.65} /><i /></span>
          <span className="brand-name">여백<span>.</span><small>WRITING STUDIO</small></span>
        </button>
        <nav className="side-nav" aria-label="작업 공간">
          <span className="nav-caption">작업 공간</span>
          {Object.entries(views).map(([key, { label, icon: Icon }]) =>
            <button type="button" key={key} className={'nav-item' + (key === view ? ' active' : '')}
              aria-current={key === view ? 'page' : undefined} onClick={() => navigate(key)}>
              <Icon size={19} strokeWidth={1.8} /> <span>{label}</span>{key === view && <span className="nav-active-dot" />}
            </button>,
          )}
          <span className="nav-caption second-caption">도구</span>
          <button type="button" className="nav-item" onClick={() => { onClose(); onCreate() }}><LayoutTemplate size={19} strokeWidth={1.8} /> 책 서식</button>
          <button type="button" className="nav-item" onClick={() => { onClose(); onSettings() }}><Settings size={19} strokeWidth={1.8} /> 설정</button>
        </nav>
        <div className="sidebar-footer">
          <div className="cloud-card">
            <span className="cloud-icon">{networkIcon}</span>
            <div>
              <strong>클라우드 동기화</strong>
              <p>{user ? (unsaved ? '서버에 저장할 원고가 있어요.' : '서재가 계정에 연결되었어요.') : '로그인하고 어디서든\n이어서 쓰세요.'}</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}

export function BookCover({ book }) {
  if (book.coverDesign) {
    return <span className="book-cover custom-book-cover" aria-hidden="true"><CoverArtwork book={book} /></span>
  }
  const cover = COVERS[book.cover] ?? COVERS.ivory
  return (
    <span className={'book-cover artwork-' + book.cover} style={{ '--cover-ink': cover.ink }} aria-hidden="true">
      <span className="cover-type">{TEMPLATES[book.template].name}</span>
      <span className="cover-title">{book.title}</span>
      <span className="cover-imprint"><BookOpen size={10} strokeWidth={1.4} /></span>
    </span>
  )
}

function BookCard({ book, onOpen, onUpdate, onStatus, saveStatus, onLogin }) {
  function change(event, update) {
    event.currentTarget.closest('details')?.removeAttribute('open')
    onUpdate(book.id, current => ({ ...current, ...update }))
  }
  return (
    <article className="book-card">
      <div className={'cover-stage stage-' + book.cover}>
        <button type="button" className="cover-open" onClick={onOpen} aria-label={book.title + ' 열기'} disabled={book.trashed}>
          <BookCover book={book} />
        </button>
        {!book.trashed && <button type="button" className={'cover-favorite' + (book.favorite ? ' starred' : '')}
          aria-label={book.favorite ? '즐겨찾기 해제' : '즐겨찾기 추가'} aria-pressed={book.favorite}
          onClick={() => onUpdate(book.id, current => ({ ...current, favorite: !current.favorite }))}>
          <Star size={17} strokeWidth={1.8} />
        </button>}
      </div>
      <div className="book-card-info">
        <div className="book-card-top">
          <button type="button" className="book-title-button" onClick={onOpen} disabled={book.trashed}>{book.title}</button>
          {!book.trashed && <details className="dropdown book-menu">
            <summary className="icon-button" aria-label={book.title + ' 메뉴'} onClick={event => {
              if (onLogin) {
                event.preventDefault()
                onLogin()
              }
            }}><Ellipsis size={20} /></summary>
            <div className="dropdown-panel">
              <button type="button" onClick={event => change(event, { status: book.status === 'complete' ? 'draft' : 'complete' })}>
                <FileText size={16} /> {book.status === 'complete' ? '집필 중으로 표시' : '초고 완료로 표시'}
              </button>
              <button type="button" className="destructive" onClick={event => change(event, { trashed: true })}><Trash2 size={16} /> 휴지통으로 이동</button>
            </div>
          </details>}
        </div>
        <div className="book-meta">
          <span>{TEMPLATES[book.template].name}</span><i /><span>{relativeDate(book.updatedAt)}</span>
        </div>
        <div className="book-card-bottom">
          {book.trashed
            ? <button type="button" className="text-button restore-button" onClick={event => change(event, { trashed: false })}><RotateCcw size={15} /> 복원</button>
            : <><span className={'badge badge-' + book.status}>{book.example ? <>{onLogin && <LockKeyhole size={12} />} 예제 책</> : <><i />{STATUSES[book.status]}</>}</span><span className="chapter-count"><FileText size={14} />{book.chapters.length}장</span></>}
          {(saveStatus?.state === 'error' || saveStatus?.state === 'conflict') &&
            <button type="button" className="text-button warning-button" onClick={onStatus}>저장 확인</button>}
        </div>
      </div>
    </article>
  )
}

function Hero({ book, onOpen, onCreate }) {
  const chapterIndex = book?.chapters.findIndex(chapter => chapter.id === book.activeChapterId) ?? -1
  return (
    <section className="hero" aria-label={book ? '최근 작업' : '새 책 시작'}>
      <div className="hero-art" />
      <div className="hero-copy">
        {book && !book.example && <span className="hero-tag"><Clock3 size={14} /> 최근 작업</span>}
        <h2>{book ? book.title : '첫 책을 시작해 보세요'}</h2>
        <p>{book ? TEMPLATES[book.template].name + ' · ' + (chapterIndex + 1) + '장' : '서식을 고르고 첫 문장을 적어 보세요.'}</p>
        <button type="button" className="button hero-button" onClick={book ? onOpen : onCreate}>
          {book ? (book.example ? '예제 책 열기' : '이어서 쓰기') : '새 책 만들기'} <ArrowRight size={17} />
        </button>
      </div>
    </section>
  )
}

export function Dashboard({ library, view, onNavigate, onOpen, onCreate, onAccount, onSaveStatus, onHistory }) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('recent')
  const [mode, setMode] = useState('grid')
  const [menu, setMenu] = useState(false)
  const search = useRef(null)

  useEffect(() => {
    function handleKey(event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        search.current?.focus()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  const active = library.books.filter(book => !book.trashed)
  const byRecency = (a, b) => Number(Boolean(a.example)) - Number(Boolean(b.example)) || b.updatedAt.localeCompare(a.updatedAt)
  const latest = [...active].sort(byRecency)[0]
  const scope = view === 'trash' ? library.books.filter(book => book.trashed) :
    view === 'favorites' ? active.filter(book => book.favorite) : active
  const needle = query.trim().toLowerCase()
  const visible = scope.filter(book => !needle || (book.title + ' ' + TEMPLATES[book.template].name).toLowerCase().includes(needle))
    .sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title, 'ko') : byRecency(a, b))
  const subtitle = view === 'library' ? '책을 정리하고 마지막 원고를 이어 쓰세요.' :
    view === 'favorites' ? '즐겨찾기로 표시한 원고를 모아 보세요.' : '휴지통에 보낸 책은 다시 서재로 복원할 수 있어요.'
  const unsaved = Object.values(library.statuses).some(item => ['saving', 'error', 'conflict'].includes(item.state))

  return (
    <div className="workspace-layout">
      <Sidebar view={view} navigate={next => { setQuery(''); setMenu(false); onNavigate(next) }}
        onCreate={onCreate} onSettings={onAccount} user={library.user} unsaved={unsaved} open={menu} onClose={() => setMenu(false)} />
      <div className="workspace-main">
        <header className="topbar">
          <button type="button" className="icon-button mobile-menu" onClick={() => setMenu(true)} aria-label="작업 공간 메뉴 열기"><Menu size={22} /></button>
          <div className="breadcrumb"><span>작업 공간</span><ChevronRight size={14} /><strong>{views[view].label}</strong></div>
          <div className="topbar-right">
            <label className="search-field">
              <Search size={17} strokeWidth={1.75} />
              <input ref={search} type="search" aria-label="책 검색" value={query} onChange={event => setQuery(event.target.value)} placeholder="책 검색…" />
              {query ? <button type="button" className="icon-button clear-search" aria-label="검색어 지우기" onClick={() => setQuery('')}><X size={14} /></button>
                : <kbd>Ctrl K</kbd>}
            </label>
            <span className="header-divider" />
            <AccountButton user={library.user} onClick={onAccount} ready={library.ready} />
          </div>
        </header>

        <main className="dashboard">
          <div className="page-heading">
            <div><h1>{views[view].label}</h1><p>{subtitle}</p></div>
            <div className="shelf-heading-actions">
              {library.user && <HistoryButtons canUndo={library.canUndo} canRedo={library.canRedo} onStep={onHistory} />}
              {view !== 'trash' && <button type="button" className="button button-primary new-book-button" onClick={onCreate}><Plus size={19} strokeWidth={2.1} /> 신규 작성</button>}
            </div>
          </div>

          {view === 'library' && !needle && <Hero book={latest} onOpen={() => onOpen(latest.id)} onCreate={onCreate} />}

          <section className="shelf-section" aria-label="책 목록">
            <div className="shelf-heading">
              <h2>{needle ? '검색 결과' : view === 'library' ? (library.user ? '나의 책' : '예제 책') : '원고'} <span>{visible.length}</span></h2>
              <div className="shelf-actions">
                <label className="sort-select">
                  <ArrowDownUp size={15} />
                  <select aria-label="정렬" value={sort} onChange={event => setSort(event.target.value)}>
                    <option value="recent">최근 수정순</option>
                    <option value="title">제목순</option>
                  </select>
                  <ChevronDown size={14} />
                </label>
                <div className="view-toggle" aria-label="보기 방식">
                  <button type="button" className={mode === 'grid' ? 'selected' : ''} onClick={() => setMode('grid')}
                    aria-pressed={mode === 'grid'} aria-label="카드 보기"><LayoutGrid size={17} /></button>
                  <button type="button" className={mode === 'list' ? 'selected' : ''} onClick={() => setMode('list')}
                    aria-pressed={mode === 'list'} aria-label="목록 보기"><List size={19} /></button>
                </div>
              </div>
            </div>
            {visible.length > 0
              ? <div className={'book-grid' + (mode === 'list' ? ' as-list' : '')}>
                {visible.map(book => <BookCard key={book.id} book={book} onOpen={() => onOpen(book.id)}
                  onUpdate={library.user ? library.update : onAccount} onLogin={library.user ? undefined : onAccount}
                  saveStatus={library.statuses[book.id]} onStatus={() => onSaveStatus(book.id)} />)}
              </div>
              : <div className="empty-shelf">
                <span className="empty-icon">{needle ? <Search size={24} /> : view === 'trash' ? <Trash2 size={24} /> : view === 'favorites' ? <Star size={24} /> : <BookOpen size={24} />}</span>
                <h3>{needle ? '일치하는 책이 없어요' : view === 'trash' ? '휴지통이 비어 있어요' : view === 'favorites' ? '즐겨찾기한 책이 없어요' : '서재가 비어 있어요'}</h3>
                {needle && <button type="button" className="text-button" onClick={() => setQuery('')}>검색어 지우기</button>}
                {!needle && view === 'favorites' && <p>표지 오른쪽의 별을 눌러 즐겨찾기에 추가하세요.</p>}
                {!needle && view === 'library' && <button type="button" className="text-button" onClick={onCreate}>신규 작성 <ArrowRight size={14} /></button>}
              </div>}
          </section>
        </main>
      </div>
    </div>
  )
}
