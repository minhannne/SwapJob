import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { translateMessage, useLanguage } from './i18n'

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

type Props = {
  token: string
  onSessionExpired?: () => void
}

export default function SkillManager({
  token,
  onSessionExpired,
}: Props) {
  const { t, locale, language } = useLanguage()

  const [loaded, setLoaded] = useState(false)
  const [catalog, setCatalog] = useState<Skill[]>([])
  const [mySkills, setMySkills] = useState<MySkill[]>([])

  const [skillId, setSkillId] = useState('')
  const [level, setLevel] = useState<Level>('BEGINNER')
  const [newName, setNewName] = useState('')

  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [retry, setRetry] = useState(0)

  const levels: { value: Level; label: string }[] = [
    { value: 'BEGINNER', label: t('beginner') },
    { value: 'INTERMEDIATE', label: t('intermediate') },
    { value: 'ADVANCED', label: t('advanced') },
  ]

  const request = useCallback(
    async function request<T>(
      path: string,
      method = 'GET',
      body?: unknown,
      signal?: AbortSignal,
    ): Promise<T> {
      const response = await fetch(path, {
        method,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
          ...(body !== undefined
            ? { 'Content-Type': 'application/json' }
            : {}),
        },
        ...(body !== undefined
          ? { body: JSON.stringify(body) }
          : {}),
        signal,
      })

      if (response.status === 401) {
        if (!signal?.aborted) {
          onSessionExpired?.()
        }

        throw new Error('sessionExpired')
      }

      if (response.status === 204) {
        return undefined as T
      }

      const data = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(
          typeof data?.detail === 'string'
            ? data.detail
            : 'skillsFailed',
        )
      }

      if (data === null) {
        throw new Error('invalidResponse')
      }

      return data as T
    },
    [token, onSessionExpired],
  )

  useEffect(() => {
    const controller = new AbortController()

    async function loadSkills() {
      try {
        const [allSkills, teachingSkills] = await Promise.all([
          request<Skill[]>(
            '/api/skills',
            'GET',
            undefined,
            controller.signal,
          ),
          request<MySkill[]>(
            '/api/users/me/skills',
            'GET',
            undefined,
            controller.signal,
          ),
        ])

        if (controller.signal.aborted) return

        if (!Array.isArray(allSkills) || !Array.isArray(teachingSkills)) {
          throw new Error('invalidResponse')
        }

        setCatalog(allSkills)
        setMySkills(teachingSkills)
        setLoaded(true)
      } catch (err) {
        if (controller.signal.aborted) return

        setError(
          err instanceof Error
            ? err.message
            : 'connectionFailed',
        )
      } finally {
        if (!controller.signal.aborted) {
          setBusy(false)
        }
      }
    }

    void loadSkills()

    return () => controller.abort()
  }, [request, retry])

  function reloadSkills() {
    setBusy(true)
    setError('')
    setNotice('')
    setRetry(value => value + 1)
  }

  async function run(action: () => Promise<void>) {
    if (busy) return

    setBusy(true)
    setError('')
    setNotice('')

    try {
      await action()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'connectionFailed',
      )
    } finally {
      setBusy(false)
    }
  }

  async function addSkill(
    event: FormEvent<HTMLFormElement>,
  ) {
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
      setNotice('skillAdded')
    })
  }

  async function updateLevel(
    id: number,
    nextLevel: Level,
  ) {
    await run(async () => {
      const updated = await request<MySkill>(
        `/api/users/me/skills/${id}`,
        'PUT',
        { experience_level: nextLevel },
      )

      setMySkills(previous =>
        previous.map(skill =>
          skill.skill_id === id ? updated : skill,
        ),
      )

      setNotice('skillLevelSaved')
    })
  }

  async function removeSkill(skill: MySkill) {
    const confirmation = t('confirmRemoveSkill').replace(
      '{name}',
      () => skill.name,
    )

    if (!window.confirm(confirmation)) return

    await run(async () => {
      await request<void>(
        `/api/users/me/skills/${skill.skill_id}`,
        'DELETE',
      )

      setMySkills(previous =>
        previous.filter(
          item => item.skill_id !== skill.skill_id,
        ),
      )

      setNotice('skillRemoved')
    })
  }

  async function createSkill(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault()

    if (!newName.trim()) return

    await run(async () => {
      const created = await request<Skill>(
        '/api/skills',
        'POST',
        { name: newName.trim() },
      )

      setCatalog(previous => [...previous, created])
      setSkillId(String(created.id))
      setNewName('')
      setNotice('skillCreated')
    })
  }

  const availableSkills = catalog
    .filter(skill =>
      !mySkills.some(item => item.skill_id === skill.id),
    )
    .sort((a, b) => a.name.localeCompare(b.name, locale))

  return (
    <section className="panel sj-account-page skill-manager">
      <div className="sj-account-page-heading">
        <div>
          <p className="sj-section-label">
            {t('account').toUpperCase()}
          </p>

          <h1>{t('mySkills')}</h1>

          <p className="muted">
            {t('skillsDescription')}
          </p>
        </div>

        <button
          type="button"
          className="button secondary"
          disabled={busy}
          onClick={reloadSkills}
        >
          {t('reload')}
        </button>
      </div>

      {busy && <p role="status">{t('processing')}</p>}

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

      {!loaded && !busy && (
        <button
          type="button"
          className="button secondary"
          onClick={reloadSkills}
        >
          {t('retry')}
        </button>
      )}

      {loaded && (
        <>
          {mySkills.length === 0 ? (
            <p className="muted">
              {t('noTeachingSkills')}
            </p>
          ) : (
            <ul className="teaching-list">
              {mySkills.map(skill => (
                <li key={skill.skill_id}>
                  <strong>{skill.name}</strong>

                  <label className="level-control">
                    {t('level')}
                    <select
                      value={skill.experience_level}
                      disabled={busy}
                      onChange={event => {
                        void updateLevel(
                          skill.skill_id,
                          event.target.value as Level,
                        )
                      }}
                    >
                      {levels.map(item => (
                        <option
                          key={item.value}
                          value={item.value}
                        >
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <button
                    type="button"
                    className="button remove-button"
                    disabled={busy}
                    onClick={() => void removeSkill(skill)}
                  >
                    {t('removeSkill')}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <p className="muted">
            {t('levelAutoSave')}
          </p>

          <form
            onSubmit={addSkill}
            className="skill-add-form"
          >
            <h3>{t('addTeachingSkill')}</h3>

            <fieldset
              className="profile-fields"
              disabled={busy}
            >
              <div className="skill-form-grid">
                <label>
                  {t('skill')}
                  <select
                    value={skillId}
                    onChange={event => {
                      setSkillId(event.target.value)
                    }}
                    required
                  >
                    <option value="">{t('selectSkill')}</option>

                    {availableSkills.map(skill => (
                      <option
                        key={skill.id}
                        value={skill.id}
                      >
                        {skill.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  {t('level')}
                  <select
                    value={level}
                    onChange={event => {
                      setLevel(event.target.value as Level)
                    }}
                  >
                    {levels.map(item => (
                      <option
                        key={item.value}
                        value={item.value}
                      >
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div>
                <button
                  className="button primary"
                  type="submit"
                  disabled={!skillId}
                >
                  {t('addToProfile')}
                </button>
              </div>
            </fieldset>
          </form>

          <details className="new-skill">
            <summary>
              {t('missingSkillPrompt')}
            </summary>

            <form onSubmit={createSkill}>
              <label>
                {t('newSkillName')}
                <input
                  value={newName}
                  onChange={event => {
                    setNewName(event.target.value)
                  }}
                  maxLength={100}
                  disabled={busy}
                  required
                />
              </label>

              <div>
                <button
                  className="button secondary"
                  type="submit"
                  disabled={busy || !newName.trim()}
                >
                  {t('createSkill')}
                </button>
              </div>
            </form>
          </details>
        </>
      )}
    </section>
  )
}