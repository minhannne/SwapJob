import { useCallback, useEffect, useRef, useState } from 'react'
import { translateMessage, useLanguage } from './i18n'
import type { TranslationKey } from './i18n'

type Props = {
  token: string
  onSessionExpired: () => void
}

type Notification = {
  id: number
  booking_request_id: number | null
  type: string
  message: string
  is_read: boolean
  created_at: string
  actor_name: string | null
  skill_name: string | null
}

type NotificationPage = {
  items: Notification[]
  next_cursor: number | null
  has_unread: boolean
}

const notificationKeys: Partial<Record<string, TranslationKey>> = {
  BOOKING_REQUESTED: 'notificationRequested',
  BOOKING_ACCEPTED: 'notificationAccepted',
  BOOKING_REJECTED: 'notificationRejected',
}

function formatTime(value: string, locale: string, now: number) {
  const seconds = Math.min(
    0,
    Math.round((Date.parse(value) - now) / 1000),
  )
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })

  if (seconds > -60) return formatter.format(seconds, 'second')
  if (seconds > -3600) return formatter.format(Math.trunc(seconds / 60), 'minute')
  if (seconds > -86400) return formatter.format(Math.trunc(seconds / 3600), 'hour')

  return formatter.format(Math.trunc(seconds / 86400), 'day')
}

