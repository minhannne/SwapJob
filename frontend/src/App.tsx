import { useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'
import ProfileEditor from './ProfileEditor'
import SkillManager from './SkillManager'
import Avatar from './Avatar'
type Teacher = {
  user_id: number
  full_name: string
  bio: string | null
  avatar_url: string | null
  skill_id: number
  skill_name: string
  experience_level: string
}

type TeacherProfile = {
  user_id: number
  full_name: string
  bio: string | null
  avatar_url: string | null
  skills: {
    skill_id: number
    name: string
    description: string | null
    experience_level: string
  }[]
}

function App() {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [token, setToken] = useState('')
  const [keyword, setKeyword] = useState('')
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [profile, setProfile] = useState<TeacherProfile | null>(null)
  const [searched, setSearched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

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
    const data = await response.json()

    if (!response.ok) {
      if (response.status === 401 && token) {
        setToken('')
        setTeachers([])
        setProfile(null)
        setSearched(false)
        throw new Error('Phiên đăng nhập hết hạn. Bạn đăng nhập lại nha.')
      }

      const message = typeof data.detail === 'string'
        ? data.detail
        : 'Thông tin chưa hợp lệ. Bạn kiểm tra lại các ô nhập.'

      throw new Error(message)
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
        setNotice('Tạo tài khoản thành công. Đăng nhập để bắt đầu nhé.')
      } else {
        const data = await request('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({
            email: email.trim(),
            password,
          }),
        })

        setToken(data.access_token)
        setPassword('')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể kết nối.')
    } finally {
      setBusy(false)
    }
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setProfile(null)
    setTeachers([])
    setSearched(false)

    try {
      const data = await request(
        `/api/users/search?keyword=${encodeURIComponent(keyword.trim())}`,
      )

      setTeachers(data)
      setSearched(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tìm kiếm.')
    } finally {
      setBusy(false)
    }
  }

  async function showProfile(userId: number) {
    setBusy(true)
    setError('')
    setProfile(null)

    try {
      const data = await request(`/api/users/${userId}/profile`)
      setProfile(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tải hồ sơ.')
    } finally {
      setBusy(false)
    }
  }

  function logout() {
    setToken('')
    setTeachers([])
    setProfile(null)
    setSearched(false)
    setKeyword('')
    setError('')
    setNotice('')
  }

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="/">Swap<span>Job</span></a>
        {token && (
          <button className="button secondary" onClick={logout}>
            Đăng xuất
          </button>
        )}
      </header>

      <main>
        {error && <p className="message error" role="alert">{error}</p>}
        {notice && <p className="message success" role="status">{notice}</p>}

        {!token ? (
          <div className="auth-layout">
            <section className="intro">
              <span className="eyebrow">HỌC HỎI · CHIA SẺ · KẾT NỐI</span>
              <h1>Kỹ năng của bạn.<br />Cơ hội của mọi người.</h1>
              <p>
                Tìm người hướng dẫn phù hợp và chia sẻ những điều bạn biết.
                Từ lập trình, ngoại ngữ đến âm nhạc.
              </p>
              <div className="tags">
                <span>Lập trình</span>
                <span>Ngoại ngữ</span>
                <span>Thiết kế</span>
                <span>Âm nhạc</span>
              </div>
            </section>

            <section className="panel auth-panel">
              <h2>{mode === 'login' ? 'Chào mừng trở lại' : 'Tham gia SwapJob'}</h2>
              <p className="muted">
                {mode === 'login'
                  ? 'Đăng nhập để khám phá kỹ năng bạn muốn học.'
                  : 'Bắt đầu hành trình học hỏi và chia sẻ.'}
              </p>

              <form onSubmit={handleAuth}>
                {mode === 'register' && (
                  <label>
                    Họ và tên
                    <input
                      value={fullName}
                      onChange={event => setFullName(event.target.value)}
                      autoComplete="name"
                      maxLength={100}
                      required
                    />
                  </label>
                )}

                <label>
                  Email
                  <input
                    type="email"
                    value={email}
                    onChange={event => setEmail(event.target.value)}
                    autoComplete="username"
                    maxLength={255}
                    required
                  />
                </label>

                <label>
                  Mật khẩu
                  <input
                    type="password"
                    value={password}
                    onChange={event => setPassword(event.target.value)}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    minLength={mode === 'register' ? 8 : 1}
                    maxLength={128}
                    required
                  />
                </label>

                <button className="button primary full" disabled={busy}>
                  {busy ? 'Đang xử lý…' : mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}
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
                  ? 'Chưa có tài khoản? Đăng ký'
                  : 'Đã có tài khoản? Đăng nhập'}
              </button>
            </section>
          </div>
                ) : (
          <>
            <ProfileEditor token={token} />
            <SkillManager token={token} />

            <section className="search-hero">
              <span className="eyebrow">KHÁM PHÁ CÙNG SWAPJOB</span>
              <h1>Hôm nay bạn muốn học gì?</h1>
              <p className="muted">Tìm người dạy phù hợp với kỹ năng bạn quan tâm.</p>

              <form className="search-form" onSubmit={handleSearch}>
                <input
                  aria-label="Kỹ năng muốn học"
                  placeholder="Thử Java, tiếng Anh, guitar…"
                  value={keyword}
                  onChange={event => setKeyword(event.target.value)}
                  maxLength={100}
                  required
                />
                <button
                  className="button primary"
                  disabled={busy || !keyword.trim()}
                >
                  {busy ? 'Đang tải…' : 'Tìm người dạy'}
                </button>
              </form>
            </section>

            {searched && (
              <section className="results">
                <h2>Kết quả tìm kiếm</h2>
                {teachers.length === 0 ? (
                  <p className="panel muted">
                    Chưa tìm thấy người dạy. Bạn thử kỹ năng khác nhé.
                  </p>
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
                        <span className="skill-badge">{teacher.skill_name}</span>
                        <p className="level">{teacher.experience_level}</p>
                        <p className="muted">
                          {teacher.bio || 'Người dạy chưa thêm giới thiệu.'}
                        </p>
                        <button
                          className="button secondary"
                          disabled={busy}
                          onClick={() => showProfile(teacher.user_id)}
                        >
                          Xem hồ sơ
                        </button>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            )}

            {profile && (
              <section className="panel profile-panel">
                 <Avatar
    src={profile.avatar_url}
    name={profile.full_name}
    large
  />

                <div className="profile-heading">
                  <h2>{profile.full_name}</h2>
                  <button
                    className="text-button"
                    onClick={() => setProfile(null)}
                  >
                    Đóng hồ sơ
                  </button>
                </div>
                <p className="muted">{profile.bio || 'Chưa có giới thiệu.'}</p>
                <h3>Kỹ năng có thể dạy</h3>
                {profile.skills.length === 0 ? (
                  <p>Chưa khai báo kỹ năng.</p>
                ) : (
                  <ul className="skill-list">
                    {profile.skills.map(skill => (
                      <li key={skill.skill_id}>
                        <strong>{skill.name}</strong>
                        <span>{skill.experience_level}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
          </>
        )}
      </main>
      <footer>SwapJob — Cùng học hỏi, cùng phát triển.</footer>
    </div>
  )
}

export default App