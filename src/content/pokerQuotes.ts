export const pokerQuotes = [
  'Bad cards build character.',
  'Fold now, complain later.',
  'One more orbit.',
  'Trust the chips.',
  'Bluff responsibly.',
  'Pocket courage.',
  'Same table, new bad decisions.',
  'Cards first. Regrets later.',
  'Just one more hand.',
  'Variance has entered the chat.',
  'Keep calm and count chips.',
  'Small blind, big problems.',
  'Nobody remembers the folds.',
  'All in sounded better five seconds ago.',
  'Good decisions, questionable cards.',
  'The river has opinions.',
  'Stack first. Panic later.',
  "Tonight's strategy: survive.",
  'Fold equity is still equity.',
  'Your chips looked taller an hour ago.',
  'Read the table. Ignore the snacks.',
  'Patience is also a bet.',
] as const

export function pickPokerQuote(): string {
  return pokerQuotes[Math.floor(Math.random() * pokerQuotes.length)]
}