export default function NotificationBell({
  token,
  onSessionExpired,
}: Props) {
  const { t, language, locale } = useLanguage()

  const [open, setOpen] = useState(false)
  const [hasUnread, setHasUnread] = useState(false)
  const [items, setItems] = useState<Notification[]>([])
  const [cursor, setCursor] = useState<number | null>(null)
  const [nextCursor, setNextCursor] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [refreshTick, setRefreshTick] = useState(0)
  const [now, setNow] = useState(() => Date.now())

  const wrapperRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const readController = useRef<AbortController | null>(null)
  const mutationRevision = useRef(0)

  const request = useCallback(
    async function request<T>(
      path: string,
      options: RequestInit = {},
    ): Promise<T> {
      const headers = new Headers(options.headers)
      headers.set('Authorization', `Bearer ${token}`)

      const response = await fetch(path, { ...options, headers })

      if (response.status === 401) {
        if (!options.signal?.aborted) onSessionExpired()
        throw new Error('sessionExpired')
      }

      if (!response.ok) {
        throw new Error(
          options.method === 'POST'
            ? 'notificationUpdateFailed'
            : 'notificationLoadFailed',
        )
      }

      if (response.status === 204) return undefined as T
      return await response.json() as T
    },
    [token, onSessionExpired],
  )

  // Kiểm tra chấm đỏ khi mở web, mỗi 15 giây và khi quay lại cửa sổ.
  useEffect(() => {
    const controller = new AbortController()
    let fetching = false

    async function checkUnread() {
      if (fetching || controller.signal.aborted) return
      fetching = true
      const revision = mutationRevision.current

      try {
        const data = await request<{ has_unread: boolean }>(
          '/api/notifications/unread',
          { signal: controller.signal },
        )

        if (
          controller.signal.aborted
          || revision !== mutationRevision.current
        ) return

        setHasUnread(data.has_unread)
        setNow(Date.now())
        setRefreshTick(value => value + 1)
      } catch {
        // Lần kiểm tra kế tiếp sẽ thử lại.
      } finally {
        fetching = false
      }
    }

    function refresh() {
      void checkUnread()
    }

    refresh()
    const timer = window.setInterval(refresh, 15_000)
    window.addEventListener('focus', refresh)

    return () => {
      controller.abort()
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
    }
  }, [request])

  // Tự cập nhật trang đầu khi bảng đang mở.
  // Khi đang xem các trang cũ hơn, giữ nguyên vị trí danh sách.
  const firstPageTick = cursor === null ? refreshTick : 0

  useEffect(() => {
    if (!open) return

    const controller = new AbortController()
    const revision = mutationRevision.current

    async function loadNotifications() {
      try {
        const params = new URLSearchParams()
        if (cursor !== null) params.set('before_id', String(cursor))

        const data = await request<NotificationPage>(
          `/api/notifications?${params}`,
          { signal: controller.signal },
        )

        if (
          controller.signal.aborted
          || revision !== mutationRevision.current
        ) return

        setItems(previous => (
          cursor === null
            ? data.items
            : [
                ...previous,
                ...data.items.filter(
                  item => !previous.some(existing => existing.id === item.id),
                ),
              ]
        ))
        setNextCursor(data.next_cursor)
        setHasUnread(data.has_unread)
        setError('')
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(
            err instanceof Error ? err.message : 'notificationLoadFailed',
          )
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    void loadNotifications()
    return () => controller.abort()
  }, [open, cursor, firstPageTick, request])

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (
        event.target instanceof Node
        && !wrapperRef.current?.contains(event.target)
      ) {
        setOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }

    if (!open) return

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  useEffect(() => {
    return () => readController.current?.abort()
  }, [])

  function toggleOpen() {
    if (!open) {
      setItems([])
      setCursor(null)
      setNextCursor(null)
      setError('')
      setLoading(true)
    }

    setOpen(current => !current)
  }

  async function markRead(notification?: Notification) {
    if (readController.current) return

    const controller = new AbortController()
    readController.current = controller
    setBusy(true)
    setError('')

    try {
      const path = notification
        ? `/api/notifications/${notification.id}/read`
        : '/api/notifications/read-all'

      await request<void>(path, {
        method: 'POST',
        signal: controller.signal,
      })

      if (controller.signal.aborted) return

      mutationRevision.current += 1

      setItems(previous => previous.map(item => (
        !notification || item.id === notification.id
          ? { ...item, is_read: true }
          : item
      )))

      if (notification) {
        const data = await request<{ has_unread: boolean }>(
          '/api/notifications/unread',
          { signal: controller.signal },
        )

        if (controller.signal.aborted) return
        setHasUnread(data.has_unread)
      } else {
        setHasUnread(false)
      }

      if (notification) {
        setOpen(false)

        if (notification.booking_request_id !== null) {
          const tab = notification.type === 'BOOKING_REQUESTED'
            ? 'received'
            : 'sent'

          window.location.hash =
            `#/bookings?tab=${tab}&focus=${notification.booking_request_id}`
        }
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(
          err instanceof Error ? err.message : 'notificationUpdateFailed',
        )
      }
    } finally {
      readController.current = null
      if (!controller.signal.aborted) setBusy(false)
    }
  }

  function notificationText(item: Notification) {
    const key = notificationKeys[item.type]

    if (!key) return t('notificationDefault')

    return t(key)
      .replace('{name}', () => item.actor_name ?? t('unknownUser'))
      .replace('{skill}', () => item.skill_name ?? t('unknownSkill'))
  }

  return (
    <div ref={wrapperRef} className="sj-notifications">
      <button
        ref={buttonRef}
        className="sj-notification-bell"
        type="button"
        aria-label={hasUnread
          ? `${t('notifications')}, ${t('notificationUnread')}`
          : t('notifications')}
        aria-expanded={open}
        aria-controls={open ? 'sj-notification-panel' : undefined}
        disabled={busy}
        onClick={toggleOpen}
      >
        <svg
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z"
            fill="#E9B949"
            stroke="#A77818"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path
            d="M10 20a2 2 0 0 0 4 0"
            stroke="#A77818"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>

        {hasUnread && <span className="sj-notification-dot" aria-hidden="true" />}
      </button>

      {open && (
        <section
          id="sj-notification-panel"
          className="sj-notification-panel"
          aria-label={t('notifications')}
        >
          <div className="sj-notification-heading">
            <h2>{t('notifications')}</h2>
            <button
              type="button"
              disabled={busy || !hasUnread}
              onClick={() => void markRead()}
            >
              {t('notificationMarkAll')}
            </button>
          </div>

          {error && (
            <div className="sj-notification-feedback">
              <p className="message error" role="alert">
                {translateMessage(error, language)}
              </p>
              <button
                className="button secondary"
                type="button"
                disabled={busy}
                onClick={() => {
                  setError('')
                  setLoading(true)
                  setRefreshTick(value => value + 1)
                  setCursor(null)
                }}
              >
                {t('retry')}
              </button>
            </div>
          )}

          <div className="sj-notification-list">
            {items.map(item => (
              <button
                key={item.id}
                className={`sj-notification-item ${item.is_read ? '' : 'is-unread'}`}
                type="button"
                disabled={busy}
                onClick={() => void markRead(item)}
              >
                <span className="sj-notification-item-dot" aria-hidden="true" />
                <span>
                  <span className="sj-notification-text">
                    {notificationText(item)}
                  </span>
                  <time dateTime={item.created_at}>
                    {formatTime(item.created_at, locale, now)}
                  </time>
                </span>
              </button>
            ))}
          </div>

          {loading && (
            <p className="sj-notification-feedback" role="status">
              {t('loading')}
            </p>
          )}

          {!loading && !error && items.length === 0 && (
            <p className="sj-notification-feedback muted">
              {t('notificationEmpty')}
            </p>
          )}

          {nextCursor !== null && !error && (
            <button
              className="sj-notification-more"
              type="button"
              disabled={loading || busy}
              onClick={() => {
                setLoading(true)
                setCursor(nextCursor)
              }}
            >
              {t('notificationLoadMore')}
            </button>
          )}
        </section>
      )}
    </div>
  )
}