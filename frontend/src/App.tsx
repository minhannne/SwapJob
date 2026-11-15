import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import type { FormEvent } from 'react'
import './App.css'

import ProfileEditor from './ProfileEditor'
import SkillManager from './SkillManager'
import Avatar from './Avatar'
import TeacherProfilePage from './TeacherProfilePage'
import MyAvailabilityPage from './MyAvailabilityPage'
import BookingRequestsPage from './BookingRequestsPage'
import SessionsPage from './SessionsPage'
import RewardsPage from './RewardsPage'
import { LanguageProvider, LanguageSwitcher } from './LanguageProvider'
import NotificationBell from './NotificationBell'
import { translateMessage, useLanguage } from './i18n'

type Teacher = {
  user_id: number
  full_name: string
  bio: string | null
  avatar_url: string | null
  skill_id: number
  skill_name: string
  experience_level: string
}

type CurrentUser = {
  id: number
  email: string
  full_name: string
  role: string
  bio: string | null
  avatar_url: string | null
}

function subscribeToRoute(onChange: () => void) {
  window.addEventListener('hashchange', onChange)

  return () => {
    window.removeEventListener('hashchange', onChange)
  }
}

function getRoute() {
  return window.location.hash || '#/explore'
}

function getServerRoute() {
  return '#/explore'
}

