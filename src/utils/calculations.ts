import type {
  PaymentMethod,
  PaymentOffset,
  PayoutAllocation,
  SessionPlayer,
  Transaction,
} from '../types/domain'

export type MoneyByMethod = Record<PaymentMethod, number>

export interface BankSummary {
  committed: number
  received: number
  pending: number
  pendingBeforeOffsets: number
  pendingOffset: number
  payouts: number
  receivedByMethod: MoneyByMethod
  pendingByMethod: MoneyByMethod
  payoutsByMethod: MoneyByMethod
  balancesByMethod: MoneyByMethod
  pendingTransactions: Transaction[]
}

export interface PlayerSessionSummary {
  totalBuyIn: number
  transactionCount: number
  receivedAmount: number
  pendingAmount: number
}

export interface PlayerSettlement extends PlayerSessionSummary {
  grossCashOut: number
  pokerResult: number
  pendingBeforeOffsets: number
  pendingOffset: number
  netPayout: number
  remainingOutstanding: number
  payoutTotal: number
  payoutAmounts: MoneyByMethod
}

export interface SessionSettlement {
  committedBuyIns: number
  grossCashOuts: number
  pokerDiscrepancy: number
  bank: BankSummary
}

export interface PlayerLifetimeStats {
  sessionsPlayed: number
  completedSessions: number
  incompleteSessions: number
  totalBuyIn: number
  totalCashOut: number
  profitLoss: number
}

export interface OffsetDraft {
  transactionId: string
  amount: number
}

export interface ChipCirculationSummary {
  totalIssuedChips: number
  alreadyCashedOutChips: number
  maximumCashOutChips: number
}

export function toMinorUnits(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100)
}

export function fromMinorUnits(amount: number): number {
  return amount / 100
}

export function roundMoney(amount: number): number {
  return fromMinorUnits(toMinorUnits(amount))
}

export function calculatePayoutRemaining(
  netPayout: number,
  payoutAmounts: MoneyByMethod,
): number {
  return roundMoney(
    netPayout -
      sumMoney([
        payoutAmounts.CASH,
        payoutAmounts.CARD,
        payoutAmounts.OTHER,
      ]),
  )
}

export function calculateGrossCashOut(
  finalChips: number,
  buyInAmount: number,
  chipsPerBuyIn: number,
): number {
  if (!Number.isFinite(finalChips) || finalChips < 0 || chipsPerBuyIn <= 0) {
    return 0
  }
  const buyInMinor = toMinorUnits(buyInAmount)
  return fromMinorUnits(Math.round((finalChips * buyInMinor) / chipsPerBuyIn))
}

export function calculateChipCirculation(
  transactions: Transaction[],
  sessionPlayers: SessionPlayer[],
  currentSessionPlayerId?: string,
): ChipCirculationSummary {
  const totalIssuedChips = transactions.reduce(
    (total, transaction) => total + transaction.chips,
    0,
  )
  const alreadyCashedOutChips = sessionPlayers.reduce((total, participant) => {
    if (
      participant.id === currentSessionPlayerId ||
      participant.status !== 'CASHED_OUT' ||
      participant.cashOutChips === null
    ) {
      return total
    }
    return total + participant.cashOutChips
  }, 0)

  return {
    totalIssuedChips,
    alreadyCashedOutChips,
    maximumCashOutChips: Math.max(
      totalIssuedChips - alreadyCashedOutChips,
      0,
    ),
  }
}

export function buildPaymentOffsetDraft(
  grossCashOut: number,
  transactions: Transaction[],
  existingOffsets: PaymentOffset[] = [],
): OffsetDraft[] {
  const previouslyOffsetIds = new Set(
    existingOffsets.map((offset) => offset.transactionId),
  )
  const candidates = [...transactions]
    .filter(
      (transaction) =>
        transaction.paymentStatus === 'PENDING' ||
        previouslyOffsetIds.has(transaction.id),
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))

  let remainingMinor = Math.min(
    toMinorUnits(grossCashOut),
    candidates.reduce(
      (total, transaction) => total + toMinorUnits(transaction.amount),
      0,
    ),
  )

  return candidates.flatMap((transaction) => {
    if (remainingMinor <= 0) return []
    const amountMinor = Math.min(
      remainingMinor,
      toMinorUnits(transaction.amount),
    )
    remainingMinor -= amountMinor
    return [{ transactionId: transaction.id, amount: fromMinorUnits(amountMinor) }]
  })
}

export function calculateBankSummary(
  transactions: Transaction[],
  payoutAllocations: PayoutAllocation[] = [],
  paymentOffsets: PaymentOffset[] = [],
): BankSummary {
  const receivedMinor = emptyMinorByMethod()
  const pendingMinor = emptyMinorByMethod()
  const payoutMinor = emptyMinorByMethod()
  const offsetsByTransaction = sumOffsetsByTransaction(paymentOffsets)
  let pendingBeforeOffsetsMinor = 0

  for (const transaction of transactions) {
    const amountMinor = toMinorUnits(transaction.amount)
    const offsetMinor = Math.min(
      amountMinor,
      offsetsByTransaction.get(transaction.id) ?? 0,
    )
    if (transaction.paymentStatus === 'RECEIVED') {
      receivedMinor[transaction.paymentMethod] += amountMinor - offsetMinor
      pendingBeforeOffsetsMinor += offsetMinor
    } else {
      pendingBeforeOffsetsMinor += amountMinor
      pendingMinor[transaction.paymentMethod] += amountMinor - offsetMinor
    }
  }

  for (const payout of payoutAllocations) {
    payoutMinor[payout.paymentMethod] += toMinorUnits(payout.amount)
  }

  const receivedByMethod = fromMinorByMethod(receivedMinor)
  const pendingByMethod = fromMinorByMethod(pendingMinor)
  const payoutsByMethod = fromMinorByMethod(payoutMinor)
  const balancesByMethod = fromMinorByMethod({
    CASH: receivedMinor.CASH - payoutMinor.CASH,
    CARD: receivedMinor.CARD - payoutMinor.CARD,
    OTHER: receivedMinor.OTHER - payoutMinor.OTHER,
  })

  return {
    committed: sumTransactions(transactions),
    received: sumByMethod(receivedByMethod),
    pending: sumByMethod(pendingByMethod),
    pendingBeforeOffsets: fromMinorUnits(pendingBeforeOffsetsMinor),
    pendingOffset: sumMoney(paymentOffsets.map((offset) => offset.amount)),
    payouts: sumByMethod(payoutsByMethod),
    receivedByMethod,
    pendingByMethod,
    payoutsByMethod,
    balancesByMethod,
    pendingTransactions: transactions.filter(
      (transaction) => transaction.paymentStatus === 'PENDING',
    ),
  }
}

