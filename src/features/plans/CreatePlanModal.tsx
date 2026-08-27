import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../components/Button'
import { Modal } from '../../components/Modal'
import { useAppData } from '../../hooks/useAppData'
import { useAuth } from '../../hooks/useAuth'

function defaultTime(offsetDays: number, hour: number) {
  const date = new Date()
  date.setDate(date.getDate() + offsetDays)
  date.setHours(hour, 0, 0, 0)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

export function CreatePlanModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const { createPlan } = useAppData()
  const { user } = useAuth()
  const [title, setTitle] = useState('Next poker night')
  const [times, setTimes] = useState([defaultTime(2, 20), defaultTime(3, 19)])
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    setIsSaving(true)
    setError('')
    try {
      const plan = await createPlan({
        title,
        startsAt: times.filter(Boolean).map((value) => new Date(value).toISOString()),
        hostUserId: user?.id ?? null,
      })
      onClose()
      navigate(`/plans/${plan.id}`)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to start poll.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Modal title="Plan next game" onClose={onClose}>
      <form onSubmit={submit} className="space-y-5">
        <label className="block"><span className="label">Title</span><input className="input" required maxLength={80} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <fieldset>
          <legend className="label">Possible times</legend>
          <div className="space-y-2">
            {times.map((time, index) => (
              <div key={`${index}-${time}`} className="flex gap-2">
                <input className="input min-w-0" type="datetime-local" required value={time} onChange={(event) => setTimes((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} />
                {times.length > 1 ? <button type="button" aria-label="Remove time" className="min-h-12 rounded-xl px-3 text-ink-muted hover:bg-white/5 hover:text-danger" onClick={() => setTimes((current) => current.filter((_, itemIndex) => itemIndex !== index))}>×</button> : null}
              </div>
            ))}
          </div>
          <Button type="button" variant="ghost" className="mt-2" onClick={() => setTimes((current) => [...current, defaultTime(4 + current.length, 20)])}>+ Add time</Button>
        </fieldset>
        {error ? <p role="alert" className="text-sm text-red-300">{error}</p> : null}
        <Button type="submit" fullWidth disabled={isSaving}>{isSaving ? 'Starting…' : 'Start poll'}</Button>
      </form>
    </Modal>
  )
}
