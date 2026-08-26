import {
  buildPaymentOffsetDraft,
  calculateGrossCashOut,
  calculateBankSummary,
  calculateChipCirculation,
  calculatePayoutRemaining,
  calculatePlayerSettlement,
} from '../src/utils/calculations.ts'
import type {
  PaymentOffset,
  SessionPlayer,
  Transaction,
} from '../src/types/domain.ts'
import { STANDARD_PAYMENT_METHODS } from '../src/utils/paymentMethods.ts'

const sessionPlayer: SessionPlayer = {
  id: 'participant',
  workspaceId: 'workspace',
  sessionId: 'session',
  playerId: 'player',
  joinedAt: '2026-08-27T18:00:00.000Z',
  cashOutChips: 300,
  cashOutAmount: 90,
  cashedOutAt: '2026-08-27T22:00:00.000Z',
  status: 'CASHED_OUT',
}

verify('full payment', [transaction('received', 60, 'RECEIVED')], 90, {
  result: 30,
  offset: 0,
  payout: 90,
  outstanding: 0,
})

verify(
  'partial pending offset',
  [
    transaction('received', 30, 'RECEIVED'),
    transaction('pending', 30, 'PENDING'),
  ],
  90,
  { result: 30, offset: 30, payout: 60, outstanding: 0 },
)

verify(
  'outstanding after bust',
  [
    transaction('received', 30, 'RECEIVED'),
    transaction('pending', 30, 'PENDING'),
  ],
  0,
  { result: -60, offset: 0, payout: 0, outstanding: 30 },
)

verify(
  'pending larger than cash-out',
  [
    transaction('received', 30, 'RECEIVED'),
    transaction('pending', 60, 'PENDING'),
  ],
  20,
  { result: -70, offset: 20, payout: 0, outstanding: 40 },
)

assertEqual(calculateGrossCashOut(340, 30, 100), 102, 'chip conversion')
assertEqual(calculateGrossCashOut(1, 10, 3), 3.33, 'money rounding')
assertEqual(
  calculatePayoutRemaining(90, { CASH: 40, CARD: 50, OTHER: 0 }),
  0,
  'valid split payout',
)
assertEqual(
  calculatePayoutRemaining(90, { CASH: 40, CARD: 40, OTHER: 0 }),
  10,
  'invalid split remainder',
)

const methodBank = calculateBankSummary([
  { ...transaction('cash-received', 180, 'RECEIVED'), paymentMethod: 'CASH' },
  { ...transaction('card-received', 150, 'RECEIVED'), paymentMethod: 'CARD' },
  { ...transaction('cash-pending', 30, 'PENDING'), paymentMethod: 'CASH' },
  { ...transaction('card-pending', 60, 'PENDING'), paymentMethod: 'CARD' },
])
assertEqual(methodBank.receivedByMethod.CASH, 180, 'cash received breakdown')
assertEqual(methodBank.receivedByMethod.CARD, 150, 'card received breakdown')
assertEqual(methodBank.pendingByMethod.CASH, 30, 'cash pending breakdown')
assertEqual(methodBank.pendingByMethod.CARD, 60, 'card pending breakdown')
assertText(
  STANDARD_PAYMENT_METHODS.join(','),
  'CASH,CARD',
  'normal creation methods are Cash and Card only',
)
const legacyOtherBank = calculateBankSummary([
  { ...transaction('legacy-other', 25, 'RECEIVED'), paymentMethod: 'OTHER' },
])
assertEqual(
  legacyOtherBank.receivedByMethod.OTHER,
  25,
  'legacy Other transactions remain readable',
)

const participants: SessionPlayer[] = [
  { ...sessionPlayer, id: 'first', cashOutChips: 150 },
  {
    ...sessionPlayer,
    id: 'second',
    playerId: 'second-player',
    cashOutChips: null,
    cashOutAmount: null,
    cashedOutAt: null,
    status: 'ACTIVE',
  },
  {
    ...sessionPlayer,
    id: 'third',
    playerId: 'third-player',
    cashOutChips: null,
    cashOutAmount: null,
    cashedOutAt: null,
    status: 'ACTIVE',
  },
]
const initialTransactions = [
  transaction('player-one', 30, 'PENDING'),
  { ...transaction('player-two', 30, 'PENDING'), playerId: 'second-player' },
  { ...transaction('player-three', 30, 'PENDING'), playerId: 'third-player' },
]
assertEqual(
  calculateChipCirculation(initialTransactions, participants, 'first')
    .maximumCashOutChips,
  300,
  'correcting a cash-out excludes its previous chips',
)
assertEqual(
  calculateChipCirculation(initialTransactions, participants, 'second')
    .maximumCashOutChips,
  150,
  'another player is limited by chips already cashed out',
)
const withRebuy = [
  ...initialTransactions,
  { ...transaction('rebuy', 30, 'PENDING'), type: 'REBUY' as const },
]
assertEqual(
  calculateChipCirculation(withRebuy, participants, 'second').totalIssuedChips,
  400,
  'rebuy increases issued chips',
)
assertEqual(
  calculateChipCirculation(withRebuy, participants, 'second')
    .maximumCashOutChips,
  250,
  'rebuy increases available chips after an earlier cash-out',
)

console.log('Settlement calculation checks passed.')

function verify(
  label: string,
  transactions: Transaction[],
  grossCashOut: number,
  expected: {
    result: number
    offset: number
    payout: number
    outstanding: number
  },
) {
  const draft = buildPaymentOffsetDraft(grossCashOut, transactions)
  const offsets: PaymentOffset[] = draft.map((item, index) => ({
    id: `offset-${index}`,
    workspaceId: 'workspace',
    sessionId: 'session',
    sessionPlayerId: 'participant',
    transactionId: item.transactionId,
    amount: item.amount,
    createdAt: '2026-08-27T22:00:00.000Z',
    updatedAt: '2026-08-27T22:00:00.000Z',
  }))
  const settlement = calculatePlayerSettlement(
    { ...sessionPlayer, cashOutAmount: grossCashOut },
    transactions,
    [],
    offsets,
  )
  assertEqual(settlement.pokerResult, expected.result, `${label}: result`)
  assertEqual(settlement.pendingOffset, expected.offset, `${label}: offset`)
  assertEqual(settlement.netPayout, expected.payout, `${label}: payout`)
  assertEqual(
    settlement.remainingOutstanding,
    expected.outstanding,
    `${label}: outstanding`,
  )
}

function transaction(
  id: string,
  amount: number,
  paymentStatus: Transaction['paymentStatus'],
): Transaction {
  return {
    id,
    workspaceId: 'workspace',
    sessionId: 'session',
    playerId: 'player',
    type: 'BUY_IN',
    amount,
    chips: 100,
    paymentMethod: 'CARD',
    paymentStatus,
    createdAt: `2026-08-27T18:00:0${id.length}.000Z`,
    updatedAt: '2026-08-27T18:00:00.000Z',
  }
}

function assertEqual(actual: number, expected: number, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, received ${actual}`)
  }
}

function assertText(actual: string, expected: string, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, received ${actual}`)
  }
}
