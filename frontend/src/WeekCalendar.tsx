import { useEffect, useState } from 'react'
import { useLanguage } from './i18n'
import type { TranslationKey } from './i18n'

export type AvailabilitySlot = {
  id: number
  teacher_id: number
  starts_at: string
  ends_at: string
  slot_status?: 'AVAILABLE' | 'PENDING' | 'BOOKED'
  has_booking_requests?: boolean
}

type Props = {
  slots: AvailabilitySlot[]
  selectedSlotId: number | null
  onSelectSlot: (slot: AvailabilitySlot | null) => void
  legendLabel?: string
  emptyMessage?: string
  showStatusLegend?: boolean
}

const DAY_MS = 24 * 60 * 60 * 1000
const MINUTE_MS = 60 * 1000
const VN_OFFSET_MS = 7 * 60 * 60 * 1000
const HOUR_HEIGHT = 56

const slotStatusKeys: Record<
  'AVAILABLE' | 'PENDING' | 'BOOKED',
  TranslationKey
> = {
  AVAILABLE: 'slotAvailable',
  PENDING: 'slotPending',
  BOOKED: 'slotBooked',
}

function getCurrentMonday() {
  const now = new Date(Date.now() + VN_OFFSET_MS)
  const daysSinceMonday = (now.getUTCDay() + 6) % 7

  return Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - daysSinceMonday,
  )
}

function formatMinutes(minutes: number) {
  const rounded = Math.floor(minutes)
  const hours = Math.floor(rounded / 60)
  const remainingMinutes = rounded % 60

  return `${String(hours).padStart(2, '0')}:${String(
    remainingMinutes,
  ).padStart(2, '0')}`
}

