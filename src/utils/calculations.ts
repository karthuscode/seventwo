import type { SessionPlayer, Transaction } from '../types/domain'

export interface BankSummary {
  committed: number
  received: number
  pending: number
  pendingTransactions: Transaction[]
}

export interface PlayerSessionSummary {
  totalBuyIn: number
  transactionCount: number
  pendingAmount: number
}

export interface PlayerLifetimeStats {
  sessionsPlayed: number
  totalBuyIn: number
  totalCashOut: number
  profitLoss: number
}

export function calculateBankSummary(
  transactions: Transaction[],
): BankSummary {
  const pendingTransactions = transactions.filter(
    (transaction) => transaction.paymentStatus === 'PENDING',
  )
  const committed = sumAmounts(transactions)
  const pending = sumAmounts(pendingTransactions)

  return {
    committed,
    received: committed - pending,
    pending,
    pendingTransactions,
  }
}

export function calculatePlayerSessionSummary(
  transactions: Transaction[],
): PlayerSessionSummary {
  return {
    totalBuyIn: sumAmounts(transactions),
    transactionCount: transactions.length,
    pendingAmount: sumAmounts(
      transactions.filter(
        (transaction) => transaction.paymentStatus === 'PENDING',
      ),
    ),
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
  const buyIns = transactions.filter(
    (transaction) => transaction.playerId === playerId,
  )
  const totalBuyIn = sumAmounts(buyIns)
  const totalCashOut = appearances.reduce(
    (total, appearance) => total + (appearance.cashOutAmount ?? 0),
    0,
  )

  return {
    sessionsPlayed: new Set(
      appearances.map((appearance) => appearance.sessionId),
    ).size,
    totalBuyIn,
    totalCashOut,
    profitLoss: totalCashOut - totalBuyIn,
  }
}

function sumAmounts(transactions: Transaction[]): number {
  return transactions.reduce(
    (total, transaction) => total + transaction.amount,
    0,
  )
}
