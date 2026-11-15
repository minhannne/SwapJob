import { useEffect, useState } from 'react'
import { translateMessage, useLanguage } from './i18n'
import type { TranslationKey } from './i18n'
import ReviewDialog from './ReviewDialog'
type Props = {
  token: string
  onSessionExpired: () => void
}

type Session = {
  booking_id: number
  session_id: number
  session_status: string
  review_id: number | null
  review_rating: number | null
  skill_name: string | null
  counterpart_name: string | null
  is_learner: boolean
  starts_at: string
  ends_at: string
}

type SessionTab = 'upcoming' | 'ongoing' | 'past'

const tabs: {
  id: SessionTab
  label: TranslationKey
  empty: TranslationKey
}[] = [
  {
    id: 'upcoming',
    label: 'upcoming',
    empty: 'noUpcomingSessions',
  },
  {
    id: 'ongoing',
    label: 'ongoing',
    empty: 'noOngoingSessions',
  },
  {
    id: 'past',
    label: 'past',
    empty: 'noPastSessions',
  },
]

function formatSessionTime(
  start: number,
  end: number,
  locale: string,
) {
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
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
    : `${startDate} · ${startTime} – ${endDate} · ${endTime}`
}

export default function SessionsPage({
  token,
  onSessionExpired,
}: Props) {
  const { t, locale, language } = useLanguage()

  const [tab, setTab] = useState<SessionTab>('upcoming')
  const [sessions, setSessions] = useState<Session[]>([])
  const [now, setNow] = useState(() => Date.now())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reloadCount, setReloadCount] = useState(0)
  const [reviewSession, setReviewSession] = useState<Session | null>(null)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    const controller = new AbortController()

    async function loadSessions() {
      try {
        const response = await fetch('/api/sessions/me', {
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
          throw new Error('sessionsLoadFailed')
        }

        const data: Session[] = await response.json()

        if (!Array.isArray(data)) {
          throw new Error('invalidSessions')
        }

        if (!controller.signal.aborted) {
          setSessions(data)
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(
            err instanceof Error ? err.message : 'sessionsLoadFailed',
          )
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    void loadSessions()

    return () => controller.abort()
  }, [token, onSessionExpired, reloadCount])

  useEffect(() => {
    function updateTime() {
      setNow(Date.now())
    }

    const timer = window.setInterval(updateTime, 15_000)
    window.addEventListener('focus', updateTime)

    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', updateTime)
    }
  }, [])

  const visibleSessions = sessions
    .map(session => ({
      session,
      start: Date.parse(session.starts_at),
      end: Date.parse(session.ends_at),
    }))
    .filter(({ start, end }) => {
      if (
        !Number.isFinite(start)
        || !Number.isFinite(end)
        || start >= end
      ) {
        return false
      }

      if (tab === 'upcoming') return now < start
      if (tab === 'past') return end <= now

      return start <= now && now < end
    })
    .sort((a, b) => (
      tab === 'past'
        ? b.end - a.end || b.session.booking_id - a.session.booking_id
        : a.start - b.start || a.session.booking_id - b.session.booking_id
    ))

  const emptyKey = tabs.find(item => item.id === tab)?.empty
    ?? 'noUpcomingSessions'

  return (
    <section
      className="sj-account-page"
      aria-labelledby="sessions-title"
    >
      <div className="sj-account-page-heading">
        <div>
          <h1 id="sessions-title">{t('mySessions')}</h1>
          <p className="muted">{t('sessionsDescription')}</p>
        </div>
      </div>

      <div className="sj-request-toolbar">
        <div
          className="sj-request-tabs sj-session-tabs"
          role="group"
          aria-label={t('sessionPeriod')}
        >
          {tabs.map(item => (
            <button
              key={item.id}
              className="sj-request-tab"
              type="button"
              aria-pressed={tab === item.id}
              onClick={() => setTab(item.id)}
            >
              {t(item.label)}
            </button>
          ))}
        </div>

        <p className="muted sj-request-timezone">
          {t('vietnamTimezone')}
        </p>
      </div>
      {notice && (
        <p className="message success" role="status">
          {translateMessage(notice, language)}
        </p>
      )}
      {loading && <p role="status">{t('loading')}</p>}

      {error && (
        <>
          <p className="message error" role="alert">
            {translateMessage(error, language)}
          </p>

          <button
            className="button secondary"
            type="button"
            onClick={() => {
              setError('')
              setLoading(true)
              setReloadCount(count => count + 1)
            }}
          >
            {t('retry')}
          </button>
        </>
      )}

      {!loading && !error && (
        visibleSessions.length === 0 ? (
          <p className="panel muted">{t(emptyKey)}</p>
        ) : (
          <div className="sj-request-list">
            {visibleSessions.map(({ session, start, end }) => (
              <article
                key={session.booking_id}
                className="panel sj-request-card"
              >
                <div className="sj-request-info">
                  <div className="sj-request-title">
                    <h2>
                      {session.skill_name ?? t('unknownSkill')}
                    </h2>
                  </div>

                  <p className="muted sj-request-time">
                    {t('withPerson')}{' '}
                    {session.counterpart_name ?? t('unknownUser')}
                    {' · '}
                    {session.is_learner ? t('mentor') : t('learner')}
                  </p>

                  <p className="muted sj-request-time">
                    {formatSessionTime(start, end, locale)}
                  </p>
                                    {tab === 'past' && session.is_learner && (
                    <div className="sj-session-review-action">
                      {session.review_id !== null ? (
                        <span className="sj-reviewed-label">
                          {t('reviewed')} · {session.review_rating} / 5
                        </span>
                      ) : session.session_status !== 'CANCELLED' ? (
                        <button
                          className="button secondary"
                          type="button"
                          onClick={() => {
                            setNotice('')
                            setReviewSession(session)
                          }}
                        >
                          {t('leaveReview')}
                        </button>
                      ) : null}
                    </div>
                  )}
                </div>

                <div className="sj-request-side">
                  <span
                    className={`sj-request-status ${
                      session.is_learner
                        ? 'sj-session-learner'
                        : 'sj-session-mentor'
                    }`}
                  >
                    {session.is_learner
                      ? t('youAreLearner')
                      : t('youAreMentor')}
                  </span>
                </div>
              </article>
            ))}
          </div>
        )
      )}
            {reviewSession && (
        <ReviewDialog
          token={token}
          bookingId={reviewSession.booking_id}
          skillName={reviewSession.skill_name ?? t('unknownSkill')}
          mentorName={reviewSession.counterpart_name ?? t('unknownUser')}
          onSessionExpired={onSessionExpired}
          onClose={() => {
            setReviewSession(null)
            setReloadCount(count => count + 1)
          }}
          onSaved={() => {
            setReviewSession(null)
            setNotice('reviewSent')
            setReloadCount(count => count + 1)
          }}
        />
      )}
    </section>
  )
}