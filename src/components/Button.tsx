import type { ButtonHTMLAttributes, PropsWithChildren } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'success' | 'ghost' | 'danger'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  fullWidth?: boolean
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'border border-white/70 bg-ink text-app-bg shadow-[0_12px_30px_rgba(0,0,0,0.24),inset_0_1px_0_white] hover:bg-white',
  secondary:
    'glass-interactive text-ink',
  success: 'glass-success text-ink',
  ghost: 'text-ink-secondary hover:bg-white/[0.055] hover:text-ink',
  danger: 'glass-danger text-red-200 hover:bg-red-950/70',
}

export function Button({
  children,
  className = '',
  variant = 'primary',
  fullWidth = false,
  ...props
}: PropsWithChildren<ButtonProps>) {
  return (
    <button
      className={`min-h-12 rounded-xl px-4 py-2.5 text-sm font-bold transition duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 ${variantClasses[variant]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
