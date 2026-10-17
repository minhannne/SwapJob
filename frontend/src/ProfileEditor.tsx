import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import Avatar from './Avatar'

type Profile = {
  id: number
  email: string
  full_name: string
  role: string
  bio: string | null
  avatar_url: string | null
}

export default function ProfileEditor({ token }: { token: string }) {
  const [opened, setOpened] = useState(false)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [fullName, setFullName] = useState('')
  const [bio, setBio] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  async function request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const headers = new Headers(options.headers)
    headers.set('Authorization', `Bearer ${token}`)

    const response = await fetch(path, { ...options, headers })
    const data = await response.json()

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Phiên đăng nhập hết hạn. Hãy đăng xuất và đăng nhập lại.')
      }

      const message = typeof data.detail === 'string'
        ? data.detail
        : Array.isArray(data.detail)
          ? data.detail.map((item: { msg: string }) => item.msg).join('; ')
          : 'Không thể xử lý hồ sơ.'

      throw new Error(message)
    }

    return data as T
  }

  function applyProfile(data: Profile) {
    setProfile(data)
    setFullName(data.full_name)
    setBio(data.bio ?? '')
    setAvatarUrl(data.avatar_url ?? '')
  }

  function clearSelection() {
    setSelectedFile(null)
    setPreviewUrl('')
    if (fileInput.current) fileInput.current.value = ''
  }

  async function openProfile() {
    setBusy(true)
    setError('')
    setNotice('')
    setOpened(true)
    clearSelection()

    try {
      applyProfile(await request<Profile>('/api/users/me'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể kết nối.')
    } finally {
      setBusy(false)
    }
  }

  function chooseImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    setError('')
    setNotice('')

    if (!file) return

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']

    if (!allowedTypes.includes(file.type)) {
      setError('Vui lòng chọn ảnh JPG, PNG hoặc WebP.')
      event.target.value = ''
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('Ảnh không được lớn hơn 5 MB.')
      event.target.value = ''
      return
    }

    setSelectedFile(file)
    setPreviewUrl(URL.createObjectURL(file))
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setNotice('')

    if (!fullName.trim()) {
      setError('Họ và tên không được để trống.')
      return
    }

    setBusy(true)
    let informationSaved = false

    try {
      const saved = await request<Profile>('/api/users/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName.trim(),
          bio: bio.trim() || null,
          avatar_url: avatarUrl || null,
        }),
      })

      applyProfile(saved)
      informationSaved = true

      if (selectedFile) {
        const formData = new FormData()
        formData.append('file', selectedFile)

        const uploaded = await request<{ avatar_url: string }>(
          '/api/users/me/avatar',
          {
            method: 'POST',
            body: formData,
          },
        )

        applyProfile({ ...saved, avatar_url: uploaded.avatar_url })
        clearSelection()
      }

      setNotice('Đã lưu hồ sơ và ảnh đại diện hiện tại.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Không thể kết nối.'

      setError(informationSaved
        ? `Thông tin hồ sơ đã lưu, nhưng ảnh chưa tải lên được: ${message}`
        : message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="my-profile">
      <button
        className="button secondary"
        type="button"
        disabled={busy}
        onClick={() => {
          if (opened) {
            setOpened(false)
          } else {
            void openProfile()
          }
        }}
      >
        {opened ? 'Đóng hồ sơ của tôi' : 'Hồ sơ của tôi'}
      </button>

      {opened && (
        <div className="panel profile-panel">
          <h2>Hồ sơ của tôi</h2>

          {busy && <p role="status">Đang xử lý…</p>}
          {error && <p className="message error" role="alert">{error}</p>}
          {notice && <p className="message success" role="status">{notice}</p>}

          {!profile && !busy && (
            <button
              className="button secondary"
              onClick={() => void openProfile()}
            >
              Thử tải lại
            </button>
          )}

          {profile && (
            <form onSubmit={saveProfile}>
              <p className="muted">Email: {profile.email}</p>

              <fieldset className="profile-fields" disabled={busy}>
                <div className="avatar-editor">
                  <Avatar
                    src={previewUrl || avatarUrl || null}
                    name={fullName}
                    large
                  />

                  <div>
                    <label>
                      Chọn ảnh đại diện
                      <input
                        ref={fileInput}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={chooseImage}
                      />
                    </label>

                    <p className="muted">
                      JPG, PNG hoặc WebP, tối đa 5 MB.
                      Bấm Lưu hồ sơ để tải ảnh lên.
                    </p>

                    {selectedFile && (
                      <button
                        className="text-button"
                        type="button"
                        onClick={clearSelection}
                      >
                        Bỏ ảnh vừa chọn
                      </button>
                    )}
                  </div>
                </div>

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

                <label>
                  Giới thiệu
                  <textarea
                    value={bio}
                    onChange={event => setBio(event.target.value)}
                    maxLength={2000}
                    rows={4}
                  />
                </label>

                <button className="button primary" type="submit">
                  Lưu hồ sơ
                </button>
              </fieldset>
            </form>
          )}
        </div>
      )}
    </section>
  )
}