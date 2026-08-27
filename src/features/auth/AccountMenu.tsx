import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppData } from '../../hooks/useAppData'
import { useAuth } from '../../hooks/useAuth'
import { useWorkspaces } from '../../hooks/useWorkspaces'

interface AccountMenuProps {
  onOpenAccount: () => void
  placement?: 'down' | 'up'
}

export function AccountMenu({
  onOpenAccount,
  placement = 'down',
}: AccountMenuProps) {
  const navigate = useNavigate()
  const { user, isRegistered, mode, signOut } = useAuth()
  const { players, workspace } = useAppData()
  const { selectWorkspace } = useWorkspaces()
  const [isOpen, setIsOpen] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const linkedPlayer = players.find((player) => player.userId === user?.id)
  const metadataName = typeof user?.user_metadata.display_name === 'string'
    ? user.user_metadata.display_name.trim()
    : ''
  const emailName = user?.email?.split('@')[0] ?? ''
  const displayName = isRegistered
    ? metadataName || linkedPlayer?.nickname || emailName || 'SevenTwo member'
    : mode === 'local'
      ? `Local ${titleCase(workspace.role)}`
      : 'SevenTwo member'
  const initials = displayName
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  useEffect(() => {
    if (!isOpen) return
    function closeOnOutsideClick(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false)
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [isOpen])

  function runAndClose(action: () => void) {
    setIsOpen(false)
    action()
  }

  async function handleSignOut() {
    setIsSigningOut(true)
    setSignOutError('')
    try {
      await signOut()
      selectWorkspace(null)
      navigate('/')
      setIsOpen(false)
    } catch (caughtError) {
      setSignOutError(caughtError instanceof Error ? caughtError.message : 'Unable to sign out.')
    } finally {
      setIsSigningOut(false)
    }
  }

  return (
    <div ref={containerRef} className="relative min-w-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
        className="glass-interactive flex min-h-11 max-w-[9.5rem] items-center gap-2 rounded-xl px-2.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink md:max-w-none md:w-full md:px-3"
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.08] text-[10px] font-black text-ink" aria-hidden="true">
          {initials || '72'}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-bold leading-tight text-ink" title={displayName}>{displayName}</span>
          <span className="mt-0.5 block text-[9px] font-black tracking-[0.12em] text-ink-muted">{workspace.role}</span>
        </span>
        <span className="shrink-0 text-[10px] text-ink-muted" aria-hidden="true">⌄</span>
      </button>

      {isOpen ? (
        <div
          role="menu"
          className={`glass-raised absolute right-0 z-50 w-[min(19rem,calc(100vw-2rem))] rounded-2xl p-3 shadow-2xl md:left-0 md:right-auto ${placement === 'up' ? 'bottom-[calc(100%+0.5rem)]' : 'top-[calc(100%+0.5rem)]'}`}
        >
          <div className="px-2 pb-3 pt-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-ink" title={displayName}>{displayName}</p>
                <p className="mt-1 truncate text-xs text-ink-muted" title={user?.email ?? undefined}>
                  {isRegistered ? user?.email : 'Local demo identity'}
                </p>
              </div>
              <span className="shrink-0 rounded-md bg-white/[0.07] px-2 py-1 text-[9px] font-black tracking-[0.12em] text-ink-secondary">
                {workspace.role}
              </span>
            </div>
            <p className="mt-3 truncate border-t border-line pt-3 text-xs font-semibold text-ink-secondary" title={workspace.name}>
              {workspace.name}
            </p>
          </div>

          <div className="border-t border-line pt-2">
            <MenuButton onClick={() => runAndClose(() => navigate('/profile'))}>View profile</MenuButton>
            <MenuButton onClick={() => runAndClose(() => { selectWorkspace(null); navigate('/') })}>Switch workspace</MenuButton>
            <MenuButton onClick={() => runAndClose(onOpenAccount)}>Account settings</MenuButton>
            {mode === 'supabase' ? (
              <MenuButton disabled={isSigningOut} onClick={() => void handleSignOut()}>
                {isSigningOut ? 'Signing out…' : 'Sign out'}
              </MenuButton>
            ) : null}
            {signOutError ? <p role="alert" className="px-3 py-2 text-xs leading-5 text-red-300">{signOutError}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function MenuButton({ children, onClick, disabled = false }: { children: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className="min-h-11 w-full rounded-xl px-3 text-left text-sm font-semibold text-ink-secondary transition hover:bg-white/[0.055] hover:text-ink focus-visible:outline-2 focus-visible:outline-ink disabled:opacity-50"
    >
      {children}
    </button>
  )
}

function titleCase(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase()
}
