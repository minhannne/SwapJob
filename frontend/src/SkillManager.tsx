import { useState } from 'react'
import type { FormEvent } from 'react'

type Level = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED'

type Skill = {
  id: number
  name: string
  description: string | null
}

type MySkill = {
  skill_id: number
  name: string
  description: string | null
  experience_level: Level
}

const levels: { value: Level; label: string }[] = [
  { value: 'BEGINNER', label: 'Cơ bản' },
  { value: 'INTERMEDIATE', label: 'Trung cấp' },
  { value: 'ADVANCED', label: 'Nâng cao' },
]

export default function SkillManager({ token }: { token: string }) {
  const [opened, setOpened] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [catalog, setCatalog] = useState<Skill[]>([])
  const [mySkills, setMySkills] = useState<MySkill[]>([])
  const [skillId, setSkillId] = useState('')
  const [level, setLevel] = useState<Level>('BEGINNER')
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function request<T>(
    path: string,
    method = 'GET',
    body?: unknown,
  ): Promise<T> {
    const response = await fetch(path, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body !== undefined
          ? { 'Content-Type': 'application/json' }
          : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })

    if (response.status === 204) {
      return undefined as T
    }

    const data = await response.json()

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Phiên đăng nhập hết hạn. Hãy đăng xuất và đăng nhập lại.')
      }

      const message = typeof data.detail === 'string'
        ? data.detail
        : Array.isArray(data.detail)
          ? data.detail.map((item: { msg: string }) => item.msg).join('; ')
          : 'Không thể xử lý kỹ năng.'

      throw new Error(message)
    }

    return data as T
  }

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError('')
    setNotice('')

    try {
      await action()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể kết nối.')
    } finally {
      setBusy(false)
    }
  }

  async function loadSkills() {
    await run(async () => {
      const [allSkills, teachingSkills] = await Promise.all([
        request<Skill[]>('/api/skills'),
        request<MySkill[]>('/api/users/me/skills'),
      ])

      setCatalog(allSkills)
      setMySkills(teachingSkills)
      setLoaded(true)
    })
  }

  async function addSkill(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!skillId) return

    await run(async () => {
      const added = await request<MySkill>(
        '/api/users/me/skills',
        'POST',
        {
          skill_id: Number(skillId),
          experience_level: level,
        },
      )

      setMySkills(previous => [...previous, added])
      setSkillId('')
      setNotice('Đã thêm kỹ năng vào hồ sơ dạy.')
    })
  }

  async function updateLevel(id: number, nextLevel: Level) {
    await run(async () => {
      const updated = await request<MySkill>(
        `/api/users/me/skills/${id}`,
        'PUT',
        { experience_level: nextLevel },
      )

      setMySkills(previous =>
        previous.map(skill => skill.skill_id === id ? updated : skill),
      )
      setNotice('Đã lưu trình độ mới.')
    })
  }

  async function removeSkill(skill: MySkill) {
    if (!window.confirm(`Gỡ kỹ năng "${skill.name}" khỏi hồ sơ dạy?`)) {
      return
    }

    await run(async () => {
      await request<void>(
        `/api/users/me/skills/${skill.skill_id}`,
        'DELETE',
      )

      setMySkills(previous =>
        previous.filter(item => item.skill_id !== skill.skill_id),
      )
      setNotice('Đã gỡ kỹ năng khỏi hồ sơ dạy.')
    })
  }

  async function createSkill(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!newName.trim()) return

    await run(async () => {
      const created = await request<Skill>('/api/skills', 'POST', {
        name: newName.trim(),
      })

      setCatalog(previous => [...previous, created])
      setSkillId(String(created.id))
      setNewName('')
      setNotice('Đã tạo kỹ năng. Chọn trình độ và bấm “Thêm vào hồ sơ”.')
    })
  }

  const availableSkills = catalog
    .filter(skill => !mySkills.some(item => item.skill_id === skill.id))
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <section className="skill-manager">
      <button
        className="button secondary"
        type="button"
        disabled={busy}
        onClick={() => {
          setOpened(!opened)
          if (!opened) void loadSkills()
        }}
      >
        {opened ? 'Đóng quản lý kỹ năng' : 'Kỹ năng của tôi'}
      </button>

      {opened && (
        <div className="panel profile-panel">
          <h2>Kỹ năng tôi có thể dạy</h2>
          <p className="muted">
            Chọn kỹ năng và trình độ để người học tìm thấy bạn.
          </p>

          {busy && <p role="status">Đang xử lý…</p>}
          {error && <p className="message error" role="alert">{error}</p>}
          {notice && <p className="message success" role="status">{notice}</p>}

          {!loaded && !busy && (
            <button
              className="button secondary"
              onClick={() => void loadSkills()}
            >
              Thử tải lại
            </button>
          )}

          {loaded && (
            <>
              {mySkills.length === 0 ? (
                <p className="muted">Bạn chưa khai báo kỹ năng dạy nào.</p>
              ) : (
                <ul className="teaching-list">
                  {mySkills.map(skill => (
                    <li key={skill.skill_id}>
                      <strong>{skill.name}</strong>

                      <label className="level-control">
                        Trình độ
                        <select
                          value={skill.experience_level}
                          disabled={busy}
                          onChange={event =>
                            void updateLevel(
                              skill.skill_id,
                              event.target.value as Level,
                            )
                          }
                        >
                          {levels.map(item => (
                            <option key={item.value} value={item.value}>
                              {item.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <button
                        className="button remove-button"
                        disabled={busy}
                        onClick={() => void removeSkill(skill)}
                      >
                        Gỡ kỹ năng
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <p className="muted">
                Khi đổi trình độ, hệ thống sẽ tự lưu.
              </p>

              <form onSubmit={addSkill} className="skill-add-form">
                <h3>Thêm kỹ năng dạy</h3>

                <fieldset className="profile-fields" disabled={busy}>
                  <div className="skill-form-grid">
                    <label>
                      Kỹ năng
                      <select
                        value={skillId}
                        onChange={event => setSkillId(event.target.value)}
                        required
                      >
                        <option value="">Chọn kỹ năng</option>
                        {availableSkills.map(skill => (
                          <option key={skill.id} value={skill.id}>
                            {skill.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      Trình độ
                      <select
                        value={level}
                        onChange={event => setLevel(event.target.value as Level)}
                      >
                        {levels.map(item => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <button
                    className="button primary"
                    type="submit"
                    disabled={!skillId}
                  >
                    Thêm vào hồ sơ
                  </button>
                </fieldset>
              </form>

              <details className="new-skill">
                <summary>Không thấy kỹ năng bạn muốn dạy?</summary>

                <form onSubmit={createSkill}>
                  <label>
                    Tên kỹ năng mới
                    <input
                      value={newName}
                      onChange={event => setNewName(event.target.value)}
                      maxLength={100}
                      disabled={busy}
                      required
                    />
                  </label>

                  <button
                    className="button secondary"
                    type="submit"
                    disabled={busy || !newName.trim()}
                  >
                    Tạo kỹ năng
                  </button>
                </form>
              </details>
            </>
          )}
        </div>
      )}
    </section>
  )
}