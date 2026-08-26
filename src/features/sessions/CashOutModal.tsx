import { useMemo, useState, type FormEvent } from 'react'
import { Button } from '../../components/Button'
import { Modal } from '../../components/Modal'
import { useAppData } from '../../hooks/useAppData'
import type {
  PaymentMethod,
  PaymentOffset,
  Player,
  PayoutAllocation,
  Session,
  SessionPlayer,
  Transaction,
} from '../../types/domain'
import {
  buildPaymentOffsetDraft,
  calculateBankSummary,
  calculateGrossCashOut,
  calculatePayoutRemaining,
  roundMoney,
  sumMoney,
  toMinorUnits,
} from '../../utils/calculations'
import { formatMoney } from '../../utils/format'
import { STANDARD_PAYMENT_METHODS } from '../../utils/paymentMethods'

interface CashOutModalProps {
  player: Player
  session: Session
  sessionPlayer: SessionPlayer
  transactions: Transaction[]
  payoutAllocations: PayoutAllocation[]
  paymentOffsets: PaymentOffset[]
  maximumCashOutChips: number
  onClose: () => void
}

export function CashOutModal({
  player,
  session,
  sessionPlayer,
  transactions,
  payoutAllocations,
  paymentOffsets,
  maximumCashOutChips,
  onClose,
}: CashOutModalProps) {
  const { saveCashOut } = useAppData()
  const isCorrection = sessionPlayer.status === 'CASHED_OUT'
  const playerIssuedChips = transactions.reduce(
    (total, transaction) => total + transaction.chips,
    0,
  )
  const suggestedChips = Math.min(playerIssuedChips, maximumCashOutChips)
  const [finalChips, setFinalChips] = useState(
    sessionPlayer.cashOutChips ?? suggestedChips,
  )
  const initialGross = calculateGrossCashOut(
    sessionPlayer.cashOutChips ?? suggestedChips,
    session.buyInAmount,
    session.chipsPerBuyIn,
  )
  const initialOffset = sumMoney(
    buildPaymentOffsetDraft(initialGross, transactions, paymentOffsets).map(
      (item) => item.amount,
    ),
  )
  const initialNet = roundMoney(initialGross - initialOffset)
  const [payoutAmounts, setPayoutAmounts] = useState<
    Record<PaymentMethod, number>
  >(() =>
    isCorrection
      ? {
          CASH: allocationAmount(payoutAllocations, 'CASH'),
          CARD: allocationAmount(payoutAllocations, 'CARD'),
          OTHER: allocationAmount(payoutAllocations, 'OTHER'),
        }
      : { CASH: initialNet, CARD: 0, OTHER: 0 },
  )
  const [isSaving, setIsSaving] = useState(false)
  const [confirmingCorrection, setConfirmingCorrection] = useState(false)
  const [error, setError] = useState('')

  const preview = useMemo(() => {
    const grossCashOut = calculateGrossCashOut(
      finalChips,
      session.buyInAmount,
      session.chipsPerBuyIn,
    )
    const offsetDraft = buildPaymentOffsetDraft(
      grossCashOut,
      transactions,
      paymentOffsets,
    )
    const previewOffsets: PaymentOffset[] = offsetDraft.map((item, index) => ({
      id: `preview-${index}`,
      workspaceId: session.workspaceId,
      sessionId: session.id,
      sessionPlayerId: sessionPlayer.id,
      transactionId: item.transactionId,
      amount: item.amount,
      createdAt: '',
      updatedAt: '',
    }))
    const bank = calculateBankSummary(transactions, [], previewOffsets)
    return {
      grossCashOut,
      pokerResult: roundMoney(grossCashOut - bank.committed),
      pendingOffset: bank.pendingOffset,
      netPayout: roundMoney(grossCashOut - bank.pendingOffset),
      remainingOutstanding: bank.pending,
      pendingBeforeOffsets: bank.pendingBeforeOffsets,
    }
  }, [finalChips, paymentOffsets, session, sessionPlayer.id, transactions])

  const remaining = calculatePayoutRemaining(preview.netPayout, payoutAmounts)
  const chipError =
    finalChips > maximumCashOutChips
      ? `Only ${maximumCashOutChips} chips remain in circulation.`
      : !Number.isInteger(finalChips) || finalChips < 0
        ? 'Final chips must be a whole number of zero or more.'
        : ''
  const hasLegacyOtherPayout = toMinorUnits(payoutAmounts.OTHER) !== 0

  function setChips(nextChips: number) {
    const safeChips = Number.isFinite(nextChips) ? Math.max(0, nextChips) : 0
    const gross = calculateGrossCashOut(
      safeChips,
      session.buyInAmount,
      session.chipsPerBuyIn,
    )
    const offset = sumMoney(
      buildPaymentOffsetDraft(gross, transactions, paymentOffsets).map(
        (item) => item.amount,
      ),
    )
    setFinalChips(safeChips)
    setPayoutAmounts({ CASH: roundMoney(gross - offset), CARD: 0, OTHER: 0 })
    setConfirmingCorrection(false)
    setError('')
  }

  function updatePayout(
    method: (typeof STANDARD_PAYMENT_METHODS)[number],
    amount: number,
  ) {
    setPayoutAmounts((current) => ({
      ...current,
      [method]: Number.isFinite(amount) ? Math.max(0, amount) : 0,
    }))
    setConfirmingCorrection(false)
    setError('')
  }

  async function submitCashOut() {
    if (chipError) {
      setError(chipError)
      return
    }
    if (toMinorUnits(remaining) !== 0) {
      setError('Cash and Card payouts must leave 0 RON remaining.')
      return
    }
    setIsSaving(true)
    setError('')
    try {
      await saveCashOut({
        sessionPlayerId: sessionPlayer.id,
        finalChips,
        payoutAmounts,
      })
      onClose()
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : 'Cash-out failed.',
      )
      setConfirmingCorrection(false)
    } finally {
      setIsSaving(false)
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (chipError) {
      setError(chipError)
      return
    }
    if (toMinorUnits(remaining) !== 0) {
      setError('Cash and Card payouts must leave 0 RON remaining.')
      return
    }
    if (isCorrection && !confirmingCorrection) {
      setConfirmingCorrection(true)
      return
    }
    void submitCashOut()
  }

  return (
    <Modal
      title={`${isCorrection ? 'Correct cash-out' : 'Cash out'} — ${player.nickname}`}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {confirmingCorrection ? (
          <div className="rounded-xl bg-amber-400/8 px-4 py-3">
            <p className="font-bold text-amber-200">Confirm settlement correction</p>
            <p className="mt-1 text-sm leading-6 text-slate-300">
              This replaces the saved chips, pending offsets, and payout split.
            </p>
          </div>
        ) : null}

        <div>
          <label className="block">
            <span className="label">Final chips</span>
            <input
              required
              min="0"
              max={maximumCashOutChips}
              step="1"
              type="number"
              inputMode="numeric"
              className={`input text-xl font-black tabular-nums ${chipError ? 'border-red-400/60' : ''}`}
              value={finalChips}
              aria-describedby="cash-out-chip-help cash-out-chip-error"
              aria-invalid={Boolean(chipError)}
              onChange={(event) => setChips(event.target.valueAsNumber)}
            />
          </label>
          <div id="cash-out-chip-help" className="mt-2 flex flex-wrap justify-between gap-2 text-xs">
            <span className="font-semibold text-slate-300">
              {maximumCashOutChips} chips available
            </span>
            <span className="text-slate-500">
              {session.chipsPerBuyIn} chips = {formatMoney(session.buyInAmount)}
            </span>
          </div>
          {chipError ? (
            <p id="cash-out-chip-error" role="alert" className="mt-2 text-sm text-red-300">
              {chipError}
            </p>
          ) : null}
        </div>

        <Button type="button" variant="secondary" fullWidth onClick={() => setChips(0)}>
          Bust out — 0 chips
        </Button>

        <dl className="space-y-3 border-y border-slate-800/80 py-5">
          <MoneyRow label="Gross cash-out" value={preview.grossCashOut} />
          <MoneyRow label="Poker result" value={preview.pokerResult} signed prominent />
          {preview.pendingBeforeOffsets ? (
            <MoneyRow label="Pending buy-ins" value={preview.pendingBeforeOffsets} />
          ) : null}
          {preview.pendingOffset ? (
            <MoneyRow label="Offset" value={-preview.pendingOffset} />
          ) : null}
          <MoneyRow label="Net payout" value={preview.netPayout} prominent />
          {preview.remainingOutstanding ? (
            <MoneyRow
              label="Still owed by player"
              value={preview.remainingOutstanding}
              warning
            />
          ) : null}
        </dl>

        {preview.netPayout > 0 ? (
          <fieldset>
            <legend className="label">Payout</legend>
            <div className="space-y-3">
              {STANDARD_PAYMENT_METHODS.map((method) => (
                <label key={method} className="grid grid-cols-[1fr_8rem] items-center gap-3">
                  <span className="text-sm font-bold text-slate-300">
                    {method === 'CASH' ? 'Cash' : 'Card'}
                  </span>
                  <input
                    min="0"
                    step="0.01"
                    type="number"
                    inputMode="decimal"
                    className="input text-right font-bold tabular-nums"
                    value={payoutAmounts[method]}
                    onChange={(event) => updatePayout(method, event.target.valueAsNumber)}
                  />
                </label>
              ))}
              {hasLegacyOtherPayout ? (
                <div className="grid grid-cols-[1fr_8rem] items-center gap-3 text-sm">
                  <span className="text-slate-500">Other (legacy)</span>
                  <span className="text-right font-bold tabular-nums text-slate-400">
                    {formatMoney(payoutAmounts.OTHER)}
                  </span>
                </div>
              ) : null}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setPayoutAmounts({ CASH: preview.netPayout, CARD: 0, OTHER: 0 })}
              >
                All Cash
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setPayoutAmounts({ CASH: 0, CARD: preview.netPayout, OTHER: 0 })}
              >
                All Card
              </Button>
            </div>
            <div className="mt-4 flex justify-between text-sm font-bold">
              <span className="text-slate-400">Remaining</span>
              <span className={toMinorUnits(remaining) === 0 ? 'text-emerald-300' : 'text-red-300'}>
                {formatMoney(remaining)}
              </span>
            </div>
          </fieldset>
        ) : (
          <p className="rounded-xl bg-slate-950/60 px-4 py-3 text-sm text-slate-400">
            No payout is required. The cash-out is fully offset or has zero value.
          </p>
        )}

        {error && error !== chipError ? (
          <p role="alert" className="text-sm text-red-300">{error}</p>
        ) : null}
        <Button
          type="submit"
          fullWidth
          disabled={isSaving || Boolean(chipError) || toMinorUnits(remaining) !== 0}
        >
          {isSaving
            ? 'Saving…'
            : confirmingCorrection
              ? 'Confirm correction'
              : isCorrection
                ? 'Review correction'
                : 'Confirm cash-out'}
        </Button>
      </form>
    </Modal>
  )
}

function allocationAmount(
  allocations: PayoutAllocation[],
  method: PaymentMethod,
): number {
  return allocations.find((allocation) => allocation.paymentMethod === method)
    ?.amount ?? 0
}

function MoneyRow({
  label,
  value,
  signed = false,
  warning = false,
  prominent = false,
}: {
  label: string
  value: number
  signed?: boolean
  warning?: boolean
  prominent?: boolean
}) {
  const display = signed && value > 0 ? `+${formatMoney(value)}` : formatMoney(value)
  const valueColor = warning
    ? 'text-amber-300'
    : signed && value < 0
      ? 'text-red-300'
      : signed && value > 0
        ? 'text-emerald-300'
        : prominent
          ? 'text-emerald-300'
          : 'text-white'

  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={prominent ? 'font-bold text-white' : 'text-sm text-slate-400'}>
        {label}
      </dt>
      <dd className={`${prominent ? 'text-xl font-black' : 'font-bold'} tabular-nums ${valueColor}`}>
        {display}
      </dd>
    </div>
  )
}
