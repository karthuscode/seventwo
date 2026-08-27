interface StatusBadgeProps {
  status: 'ACTIVE' | 'FINISHED' | 'RECEIVED' | 'PENDING'
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const styles =
    status === 'PENDING'
      ? 'border border-amber-300/15 bg-amber-400/8 text-warning'
      : status === 'ACTIVE'
        ? 'border border-white/10 bg-white/8 text-ink'
        : 'border border-white/[0.06] bg-white/[0.045] text-ink-secondary'

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${styles}`}
    >
      {status.replace('_', ' ')}
    </span>
  )
}
