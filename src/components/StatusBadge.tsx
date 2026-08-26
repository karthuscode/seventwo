interface StatusBadgeProps {
  status: 'ACTIVE' | 'FINISHED' | 'RECEIVED' | 'PENDING'
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const styles =
    status === 'ACTIVE' || status === 'RECEIVED'
      ? 'bg-emerald-400/10 text-emerald-300 ring-emerald-400/20'
      : status === 'PENDING'
        ? 'bg-amber-400/10 text-amber-300 ring-amber-400/20'
        : 'bg-slate-700/60 text-slate-300 ring-slate-600'

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ring-1 ${styles}`}
    >
      {status.replace('_', ' ')}
    </span>
  )
}