export function calculatePlayerSessionSummary(
  transactions: Transaction[],
  paymentOffsets: PaymentOffset[] = [],
): PlayerSessionSummary {
  const bank = calculateBankSummary(transactions, [], paymentOffsets)
  return {
    totalBuyIn: bank.committed,
    transactionCount: transactions.length,
    receivedAmount: bank.received,
    pendingAmount: bank.pending,
  }
}

export function calculatePlayerSettlement(
  sessionPlayer: SessionPlayer,
  transactions: Transaction[],
  payoutAllocations: PayoutAllocation[],
  paymentOffsets: PaymentOffset[],
): PlayerSettlement {
  const bank = calculateBankSummary(
    transactions,
    payoutAllocations,
    paymentOffsets,
  )
  const grossCashOut = sessionPlayer.cashOutAmount ?? 0
  const payoutAmounts = bank.payoutsByMethod

  return {
    totalBuyIn: bank.committed,
    transactionCount: transactions.length,
    receivedAmount: bank.received,
    pendingAmount: bank.pending,
    grossCashOut,
    pokerResult: roundMoney(grossCashOut - bank.committed),
    pendingBeforeOffsets: bank.pendingBeforeOffsets,
    pendingOffset: bank.pendingOffset,
    netPayout: roundMoney(Math.max(grossCashOut - bank.pendingOffset, 0)),
    remainingOutstanding: bank.pending,
    payoutTotal: bank.payouts,
    payoutAmounts,
  }
}

export function calculateSessionSettlement(
  sessionPlayers: SessionPlayer[],
  transactions: Transaction[],
  payoutAllocations: PayoutAllocation[],
  paymentOffsets: PaymentOffset[],
): SessionSettlement {
  const grossCashOuts = sumMoney(
    sessionPlayers.map((sessionPlayer) => sessionPlayer.cashOutAmount ?? 0),
  )
  const bank = calculateBankSummary(
    transactions,
    payoutAllocations,
    paymentOffsets,
  )
  return {
    committedBuyIns: bank.committed,
    grossCashOuts,
    pokerDiscrepancy: roundMoney(grossCashOuts - bank.committed),
    bank,
  }
}

export function calculatePlayerLifetimeStats(
  playerId: string,
  sessionPlayers: SessionPlayer[],
  transactions: Transaction[],
): PlayerLifetimeStats {
  const appearances = sessionPlayers.filter(
    (sessionPlayer) => sessionPlayer.playerId === playerId,
  )
  const completedAppearances = appearances.filter(
    (appearance) =>
      appearance.status === 'CASHED_OUT' && appearance.cashOutAmount !== null,
  )
  const completedSessionIds = new Set(
    completedAppearances.map((appearance) => appearance.sessionId),
  )
  const completedBuyIns = transactions.filter(
    (transaction) =>
      transaction.playerId === playerId &&
      completedSessionIds.has(transaction.sessionId),
  )
  const totalBuyIn = sumTransactions(completedBuyIns)
  const totalCashOut = sumMoney(
    completedAppearances.map((appearance) => appearance.cashOutAmount ?? 0),
  )

  return {
    sessionsPlayed: new Set(
      appearances.map((appearance) => appearance.sessionId),
    ).size,
    completedSessions: completedSessionIds.size,
    incompleteSessions: Math.max(
      new Set(appearances.map((appearance) => appearance.sessionId)).size -
        completedSessionIds.size,
      0,
    ),
    totalBuyIn,
    totalCashOut,
    profitLoss: roundMoney(totalCashOut - totalBuyIn),
  }
}

export function sumMoney(amounts: number[]): number {
  return fromMinorUnits(
    amounts.reduce((total, amount) => total + toMinorUnits(amount), 0),
  )
}

function sumTransactions(transactions: Transaction[]): number {
  return sumMoney(transactions.map((transaction) => transaction.amount))
}

function sumOffsetsByTransaction(
  offsets: PaymentOffset[],
): Map<string, number> {
  const result = new Map<string, number>()
  for (const offset of offsets) {
    result.set(
      offset.transactionId,
      (result.get(offset.transactionId) ?? 0) + toMinorUnits(offset.amount),
    )
  }
  return result
}

function emptyMinorByMethod(): Record<PaymentMethod, number> {
  return { CASH: 0, CARD: 0, OTHER: 0 }
}

function fromMinorByMethod(
  amounts: Record<PaymentMethod, number>,
): MoneyByMethod {
  return {
    CASH: fromMinorUnits(amounts.CASH),
    CARD: fromMinorUnits(amounts.CARD),
    OTHER: fromMinorUnits(amounts.OTHER),
  }
}

function sumByMethod(amounts: MoneyByMethod): number {
  return sumMoney([amounts.CASH, amounts.CARD, amounts.OTHER])
}
