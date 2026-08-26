import type { ReactNode } from 'react'

interface EmptyStateProps {
  title: string
  description: string
  action?: ReactNode
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/50 px-5 py-10 text-center">
      <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full border border-emerald-400/20 bg-emerald-400/10 text-xl text-emerald-300">
        72
      </div>
      <h2 className="font-bold text-white">{title}</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-400">
        {description}
      </p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )
}
