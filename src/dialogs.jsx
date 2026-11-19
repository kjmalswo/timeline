import { useEffect, useRef, useState } from 'react'
import { BookOpen, Check, Cloud, Feather, Layers, LockKeyhole, Sparkles, X } from 'lucide-react'
import { COVERS, newBook, PAPERS, TEMPLATES } from './catalog.js'
import { handleDraftHistory, HistoryButtons, useDraftHistory } from './history-controls.jsx'

const templateIcons = { feather: Feather, book: BookOpen, sparkles: Sparkles, layers: Layers }

export function Dialog({ title, description, onClose, onKeyDown, className = '', children }) {
  const ref = useRef(null)
  useEffect(() => {
    const dialog = ref.current
    dialog.showModal()
    return () => dialog.close()
  }, [])
  return (
    <dialog ref={ref} className={'dialog ' + className} aria-labelledby="dialog-title"
      onKeyDown={onKeyDown}
      onCancel={event => { event.preventDefault(); onClose() }}
      onClick={event => { if (event.target === event.currentTarget) onClose() }}>
      <div className="dialog-inner">
        <button type="button" className="icon-button dialog-close" aria-label="닫기" onClick={onClose}><X size={20} /></button>
        <h2 id="dialog-title">{title}</h2>
        {description && <p className="dialog-description">{description}</p>}
        {children}
      </div>
    </dialog>
  )
}

export function CreateDialog({ onClose, onCreate }) {
  const draft = useDraftHistory(() => ({ template: 'essay', cover: TEMPLATES.essay.cover, paper: TEMPLATES.essay.layout.paper, title: '' }))
  const { template, cover, paper, title } = draft.value

  function set(field, value, group) {
    draft.change(current => current[field] === value ? current : { ...current, [field]: value }, { group })
  }

  function choose(key) {
    const choice = TEMPLATES[key]
    draft.change(current => current.template === key && current.cover === choice.cover && current.paper === choice.layout.paper ? current :
      { ...current, template: key, cover: choice.cover, paper: choice.layout.paper })
  }

  function submit(event) {
    event.preventDefault()
    if (title.trim()) onCreate(newBook({ title: title.trim(), template, cover, paper }))
  }

  return (
    <Dialog title="새 책 쓰기" description="책의 분위기에 맞는 서식을 고르세요. 편집기에서 세부 설정을 바꿀 수 있어요."
      onClose={onClose} onKeyDown={event => handleDraftHistory(event, draft.step)} className="create-dialog">
      <form onSubmit={submit}>
        <HistoryButtons canUndo={draft.canUndo} canRedo={draft.canRedo} onStep={draft.step} />
        <label className="field">책 제목
          <input value={title} onChange={event => set('title', event.target.value, 'title')} placeholder="예: 나만의 이야기" required maxLength={160} />
        </label>
        <fieldset className="template-field">
          <legend>기본 서식</legend>
          <div className="template-grid">
            {Object.entries(TEMPLATES).map(([key, item]) => {
              const Icon = templateIcons[item.icon]
              return <button className={'template-button template-' + key + (template === key ? ' chosen' : '')} key={key} type="button"
                aria-pressed={template === key} onClick={() => choose(key)}>
                <span className="template-icon"><Icon size={19} /></span>
                <span><strong>{item.name}</strong><small>{item.description}</small></span>
                {template === key && <Check className="template-check" size={15} aria-hidden="true" />}
              </button>
            })}
          </div>
        </fieldset>
        <div className="create-options">
          <label className="field">판형
            <select value={paper} onChange={event => set('paper', event.target.value)}>
              {Object.entries(PAPERS).map(([key, option]) => <option key={key} value={key}>{option.name}</option>)}
            </select>
          </label>
          <fieldset className="cover-field">
            <legend>표지 디자인</legend>
            <div className="swatches">
              {Object.entries(COVERS).map(([key, option]) => <button type="button" key={key}
                className={'cover-swatch artwork-' + key} aria-pressed={cover === key} aria-label={option.name}
                title={option.name} onClick={() => set('cover', key)} />)}
            </div>
          </fieldset>
        </div>
        <div className="dialog-actions">
          <button type="button" className="button button-secondary" onClick={onClose}>취소</button>
          <button type="submit" className="button button-primary" disabled={!title.trim()}><Feather size={16} /> 책 만들기</button>
        </div>
      </form>
    </Dialog>
  )
}

