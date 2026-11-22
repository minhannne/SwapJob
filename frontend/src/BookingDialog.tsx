import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { AvailabilitySlot } from './WeekCalendar'

type TeachingSkill = {
  skill_id: number
  name: string
}

type Props = {
  token: string
  teacherName: string
  skills: TeachingSkill[]
  slot: AvailabilitySlot
  onClose: () => void
  onBooked: () => void
  onSessionExpired: () => void
}

const bookingErrors: Record<string, string> = {
  'Availability slot not found':
    'Khung giờ này không còn tồn tại.',

  'You cannot book your own time slot':
    'Bạn không thể đặt lịch của chính mình.',

  'This time slot has already started':
    'Khung giờ này đã bắt đầu. Bạn chọn giờ khác nhé.',

  'This teacher does not teach the selected skill':
    'Người dạy không còn khai báo kỹ năng này.',

  'This time slot is already booked':
    'Khung giờ này đã có người được nhận. Bạn chọn giờ khác nhé.',

  'You already have a pending request for this slot':
    'Bạn đã gửi yêu cầu cho khung giờ này và đang chờ duyệt.',

  'Booking conflicts with related data':
    'Dữ liệu đặt lịch vừa thay đổi. Bạn tải lại lịch và thử lại nhé.',

  'Database operation unavailable':
    'Hệ thống chưa xử lý được yêu cầu. Bạn thử lại sau nhé.',
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('vi-VN', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(value))
}

export default function BookingDialog({
  token,
  teacherName,
  skills,
  slot,
  onClose,
  onBooked,
  onSessionExpired,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  const [skillId, setSkillId] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const dialog = dialogRef.current

    if (dialog && !dialog.open) {
      dialog.showModal()
    }

    return () => {
      if (dialog?.open) {
        dialog.close()
      }
    }
  }, [])

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault()

    if (busy) return

    const selectedSkillId = Number(skillId)

    if (
      !Number.isSafeInteger(selectedSkillId)
      || !skills.some(skill => skill.skill_id === selectedSkillId)
    ) {
      setError('Bạn chọn kỹ năng muốn học trước nha.')
      return
    }

    if (Date.parse(slot.starts_at) <= Date.now()) {
      setError(
        'Khung giờ này đã bắt đầu. Bạn chọn giờ khác nhé.',
      )
      return
    }

    setBusy(true)
    setError('')

    try {
      const trimmedMessage = message.trim()

      const response = await fetch('/api/bookings', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          skill_id: selectedSkillId,
          availability_slot_id: slot.id,
          ...(trimmedMessage
            ? { message: trimmedMessage }
            : {}),
        }),
      })

      if (response.status === 401) {
        onSessionExpired()
        return
      }

      const data = await response.json().catch(() => null)

      if (!response.ok) {
        const detail = typeof data?.detail === 'string'
          ? data.detail
          : ''

        setError(
          bookingErrors[detail]
            || 'Chưa gửi được yêu cầu. Bạn kiểm tra kỹ năng, lời nhắn và thử lại nhé.',
        )
        return
      }

      onBooked()
    } catch {
      setError(
        'Không thể kết nối tới máy chủ. Bạn kiểm tra backend và thử lại nhé.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="sj-booking-dialog"
      aria-labelledby="sj-booking-title"
      onCancel={event => {
        event.preventDefault()

        if (!busy) {
          onClose()
        }
      }}
    >
      <div className="sj-booking-dialog-content">
        <div className="sj-booking-dialog-heading">
          <div>
            <p className="sj-section-label">
              YÊU CẦU ĐẶT LỊCH
            </p>
            <h2 id="sj-booking-title">
              Học cùng {teacherName}
            </h2>
          </div>

          <button
            type="button"
            className="sj-booking-close"
            aria-label="Đóng hộp đặt lịch"
            disabled={busy}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="sj-booking-time">
          <strong>Khung giờ đã chọn</strong>
          <p>Bắt đầu: {formatDateTime(slot.starts_at)}</p>
          <p>Kết thúc: {formatDateTime(slot.ends_at)}</p>
          <small>Giờ Việt Nam · UTC+7</small>
        </div>

        <form onSubmit={handleSubmit}>
          <label>
            Kỹ năng muốn học
            <select
              value={skillId}
              onChange={event => {
                setSkillId(event.target.value)
              }}
              disabled={busy}
              required
            >
              <option value="">Chọn kỹ năng</option>

              {skills.map(skill => (
                <option
                  key={skill.skill_id}
                  value={skill.skill_id}
                >
                  {skill.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Lời nhắn cho người dạy
            <textarea
              value={message}
              onChange={event => {
                setMessage(event.target.value)
              }}
              placeholder="Ví dụ: Mình mới bắt đầu học Java và muốn tìm hiểu về lập trình hướng đối tượng."
              maxLength={500}
              rows={4}
              disabled={busy}
            />
          </label>

          <p className="sj-booking-hint">
            Lời nhắn không bắt buộc, tối đa 500 ký tự.
            Yêu cầu cần được người dạy chấp nhận để xác nhận
            buổi học.
          </p>

          {error && (
            <p className="message error" role="alert">
              {error}
            </p>
          )}

          <div className="sj-booking-actions">
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={onClose}
            >
              Quay lại
            </button>

            <button
              type="submit"
              className="button primary"
              disabled={busy || !skillId}
            >
              {busy ? 'Đang gửi…' : 'Gửi yêu cầu'}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  )
}