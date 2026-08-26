import type { PaymentMethod } from '../types/domain'

export const STANDARD_PAYMENT_METHODS = ['CASH', 'CARD'] as const satisfies readonly PaymentMethod[]

export function isStandardPaymentMethod(
  paymentMethod: PaymentMethod,
): paymentMethod is (typeof STANDARD_PAYMENT_METHODS)[number] {
  return paymentMethod === 'CASH' || paymentMethod === 'CARD'
}