export function AuthDialog({ onClose, onAuthenticate, hasDrafts, onSuccess,
  description = '원고를 클라우드에 저장하고 다른 기기에서 이어 쓰세요.',
}) {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const result = await onAuthenticate(mode, email, password)
      onSuccess(result)
    } catch (failure) {
      setError(failure.message === 'Failed to fetch' ? '서버에 연결할 수 없습니다. 연결을 확인해 주세요.' : failure.message)
      setBusy(false)
    }
  }

  function changeMode(next) {
    setMode(next)
    setPassword('')
    setError('')
  }

  return (
    <Dialog title={mode === 'login' ? '여백에 로그인' : '여백 계정 만들기'} description={description}
      onClose={() => { if (!busy) onClose() }} className="auth-dialog">
      <div className="auth-tabs" aria-label="계정 이용 방식">
        <button type="button" aria-pressed={mode === 'login'} disabled={busy} onClick={() => changeMode('login')}>로그인</button>
        <button type="button" aria-pressed={mode === 'register'} disabled={busy} onClick={() => changeMode('register')}>회원가입</button>
      </div>
      <form onSubmit={submit}>
        <label className="field">이메일
          <input type="email" value={email} required maxLength={254} autoComplete="email" placeholder="name@example.com" onChange={event => setEmail(event.target.value)} />
        </label>
        <label className="field">비밀번호
          <input type="password" value={password} required minLength={mode === 'register' ? 8 : undefined}
            maxLength={128} placeholder={mode === 'register' ? '8자 이상 입력하세요' : '비밀번호를 입력하세요'}
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'} onChange={event => setPassword(event.target.value)} />
        </label>
        {hasDrafts && <p className="form-note"><Cloud size={17} /> 이 기기에서 작성한 원고가 이 계정에 저장됩니다.</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="submit" className="button button-primary auth-submit" disabled={busy}>
          <LockKeyhole size={16} /> {busy ? '연결 중…' : mode === 'login' ? '로그인' : '계정 만들기'}
        </button>
      </form>
    </Dialog>
  )
}

export function AccountDialog({ user, unsaved, onClose, onSignOut, onLogin }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function signOut() {
    setBusy(true)
    try {
      await onSignOut()
    } catch (failure) {
      setError(failure.message === 'Failed to fetch' ? '로그아웃하지 못했습니다. 연결을 확인해 주세요.' : failure.message)
      setBusy(false)
    }
  }
  return (
    <Dialog title="계정 설정" onClose={() => { if (!busy) onClose() }} className="auth-dialog">
      <div className="account-summary">
        <div className="account-avatar">{user ? user.email.slice(0, 1).toUpperCase() : <Cloud size={19} />}</div>
        <div><strong>{user?.email ?? '게스트'}</strong><p>{user ? '클라우드 서재에 연결되어 있습니다.' : '로그인하면 원고를 기기 간에 동기화할 수 있어요.'}</p></div>
      </div>
      {unsaved && user && <p className="form-note">아직 동기화되지 않은 원고는 이 기기에 보관됩니다.</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="dialog-actions">
        <button type="button" className="button button-primary" disabled={busy} onClick={user ? signOut : onLogin}>
          {user ? (busy ? '로그아웃 중…' : '로그아웃') : '로그인'}
        </button>
      </div>
    </Dialog>
  )
}

export function ConflictDialog({ onClose, onResolve }) {
  return (
    <Dialog title="두 기기에서 원고가 수정됐어요"
      description="서버에 다른 기기에서 저장한 원고가 있습니다. 두 버전을 보관하면 이 기기의 편집본이 별도 책으로 저장됩니다."
      onClose={onClose} className="auth-dialog">
      <div className="dialog-actions">
        <button type="button" className="button button-secondary" onClick={() => onResolve(false)}>서버에 저장된 원고 열기</button>
        <button type="button" className="button button-primary" onClick={() => onResolve(true)}>두 버전 보관</button>
      </div>
    </Dialog>
  )
}