export default function WeekCalendar({
  slots,
  selectedSlotId,
  onSelectSlot,
  legendLabel,
  emptyMessage,
  showStatusLegend = false,
}: Props) {
  const { t, locale, language } = useLanguage()
  const [weekStart, setWeekStart] = useState(getCurrentMonday)
  const [currentTime, setCurrentTime] = useState(() => Date.now())

  const weekdays = language === 'vi'
    ? ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']
    : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

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

  function formatDate(day: number, includeYear = false) {
    return new Intl.DateTimeFormat(locale, {
      day: '2-digit',
      month: '2-digit',
      ...(includeYear ? { year: 'numeric' as const } : {}),
      timeZone: 'UTC',
    }).format(new Date(day))
  }

  const nowInVietnam = new Date(currentTime + VN_OFFSET_MS)
  const today = Date.UTC(
    nowInVietnam.getUTCFullYear(),
    nowInVietnam.getUTCMonth(),
    nowInVietnam.getUTCDate(),
  )

  const days = Array.from(
    { length: 7 },
    (_, index) => weekStart + index * DAY_MS,
  )

  const events = days.flatMap((day, dayIndex) =>
    slots.flatMap(slot => {
      const startsAt = Date.parse(slot.starts_at)
      const endsAt = Date.parse(slot.ends_at)

      if (
        !Number.isFinite(startsAt)
        || !Number.isFinite(endsAt)
        || endsAt <= startsAt
        || endsAt <= currentTime
      ) {
        return []
      }

      const start = startsAt + VN_OFFSET_MS
      const end = endsAt + VN_OFFSET_MS
      const visibleStart = Math.max(start, day)
      const visibleEnd = Math.min(end, day + DAY_MS)

      if (visibleEnd <= visibleStart) return []

      return [{
        slot,
        dayIndex,
        startMinutes: (visibleStart - day) / MINUTE_MS,
        endMinutes: (visibleEnd - day) / MINUTE_MS,
      }]
    }),
  )

  const firstHour = Math.min(
    8,
    ...events.map(event => Math.floor(event.startMinutes / 60)),
  )
  const lastHour = Math.max(
    22,
    ...events.map(event => Math.ceil(event.endMinutes / 60)),
  )
  const hours = Array.from(
    { length: lastHour - firstHour },
    (_, index) => firstHour + index,
  )
  const gridHeight = (lastHour - firstHour) * HOUR_HEIGHT

  function changeWeek(direction: number) {
    setWeekStart(current => current + direction * 7 * DAY_MS)
    onSelectSlot(null)
  }

  return (
    <div className="sj-week-calendar">
      <div className="sj-calendar-toolbar">
        <div className="sj-calendar-navigation">
          <button
            type="button"
            className="sj-calendar-control"
            aria-label={t('previousWeek')}
            onClick={() => changeWeek(-1)}
          >
            ‹
          </button>
          <button
            type="button"
            className="sj-calendar-control"
            onClick={() => {
              setWeekStart(getCurrentMonday())
              onSelectSlot(null)
            }}
          >
            {t('today')}
          </button>
          <button
            type="button"
            className="sj-calendar-control"
            aria-label={t('nextWeek')}
            onClick={() => changeWeek(1)}
          >
            ›
          </button>
        </div>

        <strong className="sj-calendar-period">
          {formatDate(weekStart)} –{' '}
          {formatDate(weekStart + 6 * DAY_MS, true)}
        </strong>
      </div>

      <p className="sj-calendar-timezone">{t('vietnamTimezone')}</p>

      {events.length === 0 && (
        <p className="sj-calendar-empty" role="status">
          {emptyMessage ?? t('calendarEmpty')}
        </p>
      )}

      <div
        className="sj-calendar-scroll"
        role="region"
        aria-label={t('calendarRegion')}
        tabIndex={0}
      >
        <div className="sj-calendar-board">
          <div className="sj-calendar-head">
            <div className="sj-calendar-hour-heading">{t('time')}</div>

            {days.map((day, index) => (
              <div
                key={day}
                className={
                  day === today
                    ? 'sj-calendar-day-heading is-today'
                    : 'sj-calendar-day-heading'
                }
              >
                <strong>{weekdays[index]}</strong>
                <span>{formatDate(day)}</span>
              </div>
            ))}
          </div>

          <div className="sj-calendar-body">
            <div className="sj-calendar-hours" style={{ height: gridHeight }}>
              {hours.map(hour => (
                <span
                  key={hour}
                  style={{ top: (hour - firstHour) * HOUR_HEIGHT }}
                >
                  {String(hour).padStart(2, '0')}:00
                </span>
              ))}
            </div>

            {days.map((day, dayIndex) => (
              <div
                key={day}
                className="sj-calendar-day-column"
                style={{ height: gridHeight }}
              >
                {events
                  .filter(event => event.dayIndex === dayIndex)
                  .map(event => {
                    const startLabel = formatMinutes(event.startMinutes)
                    const endLabel = formatMinutes(event.endMinutes)
                    const duration = event.endMinutes - event.startMinutes
                    const label = `${startLabel}–${endLabel}`
                    const slotStatus = event.slot.slot_status ?? 'AVAILABLE'
                    const statusLabel = showStatusLegend
                      ? t(slotStatusKeys[slotStatus])
                      : ''

                    return (
                      <button
                        key={`${event.slot.id}-${dayIndex}`}
                        type="button"
                        className={`sj-calendar-event ${slotStatus.toLowerCase()} ${
                          selectedSlotId === event.slot.id ? 'is-selected' : ''
                        }`}
                        style={{
                          top: (event.startMinutes - firstHour * 60) * HOUR_HEIGHT / 60,
                          height: duration * HOUR_HEIGHT / 60,
                        }}
                        aria-label={`${t('selectSlotOn')} ${formatDate(day, true)}, ${label} ${statusLabel}`}
                        aria-pressed={selectedSlotId === event.slot.id}
                        title={`${label} ${statusLabel}`}
                        onClick={() => onSelectSlot(event.slot)}
                      >
                        {duration < 30 ? startLabel : label}
                        {statusLabel && duration >= 60 && (
                          <span className="sj-calendar-event-status">
                            {statusLabel}
                          </span>
                        )}
                      </button>
                    )
                  })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {showStatusLegend ? (
        <div className="sj-calendar-state-legend">
          <span className="sj-calendar-key available">{t('slotAvailable')}</span>
          <span className="sj-calendar-key pending">{t('slotPending')}</span>
          <span className="sj-calendar-key booked">{t('slotBooked')}</span>
        </div>
      ) : (
        <p className="sj-calendar-legend">
          <span aria-hidden="true" />
          {legendLabel ?? t('calendarBookable')}
        </p>
      )}
    </div>
  )
}