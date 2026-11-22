import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { translateMessage, useLanguage } from './i18n'

type Props = {
  token: string
  bookingId: number
  skillName: string
  mentorName: string
  onClose: () => void
  onSaved: () => void
  onSessionExpired: () => void
}

export default function ReviewDialog({
  token,
  bookingId,
  skillName,
  mentorName,
  onClose,
  onSaved,
  onSessionExpired,
}: Props) {
  const { t, language } = useLanguage()
  const titleId = useId()
  const ratingName = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const requestRef = useRef<AbortController | null>(null)

  const [rating, setRating] = useState<number | null>(null)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()

    return () => requestRef.current?.abort()
  }, [])

  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (requestRef.current) return

    setError('')

    if (rating === null) {
      setError('reviewRatingRequired')
      return
    }

    const controller = new AbortController()
    requestRef.current = controller
    setBusy(true)

    try {
      const response = await fetch('/api/reviews', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          booking_id: bookingId,
          rating,
          comment: comment.trim() || null,
        }),
        signal: controller.signal,
      })

      if (controller.signal.aborted) return

      if (response.status === 401) {
        onSessionExpired()
        return
      }

      if (!response.ok) {
        const data = await response.json().catch(() => null)
        throw new Error(
          typeof data?.detail === 'string' ? data.detail : 'reviewFailed',
        )
      }

      onSaved()
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : 'reviewFailed')
      }
    } finally {
      requestRef.current = null
      if (!controller.signal.aborted) setBusy(false)
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="sj-booking-dialog"
      aria-labelledby={titleId}
      onCancel={event => {
        event.preventDefault()
        if (!busy) onClose()
      }}
    >
      <div className="sj-booking-dialog-content">
        <div className="sj-booking-dialog-heading">
          <h2 id={titleId}>{t('reviewDialogTitle')}</h2>
        <button
  className="sj-booking-close"
  type="button"
  aria-label={t('close')}
  disabled={busy}
  onClick={onClose}
>
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <path d="M6 6L18 18M18 6L6 18" />
  </svg>
</button>
        </div>

        <p><strong>{skillName}</strong></p>
        <p className="muted">{t('mentor')}: {mentorName}</p>

        {error && (
          <p className="message error" role="alert">
            {translateMessage(error, language)}
          </p>
        )}

        <form onSubmit={submitReview}>
          <fieldset className="sj-review-rating" disabled={busy}>
            <legend>{t('reviewExperience')}</legend>

            <div className="sj-review-stars">
              {[1, 2, 3, 4, 5].map(value => (
                <label key={value} className="sj-review-star-choice">
                  <input
                    type="radio"
                    name={ratingName}
                    value={value}
                    checked={rating === value}
                    aria-label={`${value} / 5`}
                    onChange={() => setRating(value)}
                  />
                  <span
                    className={value <= (rating ?? 0) ? 'is-filled' : ''}
                    aria-hidden="true"
                  >
                    ★
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <label>
            {t('reviewComment')}
            <textarea
              value={comment}
              onChange={event => setComment(event.target.value)}
              placeholder={t('reviewCommentHint')}
              maxLength={2000}
              rows={4}
              disabled={busy}
            />
          </label>

          <div className="sj-booking-actions">
            <button
              className="button secondary"
              type="button"
              disabled={busy}
              onClick={onClose}
            >
              {t('close')}
            </button>
            <button
              className="button primary"
              type="submit"
              disabled={busy}
            >
              {busy ? t('processing') : t('submitReview')}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  )
}