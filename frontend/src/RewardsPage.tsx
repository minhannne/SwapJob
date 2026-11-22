import { useEffect, useRef, useState } from 'react'
import { useLanguage } from './i18n'
import type { TranslationKey } from './i18n'

type Reward = {
  id: string
  name: TranslationKey
  description: TranslationKey
  cost: number
  symbol: string
}

type DemoWallet = {
  balance: number
  redeemedIds: string[]
  lastRedeemedId: string | null
}

const rewards: Reward[] = [
  {
    id: 'react-practice',
    name: 'rewardReactExercises',
    description: 'rewardReactDescription',
    cost: 50,
    symbol: '01',
  },
  {
    id: 'sharing-frame',
    name: 'rewardSharingFrame',
    description: 'rewardFrameDescription',
    cost: 80,
    symbol: '02',
  },
  {
    id: 'curious-badge',
    name: 'rewardCuriousBadge',
    description: 'rewardBadgeDescription',
    cost: 100,
    symbol: '03',
  },
]

const missions: {
  id: string
  name: TranslationKey
  points: number
  completed: boolean
}[] = [
  {
    id: 'profile',
    name: 'rewardMissionProfile',
    points: 10,
    completed: true,
  },
  {
    id: 'learning',
    name: 'rewardMissionLearning',
    points: 20,
    completed: true,
  },
  {
    id: 'mentoring',
    name: 'rewardMissionMentoring',
    points: 20,
    completed: false,
  },
]

export default function RewardsPage() {
  const { t, locale } = useLanguage()

  const [wallet, setWallet] = useState<DemoWallet>({
    balance: 60,
    redeemedIds: [],
    lastRedeemedId: null,
  })

  const [selectedRewardId, setSelectedRewardId] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)

  const selectedReward = rewards.find(
    reward => reward.id === selectedRewardId,
  )

  const lastReward = rewards.find(
    reward => reward.id === wallet.lastRedeemedId,
  )

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (selectedReward && !dialog.open) {
      dialog.showModal()
    }

    if (!selectedReward && dialog.open) {
      dialog.close()
    }
  }, [selectedReward])

  function confirmRedemption() {
    if (!selectedReward) return

    const reward = selectedReward

    setWallet(previous => {
      if (
        previous.redeemedIds.includes(reward.id)
        || previous.balance < reward.cost
      ) {
        return previous
      }

      return {
        balance: previous.balance - reward.cost,
        redeemedIds: [...previous.redeemedIds, reward.id],
        lastRedeemedId: reward.id,
      }
    })

    setSelectedRewardId(null)
  }

  function resetDemo() {
    setSelectedRewardId(null)
    setWallet({
      balance: 60,
      redeemedIds: [],
      lastRedeemedId: null,
    })
  }

  return (
    <section className="sj-account-page sj-rewards-page">
      <div className="sj-account-page-heading">
        <div>
          <div className="sj-rewards-heading">
            <h1>{t('rewards')}</h1>
          </div>

          <p className="muted">{t('rewardsDescription')}</p>
        </div>

        <button
          className="button secondary"
          type="button"
          onClick={resetDemo}
        >
          {t('resetRewardsDemo')}
        </button>
      </div>

      <p className="muted sj-rewards-demo-description">
        {t('rewardsDemoDescription')}
      </p>

      <div className="panel sj-rewards-balance">
        <div>
          <p className="sj-rewards-balance-label">
            {t('rewardYourPoints')}
          </p>

          <p className="sj-rewards-balance-value" aria-live="polite">
            <strong>{wallet.balance.toLocaleString(locale)}</strong>
            <span>{t('rewardPointsUnit')}</span>
          </p>

          <p className="muted">{t('rewardBalanceHint')}</p>
        </div>
      </div>

      {lastReward && (
        <p className="message success" role="status">
          {t('rewardSuccess').replace(
            '{reward}',
            () => t(lastReward.name),
          )}
        </p>
      )}

      <h2 className="sj-rewards-section-title">
        {t('rewardMissions')}
      </h2>

      <ul className="panel sj-reward-missions">
        {missions.map(mission => (
          <li key={mission.id}>
            <strong>{t(mission.name)}</strong>

            <span className="sj-reward-mission-points">
              +{mission.points.toLocaleString(locale)}{' '}
              {t('rewardPointsUnit')}
            </span>

            <span
              className={`sj-reward-mission-status ${
                mission.completed ? 'is-complete' : ''
              }`}
            >
              {mission.completed
                ? t('rewardMissionDone')
                : t('rewardMissionIncomplete')}
            </span>
          </li>
        ))}
      </ul>

      <h2 className="sj-rewards-section-title">
        {t('rewardCatalog')}
      </h2>

      <div className="sj-reward-grid">
        {rewards.map(reward => {
          const redeemed = wallet.redeemedIds.includes(reward.id)
          const affordable = wallet.balance >= reward.cost

          return (
            <article key={reward.id} className="panel sj-reward-card">
              <span className="sj-reward-symbol" aria-hidden="true">
                {reward.symbol}
              </span>

              <h3>{t(reward.name)}</h3>
              <p className="muted">{t(reward.description)}</p>

              <div className="sj-reward-card-footer">
                <p className="sj-reward-price">
                  {reward.cost.toLocaleString(locale)}{' '}
                  {t('rewardPointsUnit')}
                </p>

                <button
                  className={`button ${affordable && !redeemed ? 'primary' : 'secondary'}`}
                  type="button"
                  disabled={redeemed || !affordable}
                  onClick={() => setSelectedRewardId(reward.id)}
                >
                  {redeemed
                    ? t('rewardRedeemed')
                    : affordable
                      ? t('rewardRedeem')
                      : t('rewardMissingPoints').replace(
                          '{points}',
                          (reward.cost - wallet.balance).toLocaleString(locale),
                        )}
                </button>
              </div>
            </article>
          )
        })}
      </div>

      <dialog
        ref={dialogRef}
        className="sj-booking-dialog sj-rewards-dialog"
        aria-labelledby="reward-confirm-title"
        onCancel={event => {
          event.preventDefault()
          setSelectedRewardId(null)
        }}
        onClose={() => setSelectedRewardId(null)}
      >
        {selectedReward && (
          <div className="sj-booking-dialog-content">
            <div className="sj-booking-dialog-heading">
              <h2 id="reward-confirm-title">
                {t('rewardConfirmTitle')}
              </h2>

              <button
  className="sj-booking-close"
  type="button"
  aria-label={t('close')}
  onClick={() => setSelectedRewardId(null)}
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

            <div className="sj-booking-time">
              <strong>{t(selectedReward.name)}</strong>

              <p>
                {t('rewardConfirmDescription').replace(
                  '{points}',
                  selectedReward.cost.toLocaleString(locale),
                )}
              </p>

              <p>
                {t('rewardBalanceAfter').replace(
                  '{points}',
                  (wallet.balance - selectedReward.cost).toLocaleString(locale),
                )}
              </p>
            </div>

            <div className="sj-booking-actions">
              <button
                className="button secondary"
                type="button"
                onClick={() => setSelectedRewardId(null)}
              >
                {t('close')}
              </button>

              <button
                className="button primary"
                type="button"
                disabled={
                  wallet.balance < selectedReward.cost
                  || wallet.redeemedIds.includes(selectedReward.id)
                }
                onClick={confirmRedemption}
              >
                {t('rewardConfirm')}
              </button>
            </div>
          </div>
        )}
      </dialog>
    </section>
  )
}