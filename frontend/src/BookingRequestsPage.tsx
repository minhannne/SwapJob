import { useEffect, useId, useRef, useState } from 'react'
import { translateMessage, useLanguage } from './i18n'
import type { TranslationKey } from './i18n'

type Props = {
  token: string
  onSessionExpired: () => void
}

type BookingTab = 'sent' | 'received'
type BookingAction = 'accept' | 'reject' | 'cancel'
type BookingStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED'

type Booking = {
  id: number
  learner_name: string | null
  teacher_name: string | null
  skill_name: string | null
  slot_starts_at: string | null
  slot_ends_at: string | null
  message: string | null
  status: BookingStatus
}

type BookingHistoryPage = {
  items: Booking[]
  next_cursor: number | null
}

const statusKeys: Record<BookingStatus, TranslationKey> = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
}

const actionKeys: Record<BookingAction, TranslationKey> = {
  accept: 'accept',
  reject: 'reject',
  cancel: 'cancelRequest',
}

const confirmationKeys: Record<BookingAction, TranslationKey> = {
  accept: 'confirmAccept',
  reject: 'confirmReject',
  cancel: 'confirmCancel',
}

const successKeys: Record<BookingAction, TranslationKey> = {
  accept: 'acceptSuccess',
  reject: 'rejectSuccess',
  cancel: 'cancelSuccess',
}

function formatBookingRange(
  startsAt: string | null,
  endsAt: string | null,
  locale: string,
  missingLabel: string,
) {
  if (!startsAt || !endsAt) return missingLabel

  const start = new Date(startsAt)
  const end = new Date(endsAt)

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return missingLabel
  }

  const dateFormatter = new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Asia/Ho_Chi_Minh',
  })

  const timeFormatter = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'Asia/Ho_Chi_Minh',
  })

  const startDate = dateFormatter.format(start)
  const endDate = dateFormatter.format(end)
  const startTime = timeFormatter.format(start)
  const endTime = timeFormatter.format(end)

  return startDate === endDate
    ? `${startDate} · ${startTime}–${endTime}`
    : `${startDate} ${startTime} – ${endDate} ${endTime}`
}

function BookingMessage({ message }: { message: string }) {
  const { t } = useLanguage()
  const messageId = useId()
  const textRef = useRef<HTMLParagraphElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [hasOverflow, setHasOverflow] = useState(false)

  useEffect(() => {
    const text = textRef.current
    if (!text) return

    const observer = new ResizeObserver(() => {
      const lineHeight = Number.parseFloat(
        window.getComputedStyle(text).lineHeight,
      )

      setHasOverflow(
        text.getBoundingClientRect().height > lineHeight * 2 + 1,
      )
    })

    observer.observe(text)

    return () => observer.disconnect()
  }, [])

  return (
    <div className="sj-request-message">
      <div
        id={messageId}
        className="sj-request-message-preview"
        data-expanded={expanded}
      >
        <p ref={textRef}>
          <strong>{t('message')}:</strong> {message}
        </p>
      </div>

      {(hasOverflow || expanded) && (
        <button
          className="sj-request-message-toggle"
          type="button"
          aria-expanded={expanded}
          aria-controls={messageId}
          onClick={() => setExpanded(current => !current)}
        >
          {expanded ? t('showLess') : t('showMore')}
        </button>
      )}
    </div>
  )
}

async function readError(response: Response, fallback: string) {
  const data = await response.json().catch(() => null)

  return typeof data?.detail === 'string'
    ? data.detail
    : fallback
}

