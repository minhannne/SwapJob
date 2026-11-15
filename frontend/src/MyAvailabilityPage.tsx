import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import WeekCalendar from './WeekCalendar'
import type { AvailabilitySlot } from './WeekCalendar'
import VietnamDateTimePicker from './VietnamDateTimePicker'
import { translateMessage, useLanguage } from './i18n'

type Props = {
  token: string
  onSessionExpired: () => void
}

type MyAvailabilitySlot = AvailabilitySlot & {
  slot_status: 'AVAILABLE' | 'PENDING' | 'BOOKED'
  has_booking_requests: boolean
}

function toVietnamTimestamp(value: string) {
  return `${value.length === 16 ? `${value}:00` : value}+07:00`
}

export default function MyAvailabilityPage({
  token,
  onSessionExpired,
}: Props) {
  const { t, locale, language } = useLanguage()

  const [slots, setSlots] = useState<MyAvailabilitySlot[]>([])
  const [selectedSlotId, setSelectedSlotId] = useState<number | null>(null)
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [currentTime, setCurrentTime] = useState(() => Date.now())
  const [loading, setLoading] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [reloadCount, setReloadCount] = useState(0)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const selectedSlotPanelRef = useRef<HTMLDivElement>(null)

  const dateTimeFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Asia/Ho_Chi_Minh',
    hourCycle: 'h23',
  })

  const request = useCallback(async (
    path: string,
    options: RequestInit = {},
  ) => {
    const headers = new Headers(options.headers)
    headers.set('Authorization', `Bearer ${token}`)

    if (options.body) headers.set('Content-Type', 'application/json')

    const response = await fetch(path, { ...options, headers })

    if (response.status === 401) {
      onSessionExpired()
      throw new Error('sessionExpired')
    }

    if (!response.ok) {
      const data = await response.json().catch(() => null)

      throw new Error(
        typeof data?.detail === 'string'
          ? data.detail
          : 'availabilityFailed',
      )
    }

    return response
  }, [token, onSessionExpired])

  // Cập nhật giờ để tự ẩn khung giờ đã kết thúc.
  useEffect(() => {
    function updateTime() {
      setCurrentTime(Date.now())
    }

    const timer = window.setInterval(updateTime, 1000)
    window.addEventListener('focus', updateTime)

    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', updateTime)
    }
  }, [])

  // Tải trạng thái mới mỗi 15 giây và khi quay lại cửa sổ.
  useEffect(() => {
    if (saving) return

    const controller = new AbortController()
    let fetching = false

    async function loadSlots() {
      if (fetching || controller.signal.aborted) return
      fetching = true

      try {
        const response = await request('/api/availability/me', {
          signal: controller.signal,
        })
        const data: MyAvailabilitySlot[] = await response.json()

        if (!Array.isArray(data)) throw new Error('invalidResponse')

        if (!controller.signal.aborted) {
          setSlots(data)
          setLoaded(true)
          setLoadError('')
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setLoadError(
            err instanceof Error ? err.message : 'availabilityLoadFailed',
          )
        }
      } finally {
        fetching = false
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    function refreshSlots() {
      void loadSlots()
    }

    refreshSlots()
    const timer = window.setInterval(refreshSlots, 15_000)
    window.addEventListener('focus', refreshSlots)

    return () => {
      controller.abort()
      window.clearInterval(timer)
      window.removeEventListener('focus', refreshSlots)
    }
  }, [request, reloadCount, saving])

  useEffect(() => {
    if (selectedSlotId === null || saving) return

    function handlePointerDown(event: PointerEvent) {
      const target = event.target
      if (!(target instanceof Element)) return
      if (selectedSlotPanelRef.current?.contains(target)) return
      if (target.closest('.sj-calendar-event')) return
      setSelectedSlotId(null)
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setSelectedSlotId(null)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [selectedSlotId, saving])
    const selectedDate = startsAt.split('T')[0]

  function changeDate(value: string) {
    const nextDate = value.split('T')[0]

    setStartsAt(previous => {
      const time = previous.split('T')[1] ?? ''
      return `${nextDate}T${time}`
    })

    setEndsAt(previous => {
      const time = previous.split('T')[1] ?? ''
      return `${nextDate}T${time}`
    })
  }

  async function addSlot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!loaded || saving) return

    setError('')
    setNotice('')

    if (startsAt.length < 16 || endsAt.length < 16) {
      setError('missingDateTime')
      return
    }

    const start = toVietnamTimestamp(startsAt)
    const end = toVietnamTimestamp(endsAt)
    const startTimestamp = Date.parse(start)
    const endTimestamp = Date.parse(end)

    if (!Number.isFinite(startTimestamp) || !Number.isFinite(endTimestamp)) {
      setError('invalidDateTime')
      return
    }

    if (endTimestamp <= startTimestamp) {
      setError('invalidSlotOrder')
      return
    }

    if (startTimestamp <= Date.now()) {
      setError('slotInPast')
      return
    }

    setSaving(true)

    try {
      const response = await request('/api/availability', {
        method: 'POST',
        body: JSON.stringify({ starts_at: start, ends_at: end }),
      })
      const created: AvailabilitySlot = await response.json()

      setSlots(previous => [
        ...previous,
        {
          ...created,
          slot_status: 'AVAILABLE',
          has_booking_requests: false,
        },
      ])
      setStartsAt('')
      setEndsAt('')
      setNotice('slotAdded')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'availabilityCreateFailed')
    } finally {
      setSaving(false)
    }
  }

  async function deleteSlot(slot: MyAvailabilitySlot) {
    if (saving) return

    if (slot.has_booking_requests) {
      setError('slotHistoryNotice')
      return
    }

    if (!window.confirm(t('confirmDeleteSlot'))) return

    setSaving(true)
    setError('')
    setNotice('')

    try {
      await request(`/api/availability/${slot.id}`, { method: 'DELETE' })
      setSlots(previous => previous.filter(item => item.id !== slot.id))
      setSelectedSlotId(null)
      setNotice('slotDeleted')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'availabilityDeleteFailed')
    } finally {
      setSaving(false)
    }
  }

  const visibleSlots = slots.filter(
    slot => Date.parse(slot.ends_at) > currentTime,
  )
  const selectedSlot = visibleSlots.find(
    slot => slot.id === selectedSlotId,
  )

  return (
    <section aria-labelledby="my-availability-title">
      <h1 id="my-availability-title">{t('myAvailability')}</h1>
    

      {loadError && (
        <p className="message error" role="alert">
          {translateMessage(loadError, language)}
        </p>
      )}
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
      {loading && <p role="status">{t('loading')}</p>}

      {!loading && !loaded && (
        <button
          className="button secondary"
          type="button"
          onClick={() => {
            setLoading(true)
            setReloadCount(count => count + 1)
          }}
        >
          {t('retry')}
        </button>
      )}

      {loaded && (
        <>
          <form className="panel" onSubmit={addSlot}>
            <h2>{t('addTimeSlot')}</h2>

            <fieldset className="profile-fields" disabled={saving}>
                            <div className="skill-form-grid sj-availability-form-grid">
                <VietnamDateTimePicker
                  label={t('date')}
                  value={startsAt}
                  onChange={changeDate}
                  dateOnly
                />

                <label>
                  {t('startTime')}
                  <input
                    type="time"
                    value={startsAt.split('T')[1] ?? ''}
                    disabled={!selectedDate}
                    required
                    onChange={event => {
                      setStartsAt(`${selectedDate}T${event.target.value}`)
                    }}
                  />
                </label>

                <label>
                  {t('endTime')}
                  <input
                    type="time"
                    value={endsAt.split('T')[1] ?? ''}
                    disabled={!selectedDate}
                    required
                    onChange={event => {
                      setEndsAt(`${selectedDate}T${event.target.value}`)
                    }}
                  />
                </label>
              </div>

              <button className="button primary" type="submit">
                {saving ? t('processing') : t('addToCalendar')}
              </button>
            </fieldset>
          </form>

          <section className="panel">
            <h2>{t('weeklyCalendar')}</h2>
            <p className="muted">{t('selectSlotHint')}</p>

            {selectedSlot && (
              <div className="panel" ref={selectedSlotPanelRef}>
                <p>
                  <strong>{t('selectedTimeSlot')}</strong>
                  <br />
                  {dateTimeFormatter.format(new Date(selectedSlot.starts_at))}
                  {' – '}
                  {dateTimeFormatter.format(new Date(selectedSlot.ends_at))}
                </p>

                {selectedSlot.slot_status === 'BOOKED' && (
                  <p className="muted">{t('bookedSlotNotice')}</p>
                )}

                {selectedSlot.slot_status === 'PENDING' && (
                  <p className="muted">{t('pendingSlotNotice')}</p>
                )}

                {selectedSlot.slot_status === 'AVAILABLE'
                  && selectedSlot.has_booking_requests && (
                    <p className="muted">{t('slotHistoryNotice')}</p>
                  )}

                <div className="sj-availability-actions">
                  {!selectedSlot.has_booking_requests && (
                    <button
                      className="button remove-button"
                      type="button"
                      disabled={saving}
                      onClick={() => void deleteSlot(selectedSlot)}
                    >
                      {t('deleteTimeSlot')}
                    </button>
                  )}

                  {selectedSlot.slot_status === 'PENDING' && (
                    <a
                      className="button secondary"
                      href="#/bookings?tab=received"
                    >
                      {t('viewReceivedRequests')}
                    </a>
                  )}

                  <button
                    className="button secondary"
                    type="button"
                    disabled={saving}
                    onClick={() => setSelectedSlotId(null)}
                  >
                    {t('close')}
                  </button>
                </div>
              </div>
            )}

            <WeekCalendar
              slots={visibleSlots}
              selectedSlotId={selectedSlotId}
              onSelectSlot={slot => {
                if (saving) return
                const nextSlotId = slot?.id ?? null

                setSelectedSlotId(current =>
                  current === nextSlotId ? null : nextSlotId,
                )
              }}
              showStatusLegend
              emptyMessage={t('availabilityEmpty')}
            />
          </section>
        </>
      )}
    </section>
  )
}