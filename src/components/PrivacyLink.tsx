const PRIVACY_POLICY_URL = 'https://github.com/karthuscode/seventwo/blob/main/PRIVACY.md'

export function PrivacyLink({ className = '' }: { className?: string }) {
  return (
    <a
      href={PRIVACY_POLICY_URL}
      target="_blank"
      rel="noreferrer"
      className={`text-xs text-ink-muted underline-offset-4 transition hover:text-ink-secondary hover:underline focus-visible:rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${className}`}
    >
      Privacy Policy
    </a>
  )
}