export default function BookingRequestsPage({
  token,
  onSessionExpired,
}: Props) {
  const { t, locale, language } = useLanguage()

  const [tab, setTab] = useState<BookingTab>(() => {
    const query = window.location.hash.split('?')[1] ?? ''
    const params = new URLSearchParams(query)

    return params.get('tab') === 'received' ? 'received' : 'sent'
  })

  const [pendingOnly, setPendingOnly] = useState(tab === 'received')
  const [cursor, setCursor] = useState<number | null>(null)
  const [nextCursor, setNextCursor] = useState<number | null>(null)
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [notice, setNotice] = useState('')
  const [reloadCount, setReloadCount] = useState(0)
  const [processingId, setProcessingId] = useState<number | null>(null)

  const actionController = useRef<AbortController | null>(null)
    const [focusBookingId] = useState<number | null>(() => {
    const query = window.location.hash.split('?')[1] ?? ''
    const value = Number(new URLSearchParams(query).get('focus'))

    return Number.isSafeInteger(value) && value > 0 ? value : null
  })

  const [focusedBooking, setFocusedBooking] = useState<Booking | null>(null)
  const focusController = useRef<AbortController | null>(null)
  const focusedCardRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (focusBookingId === null) return

    const controller = new AbortController()
    focusController.current = controller

    async function loadFocusedBooking() {
      try {
        const response = await fetch(`/api/bookings/${focusBookingId}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        })

        if (controller.signal.aborted) return

        if (response.status === 401) {
          onSessionExpired()
          return
        }

        if (!response.ok) throw new Error('notificationTargetFailed')

        const data: Booking = await response.json()
        if (controller.signal.aborted) return

        setBookings([])
        setCursor(null)
        setPendingOnly(data.status === 'PENDING')
        setLoading(true)
        setReloadCount(value => value + 1)
        setFocusedBooking(data)
      } catch (err) {
        if (!controller.signal.aborted) {
          setActionError(
            err instanceof Error ? err.message : 'notificationTargetFailed',
          )
        }
      }
    }

    void loadFocusedBooking()
    return () => controller.abort()
  }, [focusBookingId, token, onSessionExpired])

  useEffect(() => {
    if (!focusedBooking) return
    focusedCardRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    })
    focusedCardRef.current?.focus({ preventScroll: true })
  }, [focusedBooking])

  useEffect(() => {
    const controller = new AbortController()

    async function loadBookings() {
      try {
        const params = new URLSearchParams({
          direction: tab,
          pending_only: String(pendingOnly),
        })

        if (cursor !== null) {
          params.set('before_id', String(cursor))
        }

        const response = await fetch(`/api/bookings/history?${params}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          signal: controller.signal,
        })

        if (controller.signal.aborted) return

        if (response.status === 401) {
          onSessionExpired()
          return
        }

        if (!response.ok) {
          throw new Error(
            await readError(response, 'requestsLoadFailed'),
          )
        }

        const data: BookingHistoryPage = await response.json()

        if (!Array.isArray(data?.items)) {
          throw new Error('invalidRequests')
        }

        if (controller.signal.aborted) return

        setBookings(previous =>
          cursor === null ? data.items : [...previous, ...data.items],
        )
        setNextCursor(data.next_cursor)
      } catch (err) {
        if (!controller.signal.aborted) {
          setLoadError(
            err instanceof Error ? err.message : 'requestsLoadFailed',
          )
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    void loadBookings()

    return () => controller.abort()
  }, [tab, pendingOnly, cursor, token, reloadCount, onSessionExpired])

  useEffect(() => {
    return () => actionController.current?.abort()
  }, [])

  function requestPage(nextPageCursor: number | null) {
    setLoading(true)
    setLoadError('')
    setCursor(nextPageCursor)
    setReloadCount(count => count + 1)
  }

  function reloadBookings() {
    focusController.current?.abort()
    setFocusedBooking(null)
    setBookings([])
    setNextCursor(null)
    requestPage(null)
  }

  function changeTab(nextTab: BookingTab) {
    if (nextTab === tab) return

    setTab(nextTab)
    setPendingOnly(nextTab === 'received')
    setActionError('')
    setNotice('')
    reloadBookings()
  }

  function changeFilter(nextPendingOnly: boolean) {
    if (nextPendingOnly === pendingOnly) return

    setPendingOnly(nextPendingOnly)
    setActionError('')
    setNotice('')
    reloadBookings()
  }

  async function updateBooking(
    booking: Booking,
    action: BookingAction,
  ) {
    if (
      loading
      || actionController.current
      || booking.status !== 'PENDING'
    ) {
      return
    }

    if (!window.confirm(t(confirmationKeys[action]))) return

    const controller = new AbortController()
    actionController.current = controller

    setProcessingId(booking.id)
    setActionError('')
    setNotice('')

    try {
      const response = await fetch(
        `/api/bookings/${booking.id}/${action}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          signal: controller.signal,
        },
      )

      if (controller.signal.aborted) return

      if (response.status === 401) {
        onSessionExpired()
        return
      }

      if (response.status === 409) {
        setActionError('actionConflict')
        reloadBookings()
        return
      }

      if (!response.ok) {
        throw new Error(
          await readError(response, 'actionFailed'),
        )
      }

      setNotice(successKeys[action])
      reloadBookings()
    } catch (err) {
      if (!controller.signal.aborted) {
        setActionError(
          err instanceof Error ? err.message : 'actionFailed',
        )
      }
    } finally {
      actionController.current = null

      if (!controller.signal.aborted) {
        setProcessingId(null)
      }
    }
  }
  const displayedBookings = focusedBooking
    ? [
        focusedBooking,
        ...bookings.filter(booking => booking.id !== focusedBooking.id),
      ]
    : bookings
  const actions: BookingAction[] = tab === 'sent'
    ? ['cancel']
    : ['accept', 'reject']

  const emptyKey = pendingOnly
    ? 'noPendingRequests'
    : tab === 'sent'
      ? 'noSentRequests'
      : 'noReceivedRequests'

  return (
    <section
      className="sj-account-page"
      aria-labelledby="booking-requests-title"
    >
      <div className="sj-account-page-heading">
        <div>
          <h1 id="booking-requests-title">{t('requestsTitle')}</h1>
          <p className="muted">{t('requestsDescription')}</p>
        </div>
      </div>

      <div className="sj-request-toolbar">
        <div
          className="sj-request-tabs"
          role="group"
          aria-label={t('requestKind')}
        >
          <button
            className="sj-request-tab"
            type="button"
            aria-pressed={tab === 'sent'}
            disabled={processingId !== null}
            onClick={() => changeTab('sent')}
          >
            {t('sent')}
          </button>

          <button
            className="sj-request-tab"
            type="button"
            aria-pressed={tab === 'received'}
            disabled={processingId !== null}
            onClick={() => changeTab('received')}
          >
            {t('received')}
          </button>
        </div>

        <p className="muted sj-request-timezone">
          {t('vietnamTimezone')}
        </p>
      </div>

      <div
        className="sj-request-filter"
        role="group"
        aria-label={t('statusFilter')}
      >
        <button
          className={`button ${pendingOnly ? 'secondary' : 'primary'}`}
          type="button"
          aria-pressed={!pendingOnly}
          disabled={processingId !== null}
          onClick={() => changeFilter(false)}
        >
          {t('all')}
        </button>

        <button
          className={`button ${pendingOnly ? 'primary' : 'secondary'}`}
          type="button"
          aria-pressed={pendingOnly}
          disabled={processingId !== null}
          onClick={() => changeFilter(true)}
        >
          {t('pending')}
        </button>
      </div>

      {notice && (
        <p className="message success" role="status">
          {translateMessage(notice, language)}
        </p>
      )}

      {actionError && (
        <p className="message error" role="alert">
          {translateMessage(actionError, language)}
        </p>
      )}

      {loading && <p role="status">{t('loading')}</p>}

      {loadError && (
        <>
          <p className="message error" role="alert">
            {translateMessage(loadError, language)}
          </p>

          <button
            className="button secondary"
            type="button"
            onClick={() => requestPage(cursor)}
          >
            {t('retry')}
          </button>
        </>
      )}
{(displayedBookings.length > 0 || (!loading && !loadError)) && (
        displayedBookings.length === 0 ? (
          <p className="panel muted">{t(emptyKey)}</p>
        ) : (
          <div className="sj-request-list">
            {displayedBookings.map(booking => (
                           <article
                key={booking.id}
                ref={booking.id === focusBookingId ? focusedCardRef : undefined}
                tabIndex={booking.id === focusBookingId ? -1 : undefined}
                className={`panel sj-request-card ${
                  booking.id === focusBookingId ? 'is-notification-target' : ''
                }`}
              >
                <div className="sj-request-info">
                  <div className="sj-request-title">
                    <h2>
                      {booking.skill_name ?? t('unknownSkill')}
                    </h2>

                    <p className="muted">
                      <strong>
                        {tab === 'sent' ? t('mentor') : t('learner')}:
                      </strong>{' '}
                      {(tab === 'sent'
                        ? booking.teacher_name
                        : booking.learner_name) ?? t('unknownUser')}
                    </p>
                  </div>

                  <p className="muted sj-request-time">
                    {formatBookingRange(
                      booking.slot_starts_at,
                      booking.slot_ends_at,
                      locale,
                      t('unknownTime'),
                    )}
                  </p>

                  {booking.message && (
                    <BookingMessage message={booking.message} />
                  )}
                </div>

                <div className="sj-request-side">
                  <span
                    className={`sj-request-status ${booking.status.toLowerCase()}`}
                  >
                    {t(statusKeys[booking.status])}
                  </span>

                  {booking.status === 'PENDING' && (
                    <div className="sj-request-actions">
                      {actions.map(action => (
                        <button
                          key={action}
                          className={`button sj-request-action ${
                            action === 'accept'
                              ? 'sj-request-accept'
                              : 'sj-request-decline'
                          }`}
                          type="button"
                          disabled={loading || processingId !== null}
                          onClick={() => {
                            void updateBooking(booking, action)
                          }}
                        >
                          {t(actionKeys[action])}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        )
      )}

      {nextCursor !== null && !loadError && (
        <button
          className="button secondary sj-request-more"
          type="button"
          disabled={loading || processingId !== null}
          onClick={() => requestPage(nextCursor)}
        >
          {loading ? t('loading') : t('loadMoreRequests')}
        </button>
      )}
    </section>
  )
}