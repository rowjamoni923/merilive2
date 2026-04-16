type NumericLike = number | string | null | undefined;

interface WithdrawalPaymentDetailsLike {
  local_amount?: NumericLike;
  usd_amount?: NumericLike;
  net_withdrawal_local?: NumericLike;
  net_withdrawal_usd?: NumericLike;
  net_withdrawal_beans?: NumericLike;
  withdrawal_fee_local?: NumericLike;
  withdrawal_fee_usd?: NumericLike;
  withdrawal_fee_beans?: NumericLike;
}

interface WithdrawalLike {
  amount?: NumericLike;
  payment_details?: WithdrawalPaymentDetailsLike | null;
}

const toFiniteNumber = (value: NumericLike): number | null => {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null;
};

export const resolveNetWithdrawalBeans = (withdrawal: WithdrawalLike): number => {
  const details = withdrawal.payment_details;
  const storedNet = toFiniteNumber(details?.net_withdrawal_beans);
  if (storedNet !== null) return Math.max(0, storedNet);

  const gross = toFiniteNumber(withdrawal.amount);
  const fee = toFiniteNumber(details?.withdrawal_fee_beans);
  if (gross !== null && fee !== null) return Math.max(0, gross - fee);

  return Math.max(0, gross ?? 0);
};

export const resolveNetWithdrawalUsd = (withdrawal: WithdrawalLike, beansToUsdRate?: number): number => {
  const details = withdrawal.payment_details;
  const storedNet = toFiniteNumber(details?.net_withdrawal_usd);
  if (storedNet !== null) return Math.max(0, storedNet);

  const gross = toFiniteNumber(details?.usd_amount);
  const fee = toFiniteNumber(details?.withdrawal_fee_usd);
  if (gross !== null && fee !== null) return Math.max(0, gross - fee);

  if (gross !== null) return Math.max(0, gross);

  const grossBeans = toFiniteNumber(withdrawal.amount);
  if (grossBeans !== null && beansToUsdRate && beansToUsdRate > 0) {
    return Math.max(0, grossBeans / beansToUsdRate);
  }

  return 0;
};

export const resolveNetWithdrawalLocal = (withdrawal: WithdrawalLike): number => {
  const details = withdrawal.payment_details;
  const storedNet = toFiniteNumber(details?.net_withdrawal_local);
  if (storedNet !== null) return Math.max(0, storedNet);

  const gross = toFiniteNumber(details?.local_amount);
  const fee = toFiniteNumber(details?.withdrawal_fee_local);
  if (gross !== null && fee !== null) return Math.max(0, gross - fee);

  return Math.max(0, gross ?? 0);
};