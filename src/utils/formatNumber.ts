/**
 * Centralized Number Formatting Utility
 * 
 * All number formatting in the app should use these functions
 * to ensure consistent English numerals (not Bengali/Arabic/etc.)
 */

/**
 * Format a number with English numerals and thousand separators
 * @param num - The number to format
 * @param options - Formatting options
 */
export const formatNumber = (
  num: number | undefined | null,
  options?: {
    decimals?: number;
    minDecimals?: number;
    maxDecimals?: number;
  }
): string => {
  if (num === undefined || num === null || isNaN(num)) {
    return '0';
  }

  const { decimals, minDecimals, maxDecimals } = options || {};

  if (decimals !== undefined) {
    return num.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  return num.toLocaleString('en-US', {
  });
};

/**
 * Format a number as currency
 * @param amount - The amount to format
 * @param currencySymbol - Currency symbol (e.g., '$', 'Tk', 'Rs')
 * @param decimals - Number of decimal places (default: 2)
 */
export const formatCurrency = (
  amount: number | undefined | null,
  currencySymbol: string = '$',
  decimals: number = 2
): string => {
  if (amount === undefined || amount === null || isNaN(amount)) {
    return `${currencySymbol}0`;
  }

  const formattedNumber = amount.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return `${currencySymbol}${formattedNumber}`;
};

/**
 * Format a large number with K, M, B suffixes
 * @param num - The number to format
 * @param decimals - Decimal places for shortened format
 */
export const formatCompactNumber = (
  num: number | undefined | null,
  decimals: number = 1
): string => {
  if (num === undefined || num === null || isNaN(num)) {
    return '0';
  }

  if (num >= 1000000000) {
    return `${(num / 1000000000).toFixed(decimals)}B`;
  }
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(decimals)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(decimals)}K`;
  }

  return num.toLocaleString('en-US');
};

/**
 * Format a number as beans/diamonds display
 * @param beans - The number of beans/diamonds
 */
export const formatBeans = (beans: number | undefined | null): string => {
  return formatNumber(beans, { maxDecimals: 0 });
};

/**
 * Format a number as USD
 * @param amount - The USD amount
 */
export const formatUSD = (amount: number | undefined | null): string => {
  return formatCurrency(amount, '$', 2);
};

/**
 * Format a percentage
 * @param value - The percentage value (0-100)
 * @param decimals - Decimal places
 */
export const formatPercentage = (
  value: number | undefined | null,
  decimals: number = 1
): string => {
  if (value === undefined || value === null || isNaN(value)) {
    return '0%';
  }
  return `${value.toFixed(decimals)}%`;
};
