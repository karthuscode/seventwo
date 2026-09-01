import { useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import {
  currentInstallPlatform,
  markOnboardingComplete,
  onboardingIsComplete,
  type InstallPlatform,
} from '../../utils/onboarding'
import { OnboardingContext } from './OnboardingContext'

export function OnboardingProvider({ children }: PropsWithChildren) {
  const { isRegistered } = useAuth()
  const navigate = useNavigate()
  const [isOpen, setIsOpen] = useState(
    () => isRegistered && !onboardingIsComplete(window.localStorage),
  )
  const [isReplay, setIsReplay] = useState(false)
  const value = useMemo(() => ({
    openOnboarding: () => {
      setIsReplay(true)
      setIsOpen(true)
    },
  }), [])

  function finish() {
    if (!isReplay) markOnboardingComplete(window.localStorage)
    setIsOpen(false)
  }

  function openNotificationSettings() {
    finish()
    navigate('/profile#notifications')
  }

  return (
    <OnboardingContext.Provider value={value}>
      {children}
      {isOpen ? (
        <OnboardingDialog
          onDismiss={finish}
          onOpenNotificationSettings={openNotificationSettings}
        />
      ) : null}
    </OnboardingContext.Provider>
  )
}

function OnboardingDialog({
  onDismiss,
  onOpenNotificationSettings,
}: {
  onDismiss: () => void
  onOpenNotificationSettings: () => void
}) {
  const [slide, setSlide] = useState(0)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const platform = useMemo(() => currentInstallPlatform(), [])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    const previousFocus = document.activeElement as HTMLElement | null
    document.body.style.overflow = 'hidden'
    headingRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss()
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href]',
      ))
      const first = focusable[0]
      const last = focusable.at(-1)
      if (!first || !last) return
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
      previousFocus?.focus()
    }
  }, [onDismiss])

  useEffect(() => {
    headingRef.current?.focus()
  }, [slide])

  const content = slideContent(slide, platform)
  return createPortal(
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-app-bg/95 text-ink backdrop-blur-xl">
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        className="mx-auto flex min-h-svh w-full max-w-2xl flex-col px-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] pt-[max(1rem,env(safe-area-inset-top,0px))] sm:px-8"
      >
        <div className="flex min-h-12 items-center justify-between">
          <span className="text-sm font-black tracking-tight">SevenTwo</span>
          <button type="button" onClick={onDismiss} className="min-h-11 rounded-xl px-3 text-sm font-bold text-ink-muted transition hover:bg-white/[0.06] hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
            Skip
          </button>
        </div>

        <div className="flex flex-1 flex-col justify-center py-5 sm:py-8">
          <div key={slide} className="section-enter">
            <p className="section-label">How it works</p>
            <h1 id="onboarding-title" ref={headingRef} tabIndex={-1} className="mt-3 max-w-[16ch] text-[clamp(2rem,9vw,3.75rem)] font-black leading-[0.98] tracking-[-0.045em] outline-none">
              {content.title}
            </h1>
            <p className="mt-4 max-w-md text-base leading-7 text-ink-secondary">{content.text}</p>
            <div className="mt-7 sm:mt-9">{content.visual}</div>
          </div>
        </div>

        <div className="shrink-0 border-t border-line/70 pt-4">
          <div className="mb-4 flex items-center justify-center gap-2" aria-label={`Step ${slide + 1} of 3`}>
            {[0, 1, 2].map((step) => <span key={step} className={`size-1.5 rounded-full ${step === slide ? 'bg-ink' : 'bg-white/15'}`} />)}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-between">
            {slide > 0 ? (
              <button type="button" onClick={() => setSlide((current) => current - 1)} className="min-h-12 rounded-xl px-4 text-sm font-bold text-ink-secondary transition hover:bg-white/[0.06] hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
                Back
              </button>
            ) : <span />}
            {slide < 2 ? (
              <button type="button" onClick={() => setSlide((current) => current + 1)} className="min-h-12 rounded-xl bg-ink px-5 text-sm font-black text-app-bg transition active:scale-[0.985] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
                Next
              </button>
            ) : (
              <div className="col-span-2 grid grid-cols-[auto_minmax(0,1fr)] gap-2">
                <button type="button" onClick={onDismiss} className="min-h-12 rounded-xl px-4 text-sm font-bold text-ink-secondary transition hover:bg-white/[0.06] hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
                  Done
                </button>
                <button type="button" onClick={onOpenNotificationSettings} className="min-h-12 rounded-xl bg-ink px-5 text-sm font-black text-app-bg transition active:scale-[0.985] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
                  Open Notification Settings
                </button>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>,
    document.body,
  )
}

function slideContent(slide: number, platform: InstallPlatform) {
  if (slide === 0) return {
    title: 'Plan the night',
    text: "Create a poll, see who's available, then confirm the best time.",
    visual: <PollPreview />,
  }
  if (slide === 1) return installSlide(platform)
  return {
    title: 'Stay updated',
    text: 'Get notified about new polls, reminders and confirmed poker nights.',
    visual: <NotificationPreview />,
  }
}

function installSlide(platform: InstallPlatform) {
  if (platform === 'IOS_BROWSER') return {
    title: 'Add SevenTwo to your Home Screen',
    text: 'Install SevenTwo for the full app experience and notifications.',
    visual: <IOSInstallPreview />,
  }
  if (platform === 'IOS_STANDALONE' || platform === 'INSTALLED') return {
    title: 'SevenTwo is on your Home Screen',
    text: 'SevenTwo is installed and close whenever poker night needs it.',
    visual: <InstalledPreview />,
  }
  return {
    title: 'Keep SevenTwo close',
    text: 'Install SevenTwo from your browser menu for quick app-like access.',
    visual: <DesktopInstallPreview />,
  }
}

function PollPreview() {
  return (
    <div aria-hidden="true" className="glass-raised mx-auto max-w-sm rounded-2xl p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div><p className="font-black">Friday · 20:00</p><p className="mt-1 text-xs font-bold text-positive">GOOD TABLE</p></div>
        <p className="text-right text-xs leading-5 text-ink-secondary"><strong className="text-ink">6</strong> Available<br />2 Maybe · 1 Can't</p>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-2">
        <span className="flex min-h-11 items-center justify-center rounded-xl bg-white/[0.12] text-xs font-bold">Available</span>
        <span className="flex min-h-11 items-center justify-center rounded-xl bg-black/20 text-xs font-bold text-ink-muted">Maybe</span>
        <span className="col-span-2 flex min-h-11 items-center justify-center rounded-xl bg-black/20 text-xs font-bold text-ink-muted">Can't</span>
      </div>
    </div>
  )
}

function IOSInstallPreview() {
  return (
    <div aria-hidden="true" className="mx-auto flex max-w-xs flex-col items-center gap-2 text-center">
      <InstallStep symbol="↑" label="Share" />
      <span className="text-ink-muted">↓</span>
      <InstallStep symbol="＋" label="Add to Home Screen" />
      <span className="text-ink-muted">↓</span>
      <InstallStep symbol="7₂" label="SevenTwo" success />
    </div>
  )
}

function InstalledPreview() {
  return <div aria-hidden="true" className="glass-success mx-auto flex max-w-sm items-center gap-4 rounded-2xl p-5"><span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-white/10 font-black">7₂</span><div><p className="font-black">On your Home Screen</p><p className="mt-1 text-sm text-ink-secondary">Ready for poker night.</p></div></div>
}

function DesktopInstallPreview() {
  return <div aria-hidden="true" className="glass-raised mx-auto max-w-sm rounded-2xl p-5"><p className="section-label">Browser menu</p><div className="mt-4 flex min-h-14 items-center justify-between rounded-xl bg-black/20 px-4"><span className="font-bold">Install SevenTwo</span><span className="text-xl text-ink-secondary">＋</span></div></div>
}

function InstallStep({ symbol, label, success = false }: { symbol: string; label: string; success?: boolean }) {
  return <div className={`flex min-h-14 w-full items-center gap-4 rounded-2xl px-4 text-left ${success ? 'glass-success' : 'glass-raised'}`}><span className="flex size-9 items-center justify-center rounded-xl bg-white/[0.08] font-black">{symbol}</span><span className="font-bold">{label}</span></div>
}

function NotificationPreview() {
  return (
    <div aria-hidden="true" className="glass-raised mx-auto max-w-sm rounded-2xl p-5">
      <p className="font-black">Notifications</p>
      <div className="mt-3 divide-y divide-line/70">
        {['Polls', 'Reminders', 'Session updates'].map((label) => (
          <div key={label} className="flex min-h-12 items-center justify-between"><span className="text-sm font-bold">{label}</span><span className="rounded-md bg-emerald-400/8 px-2 py-1 text-[9px] font-black tracking-[0.12em] text-positive">ON</span></div>
        ))}
      </div>
    </div>
  )
}
