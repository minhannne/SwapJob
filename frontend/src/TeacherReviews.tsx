import { useEffect, useState } from 'react'
import { translateMessage, useLanguage } from './i18n'

type Props = {
  teacherId: number
  token: string
  onSessionExpired: () => void
}

type Review = {
  id: number
  learner_name: string
  skill_name: string
  rating: number
  comment: string | null
  created_at: string
}

type ReviewPage = {
  average_rating: number | null
  total_reviews: number
  items: Review[]
  next_cursor: number | null
}

export default function TeacherReviews({
  teacherId,
  token,
  onSessionExpired,
}: Props) {
  const { t, locale, language } = useLanguage()
  const [reviews, setReviews] = useState<Review[]>([])
  const [average, setAverage] = useState<number | null>(null)
  const [total, setTotal] = useState(0)
  const [cursor, setCursor] = useState<number | null>(null)
  const [nextCursor, setNextCursor] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    async function loadReviews() {
      try {
        const params = new URLSearchParams()
        if (cursor !== null) params.set('before_id', String(cursor))

        const response = await fetch(
          `/api/reviews/teachers/${teacherId}?${params}`,
          {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
          },
        )

        if (controller.signal.aborted) return

        if (response.status === 401) {
          onSessionExpired()
          return
        }

        if (!response.ok) throw new Error('reviewLoadFailed')

        const data: ReviewPage = await response.json()
        if (!Array.isArray(data?.items)) throw new Error('invalidResponse')
        if (controller.signal.aborted) return

        setReviews(previous =>
          cursor === null ? data.items : [...previous, ...data.items],
        )
        setAverage(data.average_rating)
        setTotal(data.total_reviews)
        setNextCursor(data.next_cursor)
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : 'reviewLoadFailed')
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    void loadReviews()
    return () => controller.abort()
  }, [teacherId, token, cursor, retry, onSessionExpired])

  const dateFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeZone: 'Asia/Ho_Chi_Minh',
  })

  return (
    <section className="panel sj-teacher-review-panel">
      <h2>{t('reviewsHeading')}</h2>

      {total > 0 && (
        <div className="sj-review-summary">
          <strong>
            {average?.toLocaleString(locale, {
              maximumFractionDigits: 1,
            })} / 5
          </strong>

          <span className="muted">
            {t('reviewsCount').replace(
              '{count}',
              total.toLocaleString(locale),
            )}
          </span>
        </div>
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
              setRetry(value => value + 1)
            }}
          >
            {t('retry')}
          </button>
        </>
      )}

      {!loading && !error && total === 0 && (
        <p className="muted">{t('reviewNoRatings')}</p>
      )}

      <div className="sj-teacher-review-list">
        {reviews.map(review => (
          <article key={review.id} className="sj-teacher-review">
            <div className="sj-review-heading">
              <strong>{review.learner_name}</strong>
              <span className="sj-review-display-stars">
                <span aria-hidden="true">
                  {'★'.repeat(review.rating)}
                  {'☆'.repeat(5 - review.rating)}
                </span>
                <span className="sj-review-score">
                  {review.rating} / 5
                </span>
              </span>
            </div>

            <p className="muted sj-review-date">
              {review.skill_name} ·{' '}
              {dateFormatter.format(new Date(review.created_at))}
            </p>

            {review.comment && (
              <p className="sj-review-comment">{review.comment}</p>
            )}
          </article>
        ))}
      </div>

      {nextCursor !== null && !error && (
        <button
          className="button secondary"
          type="button"
          disabled={loading}
          onClick={() => {
            setLoading(true)
            setCursor(nextCursor)
          }}
        >
          {loading ? t('loading') : t('reviewLoadMore')}
        </button>
      )}
    </section>
  )
}