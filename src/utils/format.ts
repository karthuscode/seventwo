export function formatMoney(amount: number, currency = 'RON'): string {
  const roundedAmount =
    Math.sign(amount) *
    (Math.round((Math.abs(amount) + Number.EPSILON) * 100) / 100)
  const displayAmount = Object.is(roundedAmount, -0) ? 0 : roundedAmount
  const hasFraction = Math.abs(displayAmount % 1) > Number.EPSILON
  const formattedAmount = new Intl.NumberFormat('en-RO', {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: hasFraction ? 2 : 0,
  }).format(displayAmount)
  return `${formattedAmount} ${currency}`
}

export function formatDate(date: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${date}T12:00:00`))
}

export function formatDateTime(dateTime: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateTime))
}

export function todayAsInputValue(): string {
  const now = new Date()
  const timezoneOffset = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - timezoneOffset).toISOString().slice(0, 10)
}
