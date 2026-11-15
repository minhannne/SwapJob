import { useId, useRef, useState } from 'react'
import { useLanguage } from './i18n'

type Props = {
  label: string
  timeLabel?: string
  dateOnly?: boolean
  value: string
  onChange: (value: string) => void
}

const VN_OFFSET_MS = 7 * 60 * 60 * 1000

export default function VietnamDateTimePicker({
  label,
  timeLabel,
  dateOnly = false,
  value,
  onChange,
}: Props) {
  const { t, locale, language } = useLanguage()
  const calendarId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [month, setMonth] = useState<number | null>(null)

  const weekdays = language === 'vi'
    ? ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']
    : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  const monthFormatter = new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })

  const dateFormatter = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })

  const [date = '', time = ''] = value.split('T')
  const monthDate = month === null ? null : new Date(month)
  const year = monthDate?.getUTCFullYear() ?? 0
  const monthIndex = monthDate?.getUTCMonth() ?? 0
  const firstWeekday = monthDate ? (monthDate.getUTCDay() + 6) % 7 : 0
  const dayCount = monthDate
    ? new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
    : 0

  const selectedDateLabel = date
    ? dateFormatter.format(new Date(`${date}T00:00:00Z`))
    : t('chooseDate')

  function toggleCalendar() {
    if (month !== null) {
      setMonth(null)
      return
    }

    const reference = date
      ? new Date(`${date}T00:00:00Z`)
      : new Date(Date.now() + VN_OFFSET_MS)

    setMonth(
      Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), 1),
    )
  }

  function closeCalendar() {
    setMonth(null)
    triggerRef.current?.focus()
  }

  return (
    <div
    className={`sj-date-picker${dateOnly ? ' is-date-only' : ''}`}
      onKeyDown={event => {
        if (event.key === 'Escape' && month !== null) {
          closeCalendar()
        }
      }}
    >
      <div className="sj-date-picker-fields">
        <div>
          <span>{label}</span>

          <button
            ref={triggerRef}
            className="button secondary"
            type="button"
            aria-label={`${label}, ${selectedDateLabel}`}
            aria-expanded={month !== null}
            aria-controls={month !== null ? calendarId : undefined}
            onClick={toggleCalendar}
          >
            {selectedDateLabel}
          </button>
        </div>

                {!dateOnly && (
          <label>
            {timeLabel ?? t('time')}
            <input
              type="time"
              value={time}
              disabled={!date}
              required
              onChange={event => {
                onChange(`${date}T${event.target.value}`)
              }}
            />
          </label>
        )}
      </div>

      {monthDate && (
        <div id={calendarId} className="sj-date-picker-calendar">
          <div className="sj-date-picker-toolbar">
            <button
              className="button secondary"
              type="button"
              aria-label={t('previousMonth')}
              onClick={() => {
                setMonth(Date.UTC(year, monthIndex - 1, 1))
              }}
            >
              ‹
            </button>

            <strong aria-live="polite">
              {monthFormatter.format(monthDate)}
            </strong>

            <button
              className="button secondary"
              type="button"
              aria-label={t('nextMonth')}
              onClick={() => {
                setMonth(Date.UTC(year, monthIndex + 1, 1))
              }}
            >
              ›
            </button>
          </div>

          <div className="sj-date-picker-days">
            {weekdays.map(day => (
              <span key={day}>{day}</span>
            ))}

            {Array.from({ length: firstWeekday }, (_, index) => (
              <span key={`blank-${index}`} aria-hidden="true" />
            ))}

            {Array.from({ length: dayCount }, (_, index) => {
              const dayDate = new Date(Date.UTC(year, monthIndex, index + 1))
              const dateValue = dayDate.toISOString().slice(0, 10)

              return (
                <button
                  key={dateValue}
                  type="button"
                  aria-label={dateFormatter.format(dayDate)}
                  aria-pressed={date === dateValue}
                  onClick={() => {
                    onChange(`${dateValue}T${time}`)
                    closeCalendar()
                  }}
                >
                  {index + 1}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}