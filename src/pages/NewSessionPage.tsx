import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '../components/Button'
import { PageHeader } from '../components/PageHeader'
import { AddPlayerModal } from '../features/players/AddPlayerModal'
import { useAppData } from '../hooks/useAppData'
import type { PaymentMethod, PaymentStatus } from '../types/domain'
import { todayAsInputValue } from '../utils/format'
import { STANDARD_PAYMENT_METHODS } from '../utils/paymentMethods'

export function NewSessionPage() {
  const navigate = useNavigate()
  const { players, createSession } = useAppData()
  const activePlayers = players.filter((player) => !player.archivedAt)
  const [name, setName] = useState('Friday Night Poker')
  const [date, setDate] = useState(todayAsInputValue())
  const [buyInAmount, setBuyInAmount] = useState(30)
  const [chipsPerBuyIn, setChipsPerBuyIn] = useState(100)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH')
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('PENDING')
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([])
  const [showAddPlayer, setShowAddPlayer] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  function togglePlayer(playerId: string) {
    setSelectedPlayerIds((current) =>
      current.includes(playerId)
        ? current.filter((id) => id !== playerId)
        : [...current, playerId],
    )
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setIsSaving(true)
    setError('')
    try {
      const session = await createSession({
        name,
        date,
        buyInAmount,
        chipsPerBuyIn,
        playerIds: selectedPlayerIds,
        paymentMethod,
        paymentStatus,
      })
      navigate(`/sessions/${session.id}/active`)
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Unable to create session.',
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-7">
      <Link to="/" className="text-sm font-bold text-slate-400 hover:text-white">
        ← Dashboard
      </Link>
      <PageHeader
        eyebrow="Set the table"
        title="New session"
        description="Configure the chip conversion and choose who's playing tonight."
      />

      <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[1fr_1.15fr]">
        <section className="space-y-5 rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6">
          <h2 className="font-bold text-white">Session details</h2>
          <label className="block">
            <span className="label">Session name</span>
            <input
              required
              className="input"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="block">
            <span className="label">Date</span>
            <input
              required
              type="date"
              className="input"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className="label">Buy-in (RON)</span>
              <input
                required
                type="number"
                min="0.01"
                step="0.01"
                className="input"
                value={buyInAmount}
                onChange={(event) => setBuyInAmount(event.target.valueAsNumber)}
              />
            </label>
            <label>
              <span className="label">Chips per buy-in</span>
              <input
                required
                type="number"
                min="1"
                step="1"
                className="input"
                value={chipsPerBuyIn}
                onChange={(event) => setChipsPerBuyIn(event.target.valueAsNumber)}
              />
            </label>
          </div>
          <div className="rounded-xl bg-slate-950/70 p-4 text-center">
            <p className="text-xs uppercase tracking-wider text-slate-500">Conversion</p>
            <p className="mt-1 text-lg font-bold text-white">
              {buyInAmount || 0} RON = {chipsPerBuyIn || 0} chips
            </p>
          </div>
          <fieldset>
            <legend className="label">Initial buy-in method</legend>
            <div className="segmented-grid grid-cols-2">
              {STANDARD_PAYMENT_METHODS.map((method) => (
                <label key={method} className="segmented-option">
                  <input
                    type="radio"
                    className="sr-only"
                    checked={paymentMethod === method}
                    onChange={() => setPaymentMethod(method)}
                  />
                  <span>{method[0] + method.slice(1).toLowerCase()}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="label">Initial payment status</legend>
            <div className="segmented-grid grid-cols-2">
              {(['PENDING', 'RECEIVED'] as PaymentStatus[]).map((status) => (
                <label key={status} className="segmented-option">
                  <input
                    type="radio"
                    className="sr-only"
                    checked={paymentStatus === status}
                    onChange={() => setPaymentStatus(status)}
                  />
                  <span>{status[0] + status.slice(1).toLowerCase()}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-bold text-white">Players</h2>
              <p className="mt-1 text-xs text-slate-500">
                {selectedPlayerIds.length} selected
              </p>
            </div>
            <Button type="button" variant="secondary" onClick={() => setShowAddPlayer(true)}>
              + Add new
            </Button>
          </div>

          <div className="mt-5 space-y-2">
            {activePlayers.length ? (
              [...activePlayers]
                .sort((a, b) => a.nickname.localeCompare(b.nickname))
                .map((player) => (
                  <label
                    key={player.id}
                    className={`flex min-h-14 cursor-pointer items-center justify-between rounded-xl border px-4 transition ${
                      selectedPlayerIds.includes(player.id)
                        ? 'border-emerald-400/40 bg-emerald-400/10'
                        : 'border-slate-800 bg-slate-950/40 hover:border-slate-700'
                    }`}
                  >
                    <span className="font-semibold text-white">{player.nickname}</span>
                    <input
                      type="checkbox"
                      className="size-5 accent-emerald-400"
                      checked={selectedPlayerIds.includes(player.id)}
                      onChange={() => togglePlayer(player.id)}
                    />
                  </label>
                ))
            ) : (
              <button
                type="button"
                onClick={() => setShowAddPlayer(true)}
                className="w-full rounded-xl border border-dashed border-slate-700 px-4 py-8 text-sm text-slate-400 hover:border-emerald-400/40 hover:text-emerald-300"
              >
                Add your first player
              </button>
            )}
          </div>

          <p className="mt-5 text-xs leading-5 text-slate-500">
            Each selected player starts with one {paymentMethod.toLowerCase()} buy-in marked {paymentStatus.toLowerCase()}. You can correct it from the active session.
          </p>
          {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
          <Button
            type="submit"
            fullWidth
            className="mt-5"
            disabled={!name.trim() || selectedPlayerIds.length === 0 || isSaving}
          >
            {isSaving ? 'Creating…' : 'Create & start session'}
          </Button>
        </section>
      </form>

      {showAddPlayer ? (
        <AddPlayerModal
          onClose={() => setShowAddPlayer(false)}
          onAdded={(player) =>
            setSelectedPlayerIds((current) => [...current, player.id])
          }
        />
      ) : null}
    </div>
  )
}
