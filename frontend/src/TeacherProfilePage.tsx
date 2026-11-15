import { useEffect, useState } from 'react'
import Avatar from './Avatar'
import WeekCalendar from './WeekCalendar'
import BookingDialog from './BookingDialog'
import TeacherReviews from './TeacherReviews'
import type { AvailabilitySlot } from './WeekCalendar'

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

type ProfileData = {
  profile: TeacherProfile
  viewerId: number
}

type Props = {
  teacherId: number
  token: string
  onSessionExpired: () => void
}

const levelLabels: Record<string, string> = {
  BEGINNER: 'Cơ bản',
  INTERMEDIATE: 'Trung cấp',
  ADVANCED: 'Nâng cao',
}

async function readJson<T>(
  path: string,
  token: string,
  signal: AbortSignal,
  fallbackMessage: string,
): Promise<T> {
  const response = await fetch(path, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
    signal,
  })

  if (response.status === 401) {
    throw new Error('SESSION_EXPIRED')
  }

  if (!response.ok) {
    throw new Error(
      response.status === 404
        ? 'Không tìm thấy dữ liệu được yêu cầu.'
        : fallbackMessage,
    )
  }

  return await response.json() as T
}

export default function TeacherProfilePage({
  teacherId,
  token,
  onSessionExpired,
}: Props) {
  const [profileData, setProfileData] =
    useState<ProfileData | null>(null)

  const [profileError, setProfileError] = useState('')

  const [slots, setSlots] = useState<AvailabilitySlot[]>([])
  const [calendarLoading, setCalendarLoading] = useState(true)
  const [calendarError, setCalendarError] = useState('')

  const [selectedSlot, setSelectedSlot] =
    useState<AvailabilitySlot | null>(null)

  const [notice, setNotice] = useState('')
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    async function loadProfile() {
      try {
        const [profile, viewer] = await Promise.all([
          readJson<TeacherProfile>(
            `/api/users/${teacherId}/profile`,
            token,
            controller.signal,
            'Không thể tải hồ sơ người dạy.',
          ),
          readJson<{ id: number }>(
            '/api/auth/me',
            token,
            controller.signal,
            'Không thể xác định tài khoản đang đăng nhập.',
          ),
        ])

        if (controller.signal.aborted) return

        setProfileData({
          profile,
          viewerId: viewer.id,
        })
      } catch (err) {
        if (controller.signal.aborted) return

        if (
          err instanceof Error
          && err.message === 'SESSION_EXPIRED'
        ) {
          onSessionExpired()
          return
        }

        setProfileError(
          err instanceof Error
            ? err.message
            : 'Không thể tải hồ sơ người dạy.',
        )
      }
    }

    async function loadAvailability() {
      try {
        const data = await readJson<AvailabilitySlot[]>(
          `/api/availability/teachers/${teacherId}`,
          token,
          controller.signal,
          'Không thể tải lịch rảnh.',
        )

        if (controller.signal.aborted) return

        if (!Array.isArray(data)) {
          throw new Error(
            'Máy chủ chưa trả về danh sách lịch hợp lệ.',
          )
        }

        setSlots(data)
      } catch (err) {
        if (controller.signal.aborted) return

        if (
          err instanceof Error
          && err.message === 'SESSION_EXPIRED'
        ) {
          onSessionExpired()
          return
        }

        setCalendarError(
          err instanceof Error
            ? err.message
            : 'Không thể tải lịch rảnh.',
        )
      } finally {
        if (!controller.signal.aborted) {
          setCalendarLoading(false)
        }
      }
    }

    void loadProfile()
    void loadAvailability()

    return () => controller.abort()
  }, [teacherId, token, retry, onSessionExpired])

  const profile = profileData?.profile ?? null
  const isOwnProfile = profileData?.viewerId === teacherId

  function reloadPage() {
    setProfileData(null)
    setProfileError('')
    setSlots([])
    setCalendarError('')
    setCalendarLoading(true)
    setSelectedSlot(null)
    setNotice('')
    setRetry(value => value + 1)
  }

  function selectSlot(slot: AvailabilitySlot | null) {
    if (!slot) {
      setSelectedSlot(null)
      return
    }

    setNotice('')

    if (isOwnProfile) {
      setNotice('Bạn không thể đặt lịch của chính mình.')
      return
    }

    if (!profile || profile.skills.length === 0) {
      setNotice('Người dạy chưa khai báo kỹ năng để nhận lịch.')
      return
    }

    if (Date.parse(slot.starts_at) <= Date.now()) {
      setNotice(
        'Khung giờ này đã bắt đầu. Bạn chọn giờ khác hoặc tải lại lịch nhé.',
      )
      return
    }

    setSelectedSlot(slot)
  }

  return (
    <div className="sj-teacher-page">
      <a className="sj-back-link" href="#/explore">
        ← Quay lại kết quả tìm kiếm
      </a>

      {notice && (
        <p className="message success" role="status">
          {notice}
        </p>
      )}

      {profileError ? (
        <section className="panel">
          <p className="message error" role="alert">
            {profileError}
          </p>

          <button
            type="button"
            className="button secondary"
            onClick={reloadPage}
          >
            Thử lại
          </button>
        </section>
      ) : !profile ? (
        <section className="panel" role="status">
          Đang tải hồ sơ người dạy…
        </section>
      ) : (
        <>
          <div className="sj-teacher-layout">
            <aside className="panel sj-teacher-summary">
              <Avatar
                src={profile.avatar_url}
                name={profile.full_name}
                large
              />

              <p className="sj-section-label">
                HỒ SƠ NGƯỜI DẠY
              </p>

              <h1>{profile.full_name}</h1>

              <p className="sj-teacher-bio">
                {profile.bio
                  || 'Người dạy chưa thêm giới thiệu.'}
              </p>

              <p className="sj-teacher-skill-count">
                {profile.skills.length} kỹ năng có thể dạy
              </p>
            </aside>

            <div className="sj-teacher-content">
              <section className="panel">
                <h2>Kỹ năng có thể dạy</h2>

                <p className="muted">
                  Các kỹ năng và trình độ người dạy đã khai báo.
                </p>

                {profile.skills.length === 0 ? (
                  <p className="muted">
                    Người dạy chưa khai báo kỹ năng.
                  </p>
                ) : (
                  <ul className="sj-teacher-skills">
                    {profile.skills.map(skill => (
                      <li key={skill.skill_id}>
                        <div>
                          <h3>{skill.name}</h3>

                          {skill.description && (
                            <p>{skill.description}</p>
                          )}
                        </div>

                        <span className="sj-level-badge">
                          {levelLabels[skill.experience_level]
                            || skill.experience_level}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="panel sj-calendar-panel">
                <h2>Lịch có thể đặt</h2>

                <p className="muted">
                  {isOwnProfile
                    ? 'Đây là lịch của bạn. Người học có thể chọn giờ để gửi yêu cầu.'
                    : 'Bấm một khung giờ xanh để chọn kỹ năng và gửi yêu cầu học.'}
                </p>

                {calendarLoading ? (
                  <p role="status">Đang tải lịch rảnh…</p>
                ) : calendarError ? (
                  <div>
                    <p className="message error" role="alert">
                      {calendarError}
                    </p>

                    <button
                      type="button"
                      className="button secondary"
                      onClick={reloadPage}
                    >
                      Tải lại
                    </button>
                  </div>
                ) : (
                  <WeekCalendar
                    slots={slots}
                    selectedSlotId={selectedSlot?.id ?? null}
                    onSelectSlot={selectSlot}
                  />
                )}
              </section>
            </div>
          </div>
          <TeacherReviews
            key={teacherId}
            teacherId={teacherId}
            token={token}
            onSessionExpired={onSessionExpired}
          />
          {selectedSlot && !isOwnProfile && (
            <BookingDialog
              token={token}
              teacherName={profile.full_name}
              skills={profile.skills}
              slot={selectedSlot}
              onClose={() => setSelectedSlot(null)}
              onBooked={() => {
                setSelectedSlot(null)
                setNotice(
                  'Đã gửi yêu cầu đặt lịch. Bạn chờ người dạy chấp nhận để xác nhận buổi học nha.',
                )
              }}
              onSessionExpired={onSessionExpired}
            />
          )}
        </>
      )}
    </div>
  )
}