function AppContent() {
  const { t, language } = useLanguage()

  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [token, setToken] = useState('')
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)

  const [keyword, setKeyword] = useState('')
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [searched, setSearched] = useState(false)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const accountMenuRef = useRef<HTMLDetailsElement>(null)

  const route = useSyncExternalStore(
    subscribeToRoute,
    getRoute,
    getServerRoute,
  )

  const teacherRoute = /^#\/teachers\/([1-9]\d*)$/.exec(route)
  const routeTeacherId = teacherRoute ? Number(teacherRoute[1]) : null

  const teacherId = routeTeacherId !== null
    && Number.isSafeInteger(routeTeacherId)
    ? routeTeacherId
    : null

  const isProfilePage = route === '#/account/profile'
  const isSkillsPage = route === '#/account/skills'
  const isAvailabilityPage = route === '#/availability'
  const isBookingRequestsPage = route.split('?')[0] === '#/bookings'
  const isSessionsPage = route === '#/sessions'
  const isRewardsPage = route === '#/rewards'

  const isExplorePage =
    !isProfilePage
    && !isSkillsPage
    && !isAvailabilityPage
    && !isBookingRequestsPage
    && !isSessionsPage
    && !isRewardsPage

  const levelLabels: Record<string, string> = {
    BEGINNER: t('beginner'),
    INTERMEDIATE: t('intermediate'),
    ADVANCED: t('advanced'),
  }

  const handleSessionExpired = useCallback(() => {
    setToken('')
    setCurrentUser(null)
    setPassword('')
    setTeachers([])
    setSearched(false)
    setMode('login')
    setNotice('')
    setError('sessionExpired')
    window.location.hash = '#/explore'
  }, [])

  const handleProfileChange = useCallback((profile: CurrentUser) => {
    setCurrentUser(profile)

    setTeachers(previous =>
      previous.map(teacher =>
        teacher.user_id === profile.id
          ? {
              ...teacher,
              full_name: profile.full_name,
              bio: profile.bio,
              avatar_url: profile.avatar_url,
            }
          : teacher,
      ),
    )
  }, [])

  // Tải tên và avatar cho thanh tài khoản.
  useEffect(() => {
    if (!token) return

    const controller = new AbortController()

    async function loadCurrentUser() {
      try {
        const response = await fetch('/api/users/me', {
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${token}`,
          },
          signal: controller.signal,
        })

        if (controller.signal.aborted) return

        if (response.status === 401) {
          handleSessionExpired()
          return
        }

        if (!response.ok) {
          throw new Error('accountLoadFailed')
        }

        const data: CurrentUser = await response.json()

        if (!controller.signal.aborted) {
          setCurrentUser(data)
        }
      } catch {
        if (!controller.signal.aborted) {
          setError('accountLoadFailed')
        }
      }
    }

    void loadCurrentUser()

    return () => controller.abort()
  }, [token, handleSessionExpired])

  // Đóng menu khi bấm ra ngoài hoặc nhấn Escape.
  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const menu = accountMenuRef.current

      if (
        menu?.open
        && event.target instanceof Node
        && !menu.contains(event.target)
      ) {
        menu.open = false
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      const menu = accountMenuRef.current

      if (event.key === 'Escape' && menu?.open) {
        menu.open = false
        menu.querySelector('summary')?.focus()
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  function closeAccountMenu() {
    if (accountMenuRef.current) {
      accountMenuRef.current.open = false
    }
  }

  function clearPageMessages() {
    closeAccountMenu()
    setError('')
    setNotice('')
  }

  function navigateTo(path: string) {
    clearPageMessages()
    window.location.hash = path
  }

  async function request(path: string, options: RequestInit = {}) {
    const headers = new Headers(options.headers)
    headers.set('Accept', 'application/json')

    if (options.body) {
      headers.set('Content-Type', 'application/json')
    }

    if (token) {
      headers.set('Authorization', `Bearer ${token}`)
    }

    const response = await fetch(path, { ...options, headers })

    if (response.status === 401 && token) {
      handleSessionExpired()
      throw new Error('sessionExpired')
    }

    if (response.status === 204) {
      return null
    }

    const data = await response.json().catch(() => null)

    if (!response.ok) {
      throw new Error(
        typeof data?.detail === 'string'
          ? data.detail
          : 'invalidInput',
      )
    }

    if (data === null) {
      throw new Error('invalidResponse')
    }

    return data
  }

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')

    try {
      if (mode === 'register') {
        await request('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({
            email: email.trim(),
            password,
            full_name: fullName.trim(),
          }),
        })

        setMode('login')
        setPassword('')
        setNotice('registrationSuccess')
      } else {
        const data = await request('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({
            email: email.trim(),
            password,
          }),
        })

        if (typeof data?.access_token !== 'string') {
          throw new Error('invalidLoginResponse')
        }

        setToken(data.access_token)
        setPassword('')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'connectionFailed')
    } finally {
      setBusy(false)
    }
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const searchKeyword = keyword.trim()

    if (!searchKeyword) {
      setError('enterSearch')
      return
    }

    setBusy(true)
    setError('')
    setNotice('')
    setTeachers([])
    setSearched(false)

    try {
      const data = await request(
        `/api/users/search?keyword=${encodeURIComponent(searchKeyword)}`,
      )

      if (!Array.isArray(data)) {
        throw new Error('invalidSearchResponse')
      }

      setTeachers(data)
      setSearched(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'searchFailed')
    } finally {
      setBusy(false)
    }
  }

  function logout() {
    closeAccountMenu()
    setToken('')
    setCurrentUser(null)
    setPassword('')
    setTeachers([])
    setSearched(false)
    setKeyword('')
    setMode('login')
    setError('')
    setNotice('')
    window.location.hash = '#/explore'
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="sj-header-left">
          <a
            className="brand"
            href="#/explore"
            onClick={clearPageMessages}
          >
            Swap<span>Job</span>
          </a>

          {token && (
            <nav className="sj-main-nav" aria-label={t('mainNavigation')}>
              <a
                href="#/explore"
                className={isExplorePage ? 'is-active' : ''}
                aria-current={isExplorePage ? 'page' : undefined}
                onClick={clearPageMessages}
              >
                {t('explore')}
              </a>

              <a
                href="#/availability"
                className={isAvailabilityPage ? 'is-active' : ''}
                aria-current={isAvailabilityPage ? 'page' : undefined}
                onClick={clearPageMessages}
              >
                {t('availability')}
              </a>

              <a
                href="#/bookings"
                className={isBookingRequestsPage ? 'is-active' : ''}
                aria-current={isBookingRequestsPage ? 'page' : undefined}
                onClick={clearPageMessages}
              >
                {t('requests')}
              </a>

              <a
                href="#/sessions"
                className={isSessionsPage ? 'is-active' : ''}
                aria-current={isSessionsPage ? 'page' : undefined}
                onClick={clearPageMessages}
              >
                {t('sessions')}
              </a>
                            <a
                href="#/rewards"
                className={isRewardsPage ? 'is-active' : ''}
                aria-current={isRewardsPage ? 'page' : undefined}
                onClick={clearPageMessages}
              >
                {t('rewards')}
              </a>
            </nav>
          )}
        </div>

        <div className="sj-header-actions">
          <LanguageSwitcher />
                    {token && (
            <NotificationBell
              token={token}
              onSessionExpired={handleSessionExpired}
            />
          )}

          {token && (
            <details ref={accountMenuRef} className="sj-account-menu">
              <summary aria-label={t('openAccountMenu')}>
                <span className="sj-account-avatar">
                  <Avatar
                    src={currentUser?.avatar_url ?? null}
                    name={currentUser?.full_name ?? t('account')}
                  />
                </span>

                <span className="sj-account-name">
                  {currentUser?.full_name ?? t('account')}
                </span>

                <span aria-hidden="true">⌄</span>
              </summary>

              <div className="sj-account-dropdown">
                <div className="sj-account-dropdown-info">
                  <strong>{currentUser?.full_name ?? t('account')}</strong>
                  {currentUser?.email && <span>{currentUser.email}</span>}
                </div>

                <a
                  href="#/account/profile"
                  aria-current={isProfilePage ? 'page' : undefined}
                  onClick={() => navigateTo('#/account/profile')}
                >
                  {t('myProfile')}
                </a>

                <a
                  href="#/account/skills"
                  aria-current={isSkillsPage ? 'page' : undefined}
                  onClick={() => navigateTo('#/account/skills')}
                >
                  {t('mySkills')}
                </a>

                <button type="button" onClick={logout}>
                  {t('logout')}
                </button>
              </div>
            </details>
          )}
        </div>
      </header>

      <main>
        {error && (
          <p className="message error" role="alert">
            {translateMessage(error, language)}
          </p>
        )}

        {notice && (
          <p className="message success" role="status">
            {translateMessage(notice, language)}
          </p>
        )}

        {!token ? (
          <div className="auth-layout">
            <section className="intro">
              <span className="eyebrow">{t('authEyebrow')}</span>

              <h1>
                {t('authTitleFirst')}
                <br />
                {t('authTitleSecond')}
              </h1>

              <p>{t('authIntroduction')}</p>

              <div className="tags">
                <span>{t('programming')}</span>
                <span>{t('languages')}</span>
                <span>{t('design')}</span>
                <span>{t('music')}</span>
              </div>
            </section>

            <section className="panel auth-panel">
              <h2>
                {mode === 'login' ? t('loginTitle') : t('registerTitle')}
              </h2>

              <p className="muted">
                {mode === 'login'
                  ? t('loginDescription')
                  : t('registerDescription')}
              </p>

              <form onSubmit={handleAuth}>
                {mode === 'register' && (
                  <label>
                    {t('fullName')}
                    <input
                      value={fullName}
                      onChange={event => setFullName(event.target.value)}
                      autoComplete="name"
                      maxLength={100}
                      disabled={busy}
                      required
                    />
                  </label>
                )}

                <label>
                  {t('email')}
                  <input
                    type="email"
                    value={email}
                    onChange={event => setEmail(event.target.value)}
                    autoComplete="username"
                    maxLength={255}
                    disabled={busy}
                    required
                  />
                </label>

                <label>
                  {t('password')}
                  <input
                    type="password"
                    value={password}
                    onChange={event => setPassword(event.target.value)}
                    autoComplete={
                      mode === 'login' ? 'current-password' : 'new-password'
                    }
                    minLength={mode === 'register' ? 8 : 1}
                    maxLength={128}
                    disabled={busy}
                    required
                  />
                </label>

                <button
                  type="submit"
                  className="button primary full"
                  disabled={busy}
                >
                  {busy
                    ? t('processing')
                    : mode === 'login'
                      ? t('login')
                      : t('createAccount')}
                </button>
              </form>

              <button
                className="text-button"
                type="button"
                disabled={busy}
                onClick={() => {
                  setMode(mode === 'login' ? 'register' : 'login')
                  setError('')
                  setNotice('')
                  setPassword('')
                }}
              >
                {mode === 'login'
                  ? t('switchToRegister')
                  : t('switchToLogin')}
              </button>
            </section>
          </div>
        ) : isProfilePage ? (
          <ProfileEditor
            token={token}
            onSessionExpired={handleSessionExpired}
            onProfileChange={handleProfileChange}
          />
        ) : isSkillsPage ? (
          <SkillManager
            token={token}
            onSessionExpired={handleSessionExpired}
          />
        ) : isAvailabilityPage ? (
          <MyAvailabilityPage
            token={token}
            onSessionExpired={handleSessionExpired}
          />
        ) : isBookingRequestsPage ? (
          <BookingRequestsPage
            key={route}
            token={token}
            onSessionExpired={handleSessionExpired}
          />
        ) : isSessionsPage ? (
          <SessionsPage
            token={token}
            onSessionExpired={handleSessionExpired}
          />
                ) : isRewardsPage ? (
          <RewardsPage />
        ) : teacherId !== null ? (
          <TeacherProfilePage
            key={teacherId}
            teacherId={teacherId}
            token={token}
            onSessionExpired={handleSessionExpired}
          />
        ) : (
          <>
            <section className="search-hero">
              <span className="eyebrow">{t('exploreEyebrow')}</span>

              <h1>{t('exploreTitle')}</h1>

              <p className="muted">{t('exploreDescription')}</p>

              <form className="search-form" onSubmit={handleSearch}>
                <input
                  aria-label={t('searchLabel')}
                  placeholder={t('searchPlaceholder')}
                  value={keyword}
                  onChange={event => setKeyword(event.target.value)}
                  maxLength={100}
                  disabled={busy}
                  required
                />

                <button
                  type="submit"
                  className="button primary"
                  disabled={busy || !keyword.trim()}
                >
                  {busy ? t('loading') : t('findMentor')}
                </button>
              </form>
            </section>

            {searched && (
              <section className="results">
                <h2>{t('searchResults')}</h2>

                {teachers.length === 0 ? (
                  <p className="panel muted">{t('noMentors')}</p>
                ) : (
                  <div className="teacher-grid">
                    {teachers.map(teacher => (
                      <article
                        className="panel teacher-card"
                        key={`${teacher.user_id}-${teacher.skill_id}`}
                      >
                        <Avatar
                          src={teacher.avatar_url}
                          name={teacher.full_name}
                        />

                        <h3>{teacher.full_name}</h3>

                        <span className="skill-badge">
                          {teacher.skill_name}
                        </span>

                        <p className="level">
                          {levelLabels[teacher.experience_level]
                            || teacher.experience_level}
                        </p>

                        <p className="muted">
                          {teacher.bio || t('missingBio')}
                        </p>

                        <button
                          type="button"
                          className="button secondary"
                          disabled={busy}
                          onClick={() => navigateTo(`#/teachers/${teacher.user_id}`)}
                        >
                          {t('viewProfile')}
                        </button>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </main>

      <footer>{t('footer')}</footer>
    </div>
  )
}

export default function App() {
  return (
    <LanguageProvider>
      <AppContent />
    </LanguageProvider>
  )
}