import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import Avatar from './Avatar'
import { translateMessage, useLanguage } from './i18n'

type Profile = {
  id: number
  email: string
  full_name: string
  role: string
  bio: string | null
  avatar_url: string | null
}

type Props = {
  token: string
  onSessionExpired?: () => void
  onProfileChange?: (profile: Profile) => void
}

type ProfileError = {
  message: string
  informationSaved?: boolean
}

export default function ProfileEditor({
  token,
  onSessionExpired,
  onProfileChange,
}: Props) {
  const { t, language } = useLanguage()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [fullName, setFullName] = useState('')
  const [bio, setBio] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')

  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')

  const [busy, setBusy] = useState(true)
  const [error, setError] = useState<ProfileError | null>(null)
  const [notice, setNotice] = useState('')
  const [retry, setRetry] = useState(0)

  const fileInput = useRef<HTMLInputElement>(null)
  const avatarHintId = useId()
  const fileNameId = useId()

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
      }
    }
  }, [previewUrl])

  const request = useCallback(
    async function request<T>(
      path: string,
      options: RequestInit = {},
    ): Promise<T> {
      const headers = new Headers(options.headers)
      headers.set('Accept', 'application/json')
      headers.set('Authorization', `Bearer ${token}`)

      const response = await fetch(path, {
        ...options,
        headers,
      })

      if (response.status === 401) {
        if (!options.signal?.aborted) {
          onSessionExpired?.()
        }

        throw new Error('sessionExpired')
      }

      const data = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(
          typeof data?.detail === 'string'
            ? data.detail
            : 'profileFailed',
        )
      }

      if (data === null) {
        throw new Error('invalidResponse')
      }

      return data as T
    },
    [token, onSessionExpired],
  )

  const applyProfile = useCallback((data: Profile) => {
    setProfile(data)
    setFullName(data.full_name)
    setBio(data.bio ?? '')
    setAvatarUrl(data.avatar_url ?? '')
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    async function loadProfile() {
      try {
        const data = await request<Profile>(
          '/api/users/me',
          { signal: controller.signal },
        )

        if (controller.signal.aborted) return

        applyProfile(data)
        onProfileChange?.(data)
      } catch (err) {
        if (controller.signal.aborted) return

        setError({
          message: err instanceof Error
            ? err.message
            : 'connectionFailed',
        })
      } finally {
        if (!controller.signal.aborted) {
          setBusy(false)
        }
      }
    }

    void loadProfile()

    return () => controller.abort()
  }, [request, applyProfile, onProfileChange, retry])

  function clearSelection() {
    setSelectedFile(null)
    setPreviewUrl('')

    if (fileInput.current) {
      fileInput.current.value = ''
    }
  }

  function reloadProfile() {
    setBusy(true)
    setError(null)
    setNotice('')
    clearSelection()
    setRetry(value => value + 1)
  }

  function chooseImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    setError(null)
    setNotice('')

    if (!file) return

    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/webp',
    ]

    if (!allowedTypes.includes(file.type)) {
      clearSelection()
      setError({ message: 'invalidAvatarType' })
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      clearSelection()
      setError({ message: 'avatarTooLarge' })
      return
    }

    setSelectedFile(file)
    setPreviewUrl(URL.createObjectURL(file))
  }

  async function saveProfile(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault()

    if (busy) return

    setError(null)
    setNotice('')

    if (!fullName.trim()) {
      setError({ message: 'fullNameRequired' })
      return
    }

    setBusy(true)
    let informationSaved = false

    try {
      const saved = await request<Profile>('/api/users/me', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          full_name: fullName.trim(),
          bio: bio.trim() || null,
          avatar_url: avatarUrl || null,
        }),
      })

      applyProfile(saved)
      onProfileChange?.(saved)
      informationSaved = true

      if (selectedFile) {
        const formData = new FormData()
        formData.append('file', selectedFile)

        const uploaded = await request<{
          avatar_url: string
        }>('/api/users/me/avatar', {
          method: 'POST',
          body: formData,
        })

        const updated = {
          ...saved,
          avatar_url: uploaded.avatar_url,
        }

        applyProfile(updated)
        onProfileChange?.(updated)
        clearSelection()
      }

      setNotice('profileSaved')
    } catch (err) {
      setError({
        message: err instanceof Error
          ? err.message
          : 'connectionFailed',
        informationSaved,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel sj-account-page my-profile">
      <div className="sj-account-page-heading">
        <div>
          <p className="sj-section-label">
            {t('account').toUpperCase()}
          </p>

          <h1>{t('myProfile')}</h1>

          <p className="muted">
            {t('profileDescription')}
          </p>
        </div>
      </div>

      {busy && <p role="status">{t('processing')}</p>}

      {error && (
        <p className="message error" role="alert">
          {error.informationSaved && (
            <>{t('profileSavedAvatarFailed')}{' '}</>
          )}
          {translateMessage(error.message, language)}
        </p>
      )}

      {notice && (
        <p className="message success" role="status">
          {translateMessage(notice, language)}
        </p>
      )}

      {!profile && !busy && (
        <button
          type="button"
          className="button secondary"
          onClick={reloadProfile}
        >
          {t('retry')}
        </button>
      )}

      {profile && (
        <form onSubmit={saveProfile}>
          <p className="muted">
            {t('email')}: {profile.email}
          </p>

          <fieldset
            className="profile-fields"
            disabled={busy}
          >
            <div className="avatar-editor">
              <Avatar
                src={previewUrl || avatarUrl || null}
                name={fullName}
                large
              />

              <div>
                <input
                  ref={fileInput}
                  className="sj-avatar-file-input"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  aria-label={t('chooseAvatar')}
                  onChange={chooseImage}
                  hidden
                />

                <div className="sj-avatar-file-control">
                  <button
                    className="button secondary"
                    type="button"
                    aria-describedby={`${avatarHintId} ${fileNameId}`}
                    onClick={() => fileInput.current?.click()}
                  >
                    {t('chooseAvatar')}
                  </button>

                  <span
                    id={fileNameId}
                    className="sj-avatar-file-name"
                    aria-live="polite"
                  >
                    {selectedFile?.name ?? t('noFileSelected')}
                  </span>
                </div>

                <p id={avatarHintId} className="muted">
                  {t('avatarHint')}
                </p>

                {selectedFile && (
                  <button
                    className="text-button"
                    type="button"
                    onClick={clearSelection}
                  >
                    {t('removeSelectedImage')}
                  </button>
                )}
              </div>
            </div>

            <label>
              {t('fullName')}
              <input
                value={fullName}
                onChange={event => {
                  setFullName(event.target.value)
                }}
                autoComplete="name"
                maxLength={100}
                required
              />
            </label>

            <label>
              {t('bio')}
              <textarea
                value={bio}
                onChange={event => {
                  setBio(event.target.value)
                }}
                maxLength={2000}
                rows={4}
              />
            </label>

            <div>
              <button
                className="button primary"
                type="submit"
              >
                {t('saveProfile')}
              </button>
            </div>
          </fieldset>
        </form>
      )}
    </section>
  )
}