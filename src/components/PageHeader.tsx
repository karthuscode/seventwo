import type { ReactNode } from 'react'

interface PageHeaderProps {
  eyebrow?: string
  title: string
  description?: string
  action?: ReactNode
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 flex-1">
        {eyebrow ? (
          <p className="section-label mb-2">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="max-w-3xl text-[clamp(1.75rem,5vw,2.5rem)] font-black leading-[1.06] tracking-[-0.035em] text-ink [overflow-wrap:anywhere]">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-secondary">
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </header>
  )
}
