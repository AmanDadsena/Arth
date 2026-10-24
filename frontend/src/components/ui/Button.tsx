import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dark'

const VARIANT: Record<Variant, string> = {
  primary: 'bg-grow text-white active:brightness-90',
  secondary: 'bg-card text-ink active:bg-chip',
  ghost: 'bg-transparent text-grow active:bg-grow-l',
  danger: 'bg-danger text-white active:brightness-90',
  dark: 'bg-ink text-white active:brightness-125',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: 'lg' | 'md'
  icon?: IconName
  loading?: boolean
  full?: boolean
  children: ReactNode
}

/** Rutu's pill button: 62 px tall by default, 48 px for "md". */
export function Button({ variant = 'primary', size = 'lg', icon, loading, full = true, disabled, className = '', children, ...rest }: ButtonProps) {
  const off = disabled || loading
  return (
    <button
      type="button"
      disabled={off}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center gap-2.5 font-semibold transition ${
        size === 'lg' ? 'h-[62px] rounded-[34px] px-6 text-[19px]' : 'h-12 rounded-3xl px-5 text-[16px]'
      } ${full ? 'w-full' : ''} ${off ? 'bg-track text-faint' : VARIANT[variant]} ${className}`}
      {...rest}
    >
      {loading ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : icon ? <Icon name={icon} /> : null}
      {children}
    </button>
  )
}

export function IconButton({ icon, label, onClick, className = '' }: { icon: IconName; label: string; onClick?: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`flex h-12 w-12 flex-none items-center justify-center rounded-3xl bg-card text-ink active:brightness-95 ${className}`}
    >
      <Icon name={icon} />
    </button>
  )
}
