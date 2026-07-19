import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Wallet,
  Download,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  CreditCard,
  Loader2,
  Globe,
  DollarSign,
  Sparkles,
  TrendingUp,
  ArrowDownCircle,
  Lock
} from "lucide-react";
import { PageSkeleton } from "@/components/common/PageSkeleton";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { getCurrencyRateMap } from "@/utils/currencyRatesCache";

import { getAppSetting } from "@/utils/appSettingsCache";
import { toast } from "sonner";
import { recordClientError } from "@/utils/clientErrorLog";

interface Agency {
  id: string;
  name: string;
  wallet_balance: number;
  beans_balance?: number;
  calculated_balance?: number; // From earnings transfers
}

interface Profile {
  country_code: string | null;
  country_name: string | null;
}

interface WithdrawalPaymentDetails {
  country_code?: string;
  currency_code?: string;
  local_amount?: number;
  exchange_rate?: number;
  usd_amount?: number;
  account_name?: string;
  account_number?: string;
  bank_name?: string;
  additional_info?: string;
  // Fee details for payroll processing (Fee goes to ADMIN only)
  withdrawal_fee_usd?: number;
  withdrawal_fee_beans?: number;
  withdrawal_fee_local?: number;
  fee_recipient?: string; // 'admin' - fee collected by admin
  // Net amount (without fee) - for payroll to process
  net_withdrawal_beans?: number;
  net_withdrawal_usd?: number;
  net_withdrawal_local?: number;
  // Payment method limits
  payment_method_max_limit?: number | null;
  payment_method_min_limit?: number;
}

interface Withdrawal {
  id: string;
  amount: number;
  status: string;
  payment_method: string;
  requested_at: string;
  processed_at: string | null;
  notes: string | null;
  payment_details: WithdrawalPaymentDetails | null;
  helper_processed_at?: string | null;
  helper_payment_screenshot?: string | null;
}

interface CommissionSettings {
  coins_to_dollar_rate: number;
}

interface PaymentMethodConfig {
  value: string;
  label: string;
  fields?: string[];
  minLimit?: number;  // Min amount in local currency
  maxLimit?: number;  // Max amount in local currency
}

interface CountryConfig {
  name: string;
  flag: string;
  currency: string;
  currencySymbol: string;
  paymentMethods: PaymentMethodConfig[];
  withdrawalFeeUsd?: number;  // Withdrawal fee in USD
}

const accountNameSchema = z
  .string()
  .trim()
  .min(2, "Enter a valid account name")
  .max(80, "Account name is too long")
  .regex(/^[\p{L}][\p{L}\p{M} .'-]*$/u, "Enter a valid account name");

const emailAccountSchema = z
  .string()
  .trim()
  .email("ePay account must be a valid email address");

const upiAccountSchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9._-]{2,}@[a-z]{2,}$/i, "UPI account must be a valid UPI ID");

const numericWalletSchema = z
  .string()
  .trim()
  .regex(/^\d{8,20}$/, "Enter a valid wallet/account number");

const alipayAccountSchema = z
  .string()
  .trim()
  .refine(
    (value) => emailAccountSchema.safeParse(value).success || numericWalletSchema.safeParse(value).success,
    "Alipay account must be a valid email or phone/account number"
  );

// Minimum withdrawal in USD (applies to all countries)
const MINIMUM_WITHDRAWAL_USD = 10;

// Payment method limits by country (in local currency) - only max limits now, min is $10 USD converted
const PAYMENT_MAX_LIMITS: Record<string, Record<string, number>> = {
  BD: {
    bkash: 25000,
    nagad: 25000,
  },
};

// Withdrawal fees by country (in USD) - tiered based on amount
// Fee structure: { base: base fee USD, tiers: [{maxLocal: max local amount, feeUsd: fee for this tier}] }
interface WithdrawalFeeTier {
  maxLocal: number;  // Max local currency amount for this tier
  feeUsd: number;    // Fee in USD for this tier
}

interface CountryFeeConfig {
  defaultFeeUsd: number;  // Default fee if no tier matches
  tiers?: WithdrawalFeeTier[];  // Optional tiered fees
}

const WITHDRAWAL_FEE_CONFIG: Record<string, CountryFeeConfig> = {
  BD: {
    defaultFeeUsd: 5,
    tiers: [
      { maxLocal: 5000, feeUsd: 1 },      // Up to 5,000 BDT = $1 fee
      { maxLocal: 10000, feeUsd: 2 },     // 5,001 - 10,000 BDT = $2 fee
      { maxLocal: 15000, feeUsd: 3 },     // 10,001 - 15,000 BDT = $3 fee
      { maxLocal: 20000, feeUsd: 4 },     // 15,001 - 20,000 BDT = $4 fee
      { maxLocal: 25000, feeUsd: 5 },     // 20,001 - 25,000 BDT = $5 fee
      { maxLocal: 50000, feeUsd: 8 },     // 25,001 - 50,000 BDT = $8 fee
      { maxLocal: 100000, feeUsd: 12 },   // 50,001 - 100,000 BDT = $12 fee
      { maxLocal: Infinity, feeUsd: 15 }  // Above 100,000 BDT = $15 fee
    ]
  },
  IN: {
      { maxLocal: 10000, feeUsd: 1 },
      { maxLocal: 25000, feeUsd: 2 },
      { maxLocal: 50000, feeUsd: 3 },
      { maxLocal: 100000, feeUsd: 5 },
      { maxLocal: Infinity, feeUsd: 8 }
    ]
  },
  PK: {
      { maxLocal: 25000, feeUsd: 1 },
      { maxLocal: 50000, feeUsd: 2 },
      { maxLocal: 100000, feeUsd: 3 },
      { maxLocal: Infinity, feeUsd: 5 }
    ]
  },
  // Default for all other countries
  DEFAULT: {
      { maxLocal: Infinity, feeUsd: 2 }
    ]
  }
};

// Comprehensive list of countries with their currencies and payment methods
// Only one default payment method per country (most popular)
const COUNTRY_CONFIGS: Record<string, CountryConfig> = {
  // Asia
  BD: {
    name: "Bangladesh",
    flag: "🇧🇩",
    currency: "BDT",
    currencySymbol: "Tk ",
    paymentMethods: [
      { value: "bkash", label: "bKash" },
      { value: "nagad", label: "Nagad" },
      { value: "crypto_auto", label: "💎 MeriCash (USDT Auto-Credit)" },
    ]
  },
  IN: {
      { value: "upi", label: "UPI" },
      { value: "crypto_auto", label: "💎 MeriCash (USDT Auto-Credit)" },
    ]
  },
  PK: {
      { value: "easypaisa", label: "Easypaisa" },
      { value: "crypto_auto", label: "💎 MeriCash (USDT Auto-Credit)" },
    ]
  },
  NP: {
      { value: "esewa", label: "eSewa" },
      { value: "crypto_auto", label: "💎 MeriCash (USDT Auto-Credit)" },
    ]
  },
  LK: {
      { value: "frimi", label: "FriMi" },
      { value: "crypto_auto", label: "💎 MeriCash (USDT Auto-Credit)" },
    ]
  },
  PH: {
      { value: "gcash", label: "GCash" },
      { value: "crypto_auto", label: "💎 MeriCash (USDT Auto-Credit)" },
    ]
  },
  ID: {
      { value: "gopay", label: "GoPay" },
      { value: "crypto_auto", label: "💎 MeriCash (USDT Auto-Credit)" },
    ]
  },
  VN: {
      { value: "momo", label: "MoMo" },
      { value: "crypto_auto", label: "💎 MeriCash (USDT Auto-Credit)" },
    ]
  },
  TH: {
      { value: "promptpay", label: "PromptPay" },
      { value: "crypto_auto", label: "💎 MeriCash (USDT Auto-Credit)" },
    ]
  },
  MY: {
      { value: "grabpay", label: "GrabPay" },
      { value: "crypto_auto", label: "💎 MeriCash (USDT Auto-Credit)" },
    ]
  },
  SG: {
      { value: "paynow", label: "PayNow" },
      { value: "crypto_auto", label: "💎 MeriCash (USDT Auto-Credit)" },
    ]
  },
  JP: {
      { value: "paypay", label: "PayPay" },
      { value: "crypto_auto", label: "💎 MeriCash (USDT Auto-Credit)" },
    ]
  },
  KR: {
      { value: "kakaopay", label: "Kakao Pay" },
    ]
  },
  CN: {
      { value: "alipay", label: "Alipay" },
    ]
  },
  HK: {
      { value: "payme", label: "PayMe" },
    ]
  },
  TW: {
      { value: "linepay", label: "LINE Pay" },
    ]
  },
  MM: {
      { value: "wavepay", label: "Wave Pay" },
    ]
  },
  KH: {
      { value: "wing", label: "Wing" },
    ]
  },
  LA: {
      { value: "bcel", label: "BCEL One" },
    ]
  },
  BN: {
      { value: "progresifpay", label: "Progresif Pay" },
    ]
  },
  MN: {
      { value: "qpay", label: "QPay" },
    ]
  },
  KZ: {
      { value: "kaspi", label: "Kaspi Gold" },
    ]
  },
  UZ: {
      { value: "payme", label: "Payme" },
    ]
  },
  AZ: {
      { value: "mpay", label: "m10" },
    ]
  },
  GE: {
      { value: "tbcpay", label: "TBC Pay" },
    ]
  },
  AM: {
      { value: "idram", label: "Idram" },
    ]
  },

  // Middle East
  AE: {
      { value: "applepay", label: "Apple Pay" },
    ]
  },
  SA: {
      { value: "stcpay", label: "STC Pay" },
    ]
  },
  QA: {
      { value: "vodafonepay", label: "Vodafone Pay" },
    ]
  },
  KW: {
      { value: "knet", label: "K-Net" },
    ]
  },
  BH: {
      { value: "benefitpay", label: "BenefitPay" },
    ]
  },
  OM: {
      { value: "thawani", label: "Thawani" },
    ]
  },
  JO: {
      { value: "efawateercom", label: "eFAWATEERcom" },
    ]
  },
  IQ: {
      { value: "zaincash", label: "Zain Cash" },
    ]
  },
  TR: {
      { value: "papara", label: "Papara" },
    ]
  },
  EG: {
      { value: "vodafonecash", label: "Vodafone Cash" },
    ]
  },

  // Africa
  NG: {
      { value: "opay", label: "OPay" },
    ]
  },
  GH: {
      { value: "mtnmomo", label: "MTN MoMo" },
    ]
  },
  KE: {
      { value: "mpesa", label: "M-Pesa" },
    ]
  },
  TZ: {
      { value: "mpesa", label: "M-Pesa" },
    ]
  },
  UG: {
      { value: "mtnmomo", label: "MTN Mobile Money" },
    ]
  },
  ET: {
      { value: "telebirr", label: "TeleBirr" },
    ]
  },
  ZA: {
      { value: "snapscan", label: "SnapScan" },
    ]
  },
  MA: {
      { value: "cmi", label: "CMI" },
    ]
  },
  SN: {
      { value: "wave", label: "Wave" },
    ]
  },
  CI: {
      { value: "orangemoney", label: "Orange Money" },
    ]
  },
  CM: {
      { value: "orangemoney", label: "Orange Money" },
    ]
  },
  ZM: {
      { value: "mtnmomo", label: "MTN Mobile Money" },
    ]
  },
  ZW: {
      { value: "ecocash", label: "EcoCash" },
    ]
  },
  MZ: {
      { value: "mpesa", label: "M-Pesa" },
    ]
  },
  AO: {
      { value: "multicaixa", label: "Multicaixa Express" },
    ]
  },

  // Europe
  GB: {
      { value: "revolut", label: "Revolut" },
    ]
  },
  DE: {
      { value: "paypal", label: "PayPal" },
    ]
  },
  FR: {
      { value: "paypal", label: "PayPal" },
    ]
  },
  IT: {
      { value: "satispay", label: "Satispay" },
    ]
  },
  ES: {
      { value: "bizum", label: "Bizum" },
    ]
  },
  PT: {
      { value: "mbway", label: "MB WAY" },
    ]
  },
  NL: {
      { value: "ideal", label: "iDEAL" },
    ]
  },
  BE: {
      { value: "bancontact", label: "Bancontact" },
    ]
  },
  AT: {
      { value: "eps", label: "EPS" },
    ]
  },
  CH: {
      { value: "twint", label: "TWINT" },
    ]
  },
  PL: {
      { value: "blik", label: "BLIK" },
    ]
  },
  CZ: {
      { value: "paypal", label: "PayPal" },
    ]
  },
  HU: {
      { value: "paypal", label: "PayPal" },
    ]
  },
  RO: {
      { value: "revolut", label: "Revolut" },
    ]
  },
  BG: {
      { value: "paypal", label: "PayPal" },
    ]
  },
  GR: {
      { value: "paypal", label: "PayPal" },
    ]
  },
  SE: {
      { value: "swish", label: "Swish" },
    ]
  },
  NO: {
      { value: "vipps", label: "Vipps" },
    ]
  },
  DK: {
      { value: "mobilepay", label: "MobilePay" },
    ]
  },
  FI: {
      { value: "mobilepay", label: "MobilePay" },
    ]
  },
  IE: {
      { value: "revolut", label: "Revolut" },
    ]
  },
  UA: {
      { value: "monobank", label: "Monobank" },
    ]
  },
  RU: {
      { value: "sbp", label: "SBP" },
    ]
  },
  BY: {
      { value: "erip", label: "ERIP" },
    ]
  },
  RS: {
      { value: "paypal", label: "PayPal" },
    ]
  },
  HR: {
      { value: "paypal", label: "PayPal" },
    ]
  },
  SK: {
      { value: "paypal", label: "PayPal" },
    ]
  },
  SI: {
      { value: "paypal", label: "PayPal" },
    ]
  },
  LT: {
      { value: "revolut", label: "Revolut" },
    ]
  },
  LV: {
      { value: "paypal", label: "PayPal" },
    ]
  },
  EE: {
      { value: "wise", label: "Wise" },
    ]
  },
  MD: {
      { value: "paypal", label: "PayPal" },
    ]
  },
  AL: {
      { value: "paypal", label: "PayPal" },
    ]
  },
  MK: {
      { value: "paypal", label: "PayPal" },
    ]
  },
  BA: {
      { value: "paypal", label: "PayPal" },
    ]
  },
  ME: {
      { value: "paypal", label: "PayPal" },
    ]
  },
  IS: {
      { value: "paypal", label: "PayPal" },
    ]
  },
  LU: {
      { value: "paypal", label: "PayPal" },
    ]
  },
  MT: {
      { value: "paypal", label: "PayPal" },
    ]
  },
  CY: {
      { value: "paypal", label: "PayPal" },
    ]
  },

  // Americas
  US: {
      { value: "venmo", label: "Venmo" },
    ]
  },
  CA: {
      { value: "interac", label: "Interac e-Transfer" },
    ]
  },
  MX: {
      { value: "mercadopago", label: "Mercado Pago" },
    ]
  },
  BR: {
      { value: "pix", label: "PIX" },
    ]
  },
  AR: {
      { value: "mercadopago", label: "Mercado Pago" },
    ]
  },
  CL: {
      { value: "mercadopago", label: "Mercado Pago" },
    ]
  },
  CO: {
      { value: "nequi", label: "Nequi" },
    ]
  },
  PE: {
      { value: "yape", label: "Yape" },
    ]
  },
  VE: {
      { value: "pagomovil", label: "Pago Móvil" },
    ]
  },
  EC: {
      { value: "paypal", label: "PayPal" },
    ]
  },
  BO: {
      { value: "qr", label: "QR Simple" },
    ]
  },
  PY: {
      { value: "tigo", label: "Tigo Money" },
    ]
  },
  UY: {
      { value: "prex", label: "Prex" },
    ]
  },
  CR: {
      { value: "sinpe", label: "SINPE Móvil" },
    ]
  },
  PA: {
      { value: "yappy", label: "Yappy" },
    ]
  },
  GT: {
      { value: "tigo", label: "Tigo Money" },
    ]
  },
  HN: {
      { value: "tigo", label: "Tigo Money" },
    ]
  },
  SV: {
      { value: "chivo", label: "Chivo Wallet" },
    ]
  },
  NI: {
      { value: "paypal", label: "PayPal" },
    ]
  },
  DO: {
      { value: "yolopago", label: "Yolo Pago" },
    ]
  },
  PR: {
      { value: "athm", label: "ATH Móvil" },
    ]
  },
  CU: {
      { value: "transfermovil", label: "Transfermóvil" },
    ]
  },
  JM: {
      { value: "lynk", label: "Lynk" },
    ]
  },
  TT: {
      { value: "paypal", label: "PayPal" },
    ]
  },
  HT: {
      { value: "moncash", label: "MonCash" },
    ]
  },

  // Oceania
  AU: {
      { value: "payid", label: "PayID" },
    ]
  },
  NZ: {
      { value: "paypal", label: "PayPal" },
    ]
  },
  FJ: {
      { value: "mpaisaFiji", label: "M-PAiSA" },
    ]
  },
  PG: {
      { value: "paypal", label: "PayPal" },
    ]
  },

  // Additional countries
  AF: {
      { value: "hawala", label: "Hawala" },
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  BT: {
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  MV: {
      { value: "bml", label: "BML App" },
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  TJ: {
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  TM: {
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  KG: {
      { value: "o", label: "O! Money" },
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  YE: {
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  SY: {
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  PS: {
      { value: "jawwal", label: "Jawwal Pay" },
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  LY: {
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  SD: {
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  SS: {
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  SO: {
      { value: "zaad", label: "Zaad" },
      { value: "edahab", label: "eDahab" },
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  DJ: {
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  ER: {
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  MG: {
      { value: "mvola", label: "MVola" },
      { value: "orangemoney", label: "Orange Money" },
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  MU: {
      { value: "juice", label: "Juice by MCB" },
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  SC: {
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  BW: {
      { value: "smega", label: "Smega" },
      { value: "orange", label: "Orange Money" },
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  NA: {
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  LS: {
      { value: "mpesa", label: "M-Pesa" },
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  SZ: {
      { value: "mtn", label: "MTN MoMo" },
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  MW: {
      { value: "airtel", label: "Airtel Money" },
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  ML: {
      { value: "orangemoney", label: "Orange Money" },
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  BF: {
      { value: "orangemoney", label: "Orange Money" },
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  NE: {
      { value: "airtel", label: "Airtel Money" },
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  TD: {
      { value: "airtel", label: "Airtel Money" },
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  CF: {
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  CG: {
      { value: "airtel", label: "Airtel Money" },
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  CD: {
      { value: "mpesa", label: "M-Pesa" },
      { value: "orangemoney", label: "Orange Money" },
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  GA: {
      { value: "airtel", label: "Airtel Money" },
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  GQ: {
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  GN: {
      { value: "orangemoney", label: "Orange Money" },
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  GW: {
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  GM: {
      { value: "qmoney", label: "QMoney" },
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  SL: {
      { value: "orangemoney", label: "Orange Money" },
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  LR: {
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  TG: {
      { value: "flooz", label: "Flooz" },
      { value: "tmoney", label: "T-Money" },
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  BJ: {
      { value: "mtn", label: "MTN MoMo" },
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  MR: {
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  CV: {
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  ST: {
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  KM: {
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  BI: {
      { value: "lumitel", label: "Lumitel Money" },
      { value: "bank", label: "Bank Transfer" },
    ]
  },
};

// ePay is now dynamically shown/hidden based on whether the country has local payroll helpers
// Countries WITH helpers: show local methods only (ePay hidden)
// Countries WITHOUT helpers: show ePay as fallback
// This is handled in the component via hasLocalPayrollHelpers state

// Exchange rates (approximate, should be fetched from API in production)
const DEFAULT_EXCHANGE_RATES: Record<string, number> = {
  USD: 1, BDT: 110, INR: 83, PKR: 278, NPR: 133, LKR: 320, PHP: 56, IDR: 15500,
  VND: 24500, THB: 35, MYR: 4.7, SGD: 1.35, JPY: 150, KRW: 1320, CNY: 7.2,
  HKD: 7.8, TWD: 31, MMK: 2100, KHR: 4100, LAK: 20000, BND: 1.35, MNT: 3450,
  KZT: 450, UZS: 12500, AZN: 1.7, GEL: 2.7, AMD: 400, AED: 3.67, SAR: 3.75,
  QAR: 3.64, KWD: 0.31, BHD: 0.38, OMR: 0.39, JOD: 0.71, LBP: 90000, IQD: 1310,
  IRR: 42000, ILS: 3.7, TRY: 32, EGP: 31, NGN: 1550, GHS: 15, KES: 155,
  TZS: 2500, UGX: 3800, RWF: 1250, ETB: 57, ZAR: 19, MAD: 10, TND: 3.1,
  DZD: 135, XOF: 610, XAF: 610, ZMW: 27, ZWL: 14000, MZN: 64, AOA: 830,
  GBP: 0.79, EUR: 0.92, CHF: 0.88, PLN: 4, CZK: 23, HUF: 360, RON: 4.6,
  BGN: 1.8, SEK: 10.5, NOK: 10.8, DKK: 6.9, UAH: 37, RUB: 92, BYN: 3.3,
  RSD: 108, ISK: 138, MDL: 18, ALL: 95, MKD: 57, BAM: 1.8, CAD: 1.36,
  MXN: 17, BRL: 5, ARS: 870, CLP: 930, COP: 4000, PEN: 3.7, VES: 36,
  BOB: 6.9, PYG: 7300, UYU: 39, CRC: 520, PAB: 1, GTQ: 7.8, HNL: 25,
  NIO: 37, DOP: 57, CUP: 24, JMD: 156, TTD: 6.8, HTG: 132, AUD: 1.55,
  NZD: 1.65, FJD: 2.25, PGK: 3.8, AFN: 70, BTN: 83, MVR: 15.4, TJS: 11,
  TMT: 3.5, KGS: 89, YER: 250, SYP: 13000, LYD: 4.85, SDG: 600, SSP: 130,
  SOS: 570, DJF: 178, ERN: 15, MGA: 4500, MUR: 46, SCR: 13, BWP: 14,
  NAD: 19, LSL: 19, SZL: 19, MWK: 1690, GNF: 8600, GMD: 67, SLE: 22.5,
  LRD: 190, CVE: 102, STN: 23, KMF: 460, BIF: 2850,
};

const AgencyWithdrawal = () => {
  const navigate = useNavigate();
  const [agency, setAgency] = useState<Agency | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [coinsToUsdRate, setCoinsToUsdRate] = useState(10000);
  const [withdrawalFees, setWithdrawalFees] = useState<Array<{id: string; min_amount: number; max_amount: number; fee_type: string; fee_value: number}>>([]);
  const [freeWithdrawalLimit, setFreeWithdrawalLimit] = useState(0); // beans below this = no fee (admin-controlled)
  const [minWithdrawalBeans, setMinWithdrawalBeans] = useState(100000);
  // Admin-configured single % for LOCAL (payroll helper / bKash / Nagad / UPI etc.) withdrawals.
  // Source: app_settings.agency_withdrawal_fee = { rate: N }. Single source of truth.
  // `null` until loaded — guards against showing wrong fee from stale tiered config.
  const [localWithdrawalFeePercent, setLocalWithdrawalFeePercent] = useState<number | null>(null);
  const [exchangeRates, setExchangeRates] = useState<Record<string, number>>(DEFAULT_EXCHANGE_RATES);
  const [hasLocalPayrollHelpers, setHasLocalPayrollHelpers] = useState<boolean | null>(null);
  const [countriesWithHelpers, setCountriesWithHelpers] = useState<string[]>([]);
  // Pkg41+: admin-configured local methods per country (from helper_country_payment_methods).
  // Map of country_code → Set of payment_method_name (e.g. 'bkash', 'nagad', 'upi').
  // If a country has any active L5 helper config rows → only those methods are offered.
  // If empty/missing → fallback to all COUNTRY_CONFIGS local methods.
  const [helperConfiguredMethods, setHelperConfiguredMethods] = useState<Record<string, Set<string>>>({});
  // Auto Withdrawal Fee (admin-configurable: flat USD + percent of USD) — applies to MeriCash / Binance / USDT / Crypto auto methods
  const [autoWithdrawalFee, setAutoWithdrawalFee] = useState<{ flat_usd: number; percent: number; enabled: boolean; methods: string[] }>({
    flat_usd: 2,
    percent: 0,
    enabled: true,
    methods: ['usdt', 'crypto_auto'],
  });
  
  // Form state
  const [selectedCountry, setSelectedCountry] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [bankName, setBankName] = useState("");
  const [additionalInfo, setAdditionalInfo] = useState("");
  
  // History detail dialog
  const [selectedWithdrawal, setSelectedWithdrawal] = useState<Withdrawal | null>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);

  // Display config falls back to BD only for currency/symbol/flag rendering safety. Payment methods
  // are NEVER inherited from this fallback — see getAvailablePaymentMethods() which strictly uses
  // COUNTRY_CONFIGS[selectedCountry] only, so BD bKash/Nagad can never leak to other countries.
  const countryConfig = selectedCountry ? (COUNTRY_CONFIGS[selectedCountry] || COUNTRY_CONFIGS.BD) : COUNTRY_CONFIGS.BD;

  // Convert beans to USD
  const beansToUsd = (beans: number) => {
    return beans / coinsToUsdRate;
  };

  // Convert USD to local currency
  const usdToLocal = (usd: number) => {
    const rate = exchangeRates[countryConfig.currency] || 1;
    return usd * rate;
  };

  // Convert beans to local currency
  const beansToLocal = (beans: number) => {
    const usd = beansToUsd(beans);
    return usdToLocal(usd);
  };

  // Convert local currency to USD
  const localToUsd = (local: number) => {
    const rate = exchangeRates[countryConfig.currency] || 1;
    return local / rate;
  };

  // Convert local currency to beans
  const localToBeans = (local: number) => {
    const usd = localToUsd(local);
    return usd * coinsToUsdRate;
  };

  // Is the current payment method an "auto" method (foreign agency auto-credit: ePay/USDT/Binance/Crypto)?
  const isAutoMethod = (method?: string) => {
    const m = (method ?? paymentMethod ?? '').toLowerCase();
    return autoWithdrawalFee.enabled && autoWithdrawalFee.methods.includes(m);
  };

  // Get withdrawal fee in USD — strict admin-panel single-source-of-truth:
  //   • Auto methods (USDT / Binance / Crypto Auto) → app_settings.auto_withdrawal_fee
  //     (flat USD + percent). Configured in Admin → Pricing Hub → "Auto Withdrawal Fee (Foreign Agencies)".
  //   • Local methods (bKash / Nagad / UPI / payroll helper) → app_settings.agency_withdrawal_fee.rate
  //     (single percent). Configured in Admin → Pricing Hub → "Agency Withdrawal Fee".
  // NEVER fall back to hardcoded numbers or the legacy tiered `withdrawal_settings.fees`.
  const getWithdrawalFeeUsd = (localAmountOverride?: number) => {
    const localAmount = localAmountOverride !== undefined ? localAmountOverride : parseFloat(amount || '0');
    if (!localAmount || localAmount <= 0) return 0;
    const usdAmount = localToUsd(localAmount);

    // Auto method override (admin-controlled: flat USD + percent of USD)
    if (isAutoMethod()) {
      const flat = Math.max(0, Number(autoWithdrawalFee.flat_usd) || 0);
      const pct = Math.max(0, Number(autoWithdrawalFee.percent) || 0);
      return flat + (usdAmount * pct) / 100;
    }

    // Local / payroll-helper methods → single admin %
    if (localWithdrawalFeePercent === null) {
      // Admin config not loaded yet → don't guess. Show 0 to avoid misleading the user.
      return 0;
    }
    const pct = Math.max(0, localWithdrawalFeePercent);
    return (usdAmount * pct) / 100;
  };

  // Get withdrawal fee in beans
  const getWithdrawalFeeBeans = (localAmountOverride?: number) => {
    return getWithdrawalFeeUsd(localAmountOverride) * coinsToUsdRate;
  };

  // Get withdrawal fee in local currency
  const getWithdrawalFeeLocal = (localAmountOverride?: number) => {
    return usdToLocal(getWithdrawalFeeUsd(localAmountOverride));
  };

  // Get payment method limits - min is $10 USD converted to local
  const getPaymentMethodLimits = () => {
    const minLocal = usdToLocal(MINIMUM_WITHDRAWAL_USD);
    const maxLimit = PAYMENT_MAX_LIMITS[selectedCountry]?.[paymentMethod];
    return {
      min: minLocal,
      max: maxLimit || Infinity
    };
  };

  const getAccountFieldLabel = () => {
    if (paymentMethod === 'crypto_auto') return 'USDT Wallet Address (TRC20)';
    if (paymentMethod === 'upi') return 'UPI ID';
    if (paymentMethod === 'alipay') return 'Alipay Email / Account';
    return 'Wallet Number / Account Number';
  };

  const getAccountFieldPlaceholder = () => {
    if (paymentMethod === 'crypto_auto') return 'Paste your USDT TRC20 wallet address';
    if (paymentMethod === 'upi') return 'Enter your UPI ID';
    if (paymentMethod === 'alipay') return 'Enter your Alipay email or account number';
    return 'Enter your wallet/account number';
  };

  const getNormalizedAccountName = () => accountName.trim().replace(/\s+/g, ' ');

  const getNormalizedAccountNumber = () => {
    const normalized = accountNumber.trim();
    return ['crypto_auto', 'upi', 'alipay'].includes(paymentMethod)
      ? normalized
      : normalized.replace(/\s+/g, '');
  };

  const getAccountNumberValidationMessage = () => {
    const normalizedAccountNumber = getNormalizedAccountNumber();

    if (paymentMethod === 'crypto_auto') {
      // Crypto wallet address: alphanumeric, 20-100 chars
      return /^[a-zA-Z0-9]{20,100}$/.test(normalizedAccountNumber)
        ? null
        : 'Enter a valid crypto wallet address (20-100 chars, no spaces)';
    }

    if (paymentMethod === 'upi') {
      return upiAccountSchema.safeParse(normalizedAccountNumber).success
        ? null
        : 'UPI account must be a valid UPI ID';
    }

    if (paymentMethod === 'alipay') {
      return alipayAccountSchema.safeParse(normalizedAccountNumber).success
        ? null
        : 'Alipay account must be a valid email or phone/account number';
    }

    return numericWalletSchema.safeParse(normalizedAccountNumber).success
      ? null
      : 'Enter a valid wallet/account number';
  };

  const getPaymentValidationError = () => {
    const normalizedAccountName = getNormalizedAccountName();
    const normalizedAccountNumber = getNormalizedAccountNumber();

    const nameValidation = accountNameSchema.safeParse(normalizedAccountName);
    if (!nameValidation.success) {
      return nameValidation.error.issues[0]?.message || 'Enter a valid account name';
    }

    if (!normalizedAccountNumber) {
      return `${getAccountFieldLabel()} is required`;
    }

    return getAccountNumberValidationMessage();
  };

  // Check if amount is within limits
  const isAmountWithinLimits = (localAmount: number) => {
    const limits = getPaymentMethodLimits();
    return localAmount >= limits.min && localAmount <= limits.max;
  };

  // Get minimum withdrawal in local currency
  const getMinWithdrawalLocal = () => {
    return usdToLocal(MINIMUM_WITHDRAWAL_USD);
  };

  // Force English numerals by replacing any non-ASCII digits
  const forceEnglishDigits = (str: string) => {
    // Bengali digits: ০১২৩৪৫৬৭৮৯ -> 0123456789
    const bengaliDigits = '০১২৩৪৫৬৭৮৯';
    const arabicIndicDigits = '٠١٢٣٤٥٦٧٨٩';
    const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
    
    let result = str;
    for (let i = 0; i < 10; i++) {
      result = result.replace(new RegExp(bengaliDigits[i], 'g'), String(i));
      result = result.replace(new RegExp(arabicIndicDigits[i], 'g'), String(i));
      result = result.replace(new RegExp(persianDigits[i], 'g'), String(i));
    }
    return result;
  };

  // Format local currency - always use 'en-US' for consistent English numerals
  const formatLocalCurrency = (amount: number) => {
    const formatted = amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${countryConfig.currencySymbol}${forceEnglishDigits(formatted)}`;
  };
  
  // Format number with English numerals
  const formatNumber = (num: number, decimals?: number) => {
    let formatted: string;
    if (decimals !== undefined) {
      formatted = num.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    } else {
      formatted = num.toLocaleString('en-US');
    }
    return forceEnglishDigits(formatted);
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Fetch countries that have active payroll helpers + their admin-configured payment methods
  useEffect(() => {
    const fetchHelperCountries = async () => {
      // 1) Countries that have an active verified Level-5 payroll helper
      const { data: helpers, error: hErr } = await supabase
        .from('topup_helpers')
        .select('id, country_code')
        .eq('is_verified', true)
        .eq('payroll_enabled', true)
        .eq('is_active', true);

      if (hErr || !helpers) return;

      const countries = [...new Set(helpers.map(h => h.country_code).filter(Boolean))] as string[];
      setCountriesWithHelpers(countries);

      const helperIds = helpers.map(h => h.id);
      if (helperIds.length === 0) {
        setHelperConfiguredMethods({});
        return;
      }

      // 2) Admin-configured local methods these helpers actually offer
      const { data: methods, error: mErr } = await supabase
        .from('helper_country_payment_methods')
        .select('country_code, payment_method_name, method_name, is_active, helper_id')
        .eq('is_active', true)
        .in('helper_id', helperIds);

      if (mErr || !methods) return;

      const map: Record<string, Set<string>> = {};
      for (const row of methods) {
        const cc = (row as any).country_code as string | null;
        const name = ((row as any).payment_method_name || (row as any).method_name || '')
          .toString().trim().toLowerCase();
        if (!cc || !name) continue;
        if (!map[cc]) map[cc] = new Set<string>();
        map[cc].add(name);
      }
      setHelperConfiguredMethods(map);
      console.log('[Withdrawal] Helper-configured local methods per country:', 
        Object.fromEntries(Object.entries(map).map(([k, v]) => [k, [...v]])));
    };
    fetchHelperCountries();
  }, []);

  // Check if selected country has local payroll helpers
  useEffect(() => {
    const hasHelpers = countriesWithHelpers.includes(selectedCountry);
    setHasLocalPayrollHelpers(hasHelpers);
    console.log('[Withdrawal] Country', selectedCountry, 'has helpers:', hasHelpers);
  }, [selectedCountry, countriesWithHelpers]);

  // Country payment method rules (Pkg190 — crypto worldwide):
  //   • Every country (incl. BD / IN / PK) can ALWAYS pick the MeriCash USDT auto crypto gateway.
  //   • If a Level-5 payroll helper exists in the country → user sees LOCAL methods + crypto auto.
  //   • If no Level-5 helper → crypto auto only (fallback so withdrawal isn't blocked).
  //   • Crypto carries a higher admin-configured auto withdrawal fee (flat USD + percent).
  // Each country only ever sees its own local methods — no cross-country leakage.
  const OFFICIAL_AUTO_METHODS = [
    { value: "crypto_auto", label: "💎 MeriCash (USDT Auto-Credit) — higher fee" },
  ];

  const getAvailablePaymentMethods = () => {
    if (!selectedCountry) return [];

    // STRICT: source local methods from THIS country only — never from the BD display-fallback.
    const strictCountryCfg = COUNTRY_CONFIGS[selectedCountry];
    let localMethods = (strictCountryCfg?.paymentMethods ?? []).filter(
      m => m.value !== 'epay' && m.value !== 'crypto_auto' && m.value !== 'binance'
    );

    // Admin-driven gate: if any active L5 helper in this country has configured methods,
    // only those methods are offered. Empty/missing → fall back to all country local methods.
    const configured = helperConfiguredMethods[selectedCountry];
    if (configured && configured.size > 0) {
      localMethods = localMethods.filter(m => configured.has(m.value.toLowerCase()));
    }

    if (hasLocalPayrollHelpers === null) {
      // Helper-availability still loading: still expose crypto auto so user always has a path.
      return localMethods.length > 0 ? [...localMethods, ...OFFICIAL_AUTO_METHODS] : [...OFFICIAL_AUTO_METHODS];
    }

    if (hasLocalPayrollHelpers) {
      // Has Level-5 helper: offer LOCAL + CRYPTO AUTO worldwide (BD/IN/PK included).
      if (localMethods.length === 0) return [...OFFICIAL_AUTO_METHODS];
      return [...localMethods, ...OFFICIAL_AUTO_METHODS];
    }

    // No Level-5 helper in this country → crypto auto only (every country, incl. BD/IN/PK)
    return [...OFFICIAL_AUTO_METHODS];
  };

  // Update payment method when country or helper availability changes
  useEffect(() => {
    if (!selectedCountry && !countryConfig) return;
    const availableMethods = getAvailablePaymentMethods();
    if (availableMethods.length > 0) {
      const currentMethodAvailable = availableMethods.some(m => m.value === paymentMethod);
      if (!currentMethodAvailable || !paymentMethod) {
        setPaymentMethod(availableMethods[0].value);
      }
    }
  }, [selectedCountry, hasLocalPayrollHelpers, helperConfiguredMethods]);

  const fetchData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/auth');
        return;
      }

      // Fetch user profile — use registration_country_code (immutable, locked at signup)
      const { data: profileData } = await supabase
        .from('profiles')
        .select('country_code, country_name, registration_country_code')
        .eq('id', user.id)
        .maybeSingle();

      if (profileData) {
        setProfile(profileData);
        // Priority: registration_country_code (permanently locked) > country_code
        const lockedCountry = (profileData as any).registration_country_code || profileData.country_code;
        if (lockedCountry && COUNTRY_CONFIGS[lockedCountry]) {
          setSelectedCountry(lockedCountry);
        }
      }

      // Pkg D pass-2: fetch all 4 app_settings keys in parallel through the
      // shared cache (was 4 sequential roundtrips, ~600ms on slow links).
      const [beansRateValue, commissionFallbackValue, wsValue, awfValue, agencyWdFeeValue] = await Promise.all([
        getAppSetting<unknown>('beans_to_usd_rate'),
        getAppSetting<unknown>('agency_commission'),
        getAppSetting<unknown>('withdrawal_settings'),
        getAppSetting<unknown>('auto_withdrawal_fee'),
        getAppSetting<unknown>('agency_withdrawal_fee'),
      ]);

      // Beans→USD rate (primary)
      if (beansRateValue) {
        const rateValue = typeof beansRateValue === 'string'
          ? JSON.parse(beansRateValue)
          : (beansRateValue as { rate?: number });
        if (rateValue?.rate) {
          setCoinsToUsdRate(rateValue.rate);
        }
      } else if (commissionFallbackValue) {
        // Fallback to agency_commission setting
        const commissionSettings = typeof commissionFallbackValue === 'string'
          ? JSON.parse(commissionFallbackValue)
          : (commissionFallbackValue as CommissionSettings);
        if (commissionSettings?.coins_to_dollar_rate) {
          setCoinsToUsdRate(commissionSettings.coins_to_dollar_rate);
        }
      }

      // Pkg D pass-3: shared cache (deduped with AgencyDashboard / Level5Helper /
      // any other tab reading currency_rates this session). Admin edits
      // invalidate via `admin-table-update` broadcast.
      try {
        const dbRates = await getCurrencyRateMap();
        if (Object.keys(dbRates).length > 0) {
          setExchangeRates({ ...DEFAULT_EXCHANGE_RATES, ...dbRates });
        }
      } catch (err) {
        console.warn('[AgencyWithdrawal] currency_rates cache fetch failed:', err);
      }


      // Tiered withdrawal fees
      if (wsValue) {
        const ws: any = typeof wsValue === 'string' ? JSON.parse(wsValue) : wsValue;
        if (ws.fees && Array.isArray(ws.fees)) {
          setWithdrawalFees(ws.fees);
          console.log('[AgencyWithdrawal] Tiered fees from DB:', ws.fees);
        }
        if (ws.free_withdrawal_limit) setFreeWithdrawalLimit(ws.free_withdrawal_limit);
        if (ws.min_withdrawal) setMinWithdrawalBeans(ws.min_withdrawal);
        if (ws.coins_to_dollar_rate) setCoinsToUsdRate(ws.coins_to_dollar_rate);
      }

      // Auto withdrawal fee (flat USD for ePay/USDT/Binance/Crypto)
      if (awfValue) {
        const awf: any = typeof awfValue === 'string' ? JSON.parse(awfValue) : awfValue;
        setAutoWithdrawalFee({
            ? awf.methods.map((m: string) => m.toLowerCase()).filter((m: string) => m !== 'epay')
            : ['usdt', 'crypto_auto'],
        });
        console.log('[AgencyWithdrawal] Auto withdrawal fee from DB:', awf);
      }

      // Local (payroll-helper / bKash / Nagad / UPI) single % fee — admin-controlled.
      if (agencyWdFeeValue) {
        const af: any = typeof agencyWdFeeValue === 'string' ? JSON.parse(agencyWdFeeValue) : agencyWdFeeValue;
        const rate = typeof af?.rate === 'number' ? af.rate : Number(af?.rate);
        if (Number.isFinite(rate)) {
          setLocalWithdrawalFeePercent(rate);
          console.log('[AgencyWithdrawal] Local withdrawal fee % from DB:', rate);
        }
      }


      // Fetch agency with beans_balance
      const { data: agencyData, error: agencyError } = await supabase
        .from('agencies')
        .select('id, name, wallet_balance, beans_balance')
        .eq('owner_id', user.id)
        .maybeSingle();

      if (agencyError || !agencyData) {
        toast.error('You do not have an agency');
        navigate('/agency-dashboard');
        return;
      }

      // Match Agency Dashboard exactly: Total Beans uses agency.wallet_balance
      const effectiveBalance = Math.max(agencyData.wallet_balance || 0, 0);

      console.log('[AgencyWithdrawal] Effective balance (Agency Dashboard Total Beans source = wallet_balance):', effectiveBalance);

      setAgency({
        ...agencyData,
        wallet_balance: effectiveBalance,
      });

      // Fetch withdrawal history
      const { data: withdrawalData } = await supabase
        .from('agency_withdrawals')
        .select('*')
        .eq('agency_id', agencyData.id)
        .order('requested_at', { ascending: false })
        .limit(20);

      const formattedWithdrawals = (withdrawalData || []).map(w => ({
        ...w,
        payment_details: w.payment_details as Withdrawal['payment_details']
      }));

      setWithdrawals(formattedWithdrawals);

    } catch (error) {
      console.error('Error fetching data:', error);
      recordClientError({ label: "AgencyWithdrawal.formattedWithdrawals", message: error instanceof Error ? error.message : String(error) });
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitWithdrawal = async () => {
    if (!agency) return;

    const localAmount = parseFloat(amount);

    if (isNaN(localAmount) || localAmount <= 0) {
      toast.error('Enter a valid amount');
      return;
    }

    const limits = getPaymentMethodLimits();

    if (limits.max !== Infinity && localAmount > limits.max) {
      toast.error(`Maximum withdrawal for ${paymentMethod.toUpperCase()} is ${countryConfig.currencySymbol}${formatNumber(limits.max)}`);
      return;
    }

    if (localAmount < limits.min) {
      toast.error(`Minimum withdrawal for ${paymentMethod.toUpperCase()} is ${countryConfig.currencySymbol}${formatNumber(limits.min)}`);
      return;
    }

    const withdrawAmountBeans = localToBeans(localAmount);
    const usdAmount = localToUsd(localAmount);
    const totalDeduction = withdrawAmountBeans;
    const totalBeansBalance = agency.wallet_balance || 0;

    if (totalDeduction > totalBeansBalance) {
      toast.error(`Insufficient balance. You need ${formatNumber(Math.round(totalDeduction))} beans. You have ${formatNumber(Math.round(totalBeansBalance))} beans.`);
      return;
    }

    const paymentValidationError = getPaymentValidationError();
    if (paymentValidationError) {
      toast.error(paymentValidationError);
      return;
    }

    const normalizedAccountName = getNormalizedAccountName();
    const normalizedAccountNumber = getNormalizedAccountNumber();

    setSubmitting(true);
    try {
      const rate = exchangeRates[countryConfig.currency] || 1;
      const withdrawalFeeUsd = getWithdrawalFeeUsd();
      const withdrawalFeeBeans = getWithdrawalFeeBeans();
      const withdrawalFeeLocal = getWithdrawalFeeLocal();

      const netWithdrawalBeans = withdrawAmountBeans - withdrawalFeeBeans;
      const netWithdrawalUsd = localToUsd(localAmount - withdrawalFeeLocal);
      const netWithdrawalLocal = localAmount - withdrawalFeeLocal;

      const paymentDetails = {
        country_code: selectedCountry,
        currency_code: countryConfig.currency,
        local_amount: localAmount,
        exchange_rate: rate,
        usd_amount: usdAmount,
        account_name: normalizedAccountName,
        account_number: normalizedAccountNumber,
        bank_name: bankName.trim(),
        additional_info: additionalInfo.trim(),
        withdrawal_fee_usd: withdrawalFeeUsd,
        withdrawal_fee_beans: Math.round(withdrawalFeeBeans),
        withdrawal_fee_local: withdrawalFeeLocal,
        fee_recipient: 'admin',
        net_withdrawal_beans: Math.round(netWithdrawalBeans),
        net_withdrawal_usd: netWithdrawalUsd,
        net_withdrawal_local: netWithdrawalLocal,
        payment_method_max_limit: limits.max === Infinity ? null : limits.max,
        payment_method_min_limit: limits.min
      };

      console.log('[Withdrawal] Calling RPC with params:', {
        p_agency_id: agency.id,
        p_amount: Math.round(withdrawAmountBeans),
        p_payment_method: paymentMethod,
        p_payment_details: paymentDetails
      });

      const { data, error } = await supabase.rpc('request_agency_withdrawal', {
        p_notes: null,
      });

      console.log('[Withdrawal] RPC response:', { data, error });

      if (error) {
        console.error('[Withdrawal] RPC error:', error);
        recordClientError({ label: "AgencyWithdrawal.paymentDetails", message: error instanceof Error ? error.message : String(error) });
        throw error;
      }

      const result = data as { success: boolean; error?: string };
      
      if (!result.success) {
        console.error('[Withdrawal] Failed:', result.error);
        recordClientError({ label: "AgencyWithdrawal.result", message: String(result.error ?? "unknown") });
        toast.error(result.error || 'Withdrawal request failed');
        return;
      }

       // Helper notifications are now sent automatically by a database trigger
       // when the agency_withdrawals row is created.
       if (isAutoMethod(paymentMethod)) {
         console.log('[Withdrawal] Auto method - initiating MeriCash payout');
         const withdrawalId = (data as any)?.withdrawal_id;
         // Withdrawals are USDT-only (TRC20 — lowest fee, fastest)
         const payCurrency = 'usdttrc20';
         const payNetwork = 'TRC20';
         if (withdrawalId) {
           const { error: payoutErr, data: payoutData } = await supabase.functions.invoke('swift-pay-create-payout', {
             body: {
               withdrawal_id: withdrawalId,
               pay_currency: payCurrency,
               pay_network: payNetwork,
               pay_address: accountNumber.trim(),
             },
           });
           if (payoutErr || payoutData?.error) {
             console.error('[Withdrawal] Auto payout failed:', payoutErr || payoutData?.error);
             toast.error('Withdrawal recorded but auto-payout failed. Admin will process manually.');
           } else {
             toast.success('✅ Auto-payout initiated! Funds will arrive shortly.');
           }
         }
       } else {
         console.log('[Withdrawal] Helper notifications will be sent automatically to same-country active Level 5 payroll helpers');
       }

       // Send confirmation notification to the agency owner
       try {
         const { data: { user } } = await supabase.auth.getUser();
         if (user) {
           await supabase.from('notifications').insert({
             user_id: user.id,
             type: 'withdrawal',
             title: '⏳ Withdrawal Request Submitted',
             message: `Your $${usdAmount.toFixed(2)} withdrawal request has been submitted and is being processed.`,
             data: {
               agency_id: agency.id,
               agency_name: agency.name,
               amount_usd: usdAmount,
               payment_method: paymentMethod,
               status: 'pending'
             },
             is_read: false
           });
         }
       } catch (ownerNotifError) {
         console.error('Failed to send owner notification:', ownerNotifError);
         recordClientError({ label: "AgencyWithdrawal.result", message: ownerNotifError instanceof Error ? ownerNotifError.message : String(ownerNotifError) });
       }

       toast.success('Withdrawal request submitted successfully!');
       setShowConfirmDialog(false);

       // Reset form
       setAmount("");
       setAccountName("");
       setAccountNumber("");
       setBankName("");
       setAdditionalInfo("");
      
      // Refresh data
      fetchData();

    } catch (error) {
      console.error('Withdrawal error:', error);
      recordClientError({ label: "AgencyWithdrawal.result", message: error instanceof Error ? error.message : String(error) });
      toast.error('Withdrawal request failed');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge className="bg-warning-500 text-slate-800 border-0 shadow-sm px-3 py-1 font-medium"><Clock className="w-3 h-3 mr-1.5" /> Pending</Badge>;
      case 'processing':
        return <Badge className="bg-info-500 text-slate-800 border-0 shadow-sm px-3 py-1 font-medium"><Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> Processing</Badge>;
      case 'approved':
        return <Badge className="bg-success-500 text-slate-800 border-0 shadow-sm px-3 py-1 font-medium"><CheckCircle className="w-3 h-3 mr-1.5" /> Completed</Badge>;
      case 'completed':
        return <Badge className="bg-success-500 text-slate-800 border-0 shadow-sm px-3 py-1 font-medium"><CheckCircle className="w-3 h-3 mr-1.5" /> Completed</Badge>;
      case 'rejected':
        return <Badge className="bg-danger-500 text-slate-800 border-0 shadow-sm px-3 py-1 font-medium"><XCircle className="w-3 h-3 mr-1.5" /> Rejected</Badge>;
      default:
        return <Badge className="bg-gray-500 text-slate-800 border-0 shadow-sm px-3 py-1 font-medium">{status}</Badge>;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const hasPendingWithdrawal = withdrawals.some(w => w.status === 'pending');

  if (loading) {
    return <PageSkeleton className="bg-gradient-to-br from-brand-50 via-background to-info-50" rows={5} hero />;
  }

  // Amount is now in local currency
  const localAmount = parseFloat(amount || '0');
  const usdValue = localToUsd(localAmount);
  const beansValue = localToBeans(localAmount);

  return (
    <div className="fixed inset-0 flex flex-col bg-gradient-to-b from-[#FFFBF2] via-[#FAF5EA] to-[#F5EFDF]">
      {/* Premium 3D Header */}
      <header
        className="flex-shrink-0 sticky top-0 z-40 bg-white/90 backdrop-blur-xl safe-area-top"
        style={{ boxShadow: '0 6px 18px -10px rgba(217,119,6,0.32), inset 0 -1px 0 rgba(217,182,107,0.4)' }}
      >
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            onClick={() => navigate(-1)}
            className="h-9 w-9 rounded-full bg-white flex items-center justify-center transition-all hover:-translate-y-0.5 active:translate-y-0"
            style={{ boxShadow: '0 4px 12px -4px rgba(146,64,14,0.25), inset 0 1px 0 rgba(255,255,255,0.95), 0 0 0 1px rgba(217,182,107,0.45)' }}
          >
            <ArrowLeft className="w-5 h-5 text-slate-700" />
          </button>
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div
              className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shrink-0"
              style={{ boxShadow: '0 10px 20px -8px rgba(16,185,129,0.55), inset 0 1px 0 rgba(255,255,255,0.4), inset 0 -2px 0 rgba(6,78,59,0.25)' }}
            >
              <ArrowDownCircle className="w-5 h-5 text-white" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.25))' }} />
            </div>
            <div className="min-w-0">
              <h1 className="text-slate-900 font-bold text-base leading-tight tracking-tight truncate">Agency Withdrawal</h1>
              <p className="text-slate-500 text-[10px] truncate">{agency?.name}</p>
            </div>
          </div>
          <div
            className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shrink-0"
            style={{ boxShadow: '0 6px 14px -6px rgba(245,158,11,0.55), inset 0 1px 0 rgba(255,255,255,0.45)' }}
          >
            <Sparkles className="w-4 h-4 text-white" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.25))' }} />
          </div>
        </div>
      </header>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch', paddingBottom: 'var(--content-bottom-padding)' }}>
        <main className="px-4 py-4 space-y-6">
        {/* Balance Card */}
        <Card className="bg-gradient-to-br from-emerald-600 via-emerald-600 to-teal-700 text-white border-0 shadow-xl overflow-hidden relative">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
          <CardContent className="p-6 relative z-10">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-14 h-14 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center shadow-inner border border-white/15">
                <Wallet className="w-7 h-7 text-white" />
              </div>
              <div className="flex-1">
                <p className="text-white/80 text-sm font-medium">Total Beans</p>
                <p className="text-4xl font-bold tracking-tight text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.25)]">
                  {formatNumber(agency?.wallet_balance || 0)}
                </p>
                <p className="text-white/70 text-xs mt-0.5">Withdrawable balance</p>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white/15 backdrop-blur-sm rounded-xl px-4 py-3 border border-white/20">
                <div className="flex items-center gap-2 mb-1">
                  <DollarSign className="w-4 h-4 text-amber-200" />
                  <p className="text-white/75 text-xs font-medium">USD Value</p>
                </div>
                <p className="text-xl font-bold text-white">
                  ${beansToUsd(agency?.wallet_balance || 0).toFixed(2)}
                </p>
              </div>
              <div className="bg-white/15 backdrop-blur-sm rounded-xl px-4 py-3 border border-white/20">
                <div className="flex items-center gap-2 mb-1">
                  <Globe className="w-4 h-4 text-sky-200" />
                  <p className="text-white/75 text-xs font-medium">{countryConfig.currency} Value</p>
                </div>
                <p className="text-xl font-bold text-white">
                  {formatLocalCurrency(beansToLocal(agency?.wallet_balance || 0))}
                </p>
              </div>
            </div>
            
            <div className="mt-4 py-3 bg-black/15 backdrop-blur-sm rounded-lg space-y-2 border border-white/10">
              <div className="flex items-center justify-center gap-2">
                <TrendingUp className="w-4 h-4 text-white/80" />
                <p className="text-white/85 text-xs font-semibold tracking-wide">
                  Exchange Rates (Set by Admin)
                </p>
              </div>
              <div className="flex items-center justify-center gap-4">
                <div className="text-center px-3">
                  <p className="text-amber-200 font-bold">{formatNumber(coinsToUsdRate)}</p>
                  <p className="text-white/70 text-xs">Beans = $1 USD</p>
                </div>
                <div className="h-8 w-px bg-white/25" />
                <div className="text-center px-3">
                  <p className="text-sky-200 font-bold">{countryConfig.currencySymbol}{formatNumber(exchangeRates[countryConfig.currency] || 1)}</p>
                  <p className="text-white/70 text-xs">= $1 USD</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Withdrawal Form */}
        <Card className="shadow-lg border-0 bg-white">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-gray-900">
              <div className="w-8 h-8 bg-brand-100 rounded-lg flex items-center justify-center">
                <Download className="w-4 h-4 text-brand-600" />
              </div>
              New Withdrawal Request
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Allow multiple orders - no warning message, just show pending orders in history below */}
                {/* Country UI hidden — country is auto-detected from registration_country_code (VPN-proof).
                    Payment methods below are auto-filtered: local methods if helpers exist in your country,
                    otherwise official global methods (ePay / USDT / custom crypto gateway). */}


                <div className="space-y-2">
                  <Label className="text-gray-800 font-semibold">Payment Method</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger className="h-12 bg-white border-2 border-gray-200 hover:border-brand-400 focus:border-brand-500 focus:ring-brand-500/20 text-gray-900 font-medium">
                      <SelectValue placeholder="Select payment method" className="text-gray-900" />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-2 border-gray-200 shadow-xl">
                      {getAvailablePaymentMethods().map((method) => {
                        const maxLimit = PAYMENT_MAX_LIMITS[selectedCountry]?.[method.value];
                        return (
                          <SelectItem 
                            key={method.value} 
                            value={method.value}
                            className="text-gray-900 font-medium hover:bg-brand-50 focus:bg-brand-50 cursor-pointer py-3"
                          >
                            <div className="flex items-center justify-between w-full">
                              <span>{method.label}</span>
                              {maxLimit && (
                                <span className="text-xs text-slate-500 ml-2">
                                  (Max: {countryConfig.currencySymbol}{formatNumber(maxLimit)})
                                </span>
                              )}
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  {/* Show info based on payment method */}
                  {isAutoMethod(paymentMethod) ? (
                    <div className="bg-info-50 rounded-lg p-3 border border-info-200">
                      <div className="flex items-center gap-2 text-info-700 text-sm">
                        <Globe className="w-4 h-4" />
                        <span>
                          <strong>MeriCash (USDT Auto-Credit):</strong>{' '}
                          Funds are credited automatically to your wallet via our payment gateway. Fee:{' '}
                          <strong>
                            ${autoWithdrawalFee.flat_usd}
                            {autoWithdrawalFee.percent > 0 && <> + {autoWithdrawalFee.percent}%</>}
                          </strong>.
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-info-50 rounded-lg p-3 border border-info-100">
                      <div className="flex items-center gap-2 text-info-700 text-sm">
                        <AlertCircle className="w-4 h-4" />
                        <span>
                          Minimum withdrawal: <strong>${MINIMUM_WITHDRAWAL_USD}</strong> = <strong>{countryConfig.currencySymbol}{formatNumber(Math.ceil(getMinWithdrawalLocal()))}</strong>
                          {paymentMethod && PAYMENT_MAX_LIMITS[selectedCountry]?.[paymentMethod] && (
                            <> | Max: <strong>{countryConfig.currencySymbol}{formatNumber(PAYMENT_MAX_LIMITS[selectedCountry][paymentMethod])}</strong></>
                          )}
                        </span>
                      </div>
                    </div>
                  )}
                  {/* Notice when no local helpers — official auto-credit only */}
                  {!hasLocalPayrollHelpers && hasLocalPayrollHelpers !== null && (
                    <div className="bg-warning-50 rounded-lg p-3 border border-warning-200">
                      <div className="flex items-center gap-2 text-warning-700 text-sm">
                        <AlertCircle className="w-4 h-4" />
                        <span>
                          No local Level-5 payment helpers in your country. Using our official <strong>MeriCash USDT auto-credit</strong> gateway.
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="text-gray-800 font-semibold">Amount ({countryConfig.currency})</Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      placeholder={`Enter amount in ${countryConfig.currency}`}
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="flex-1 h-12 bg-white border-2 border-gray-200 hover:border-brand-400 focus:border-brand-500 focus:ring-brand-500/20 text-gray-900 font-medium placeholder:text-slate-500"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        const totalBeansLocal = beansToLocal(agency?.wallet_balance || 0);
                        const maxLimit = PAYMENT_MAX_LIMITS[selectedCountry]?.[paymentMethod] || 25000;
                        const fillAmount = Math.min(totalBeansLocal, maxLimit);
                        setAmount(Math.floor(fillAmount).toString());
                      }}
                      className="h-12 px-4 bg-brand-100 border-2 border-brand-300 text-brand-700 font-bold hover:bg-brand-200 hover:border-brand-400"
                    >
                      All
                    </Button>
                  </div>
                  <div className="flex flex-col gap-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-gray-500">
                        Total Beans: {formatLocalCurrency(beansToLocal(agency?.wallet_balance || 0))}
                      </span>
                      {amount && (
                        <span className="text-success-600 font-semibold bg-success-50 px-2 py-0.5 rounded-full">
                          = ${localToUsd(parseFloat(amount || '0')).toFixed(2)} USD
                        </span>
                      )}
                    </div>
                    {/* Show warning if amount exceeds limit */}
                    {amount && (
                      (() => {
                        const localAmt = parseFloat(amount);
                        const minLocal = getMinWithdrawalLocal();
                        const maxLimit = PAYMENT_MAX_LIMITS[selectedCountry]?.[paymentMethod];
                        
                        if (maxLimit && localAmt > maxLimit) {
                          return (
                            <span className="text-danger-500 font-medium">
                              ⚠️ Exceeds max limit of {countryConfig.currencySymbol}{formatNumber(maxLimit)}
                            </span>
                          );
                        }
                        if (localAmt < minLocal) {
                          return (
                            <span className="text-warning-500 font-medium">
                              ⚠️ Minimum withdrawal is ${MINIMUM_WITHDRAWAL_USD} ({countryConfig.currencySymbol}{formatNumber(Math.ceil(minLocal))})
                            </span>
                          );
                        }
                        return null;
                      })()
                    )}
                  </div>
                </div>

                {/* Withdrawal Fee Info */}
                <div className="bg-gradient-to-r from-warning-50 to-warning-50 rounded-xl p-4 border border-warning-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-warning-800 font-semibold flex items-center gap-2">
                      <DollarSign className="w-4 h-4" />
                      Withdrawal Fee (Deducted)
                    </span>
                    <span className="text-danger-600 font-bold">
                      -${getWithdrawalFeeUsd().toFixed(2)} USD
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="bg-white rounded-lg px-3 py-2">
                      <span className="text-gray-600">Fee in Beans:</span>
                      <span className="font-semibold text-danger-600 ml-1">-{formatNumber(Math.round(getWithdrawalFeeBeans()))}</span>
                    </div>
                    <div className="bg-white rounded-lg px-3 py-2">
                      <span className="text-gray-600">Fee in {countryConfig.currency}:</span>
                      <span className="font-semibold text-danger-600 ml-1">-{formatLocalCurrency(getWithdrawalFeeLocal())}</span>
                    </div>
                  </div>

                  {/* Show fee tiers — sourced from admin panel (withdrawal_settings / auto_withdrawal_fee).
                      Single-source-of-truth: NEVER show hardcoded tiers. */}
                  {isAutoMethod(paymentMethod) ? (
                    <div className="mt-2 text-xs text-gray-700 bg-white rounded-lg p-2">
                      <p className="font-medium mb-1">MeriCash / USDT Auto-Credit Fee:</p>
                      <div className="text-gray-800">
                        {autoWithdrawalFee.flat_usd > 0 && (
                          <span>${autoWithdrawalFee.flat_usd.toFixed(2)} flat</span>
                        )}
                        {autoWithdrawalFee.flat_usd > 0 && autoWithdrawalFee.percent > 0 && <span> + </span>}
                        {autoWithdrawalFee.percent > 0 && (
                          <span className="font-bold">{autoWithdrawalFee.percent}% of withdrawal</span>
                        )}
                      </div>
                    </div>
                  ) : localWithdrawalFeePercent !== null ? (
                    <div className="mt-2 text-xs text-gray-700 bg-white rounded-lg p-2">
                      <p className="font-medium mb-1">Local Payment Withdrawal Fee (set by admin):</p>
                      <div className="text-gray-800">
                        <span className="font-bold">{localWithdrawalFeePercent}%</span> of withdrawal amount
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 text-xs text-gray-600 bg-white rounded-lg p-2">
                      Fee not configured by admin.
                    </div>
                  )}

                  
                  {/* Net Payout Calculation */}
                  {amount && parseFloat(amount) > 0 && (
                    <div className="mt-3 pt-3 border-t border-warning-200 space-y-2">
                      {/* Withdrawal Amount */}
                      <div className="flex justify-between text-sm text-gray-700">
                        <span>Withdrawal Amount:</span>
                        <span className="font-medium">{formatLocalCurrency(localAmount)}</span>
                      </div>
                      {/* Fee Deduction */}
                      <div className="flex justify-between text-sm text-danger-600">
                        <span>Fee Deduction:</span>
                        <span className="font-medium">-{formatLocalCurrency(getWithdrawalFeeLocal())}</span>
                      </div>
                      {/* Net Payout */}
                      <div className="flex justify-between text-base bg-success-100 rounded-lg p-2 -mx-1">
                        <span className="font-bold text-success-800">You Will Receive:</span>
                        <span className="font-bold text-success-700">
                          {formatLocalCurrency(Math.max(0, localAmount - getWithdrawalFeeLocal()))}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 text-center">
                        ≈ ${Math.max(0, localToUsd(localAmount) - getWithdrawalFeeUsd()).toFixed(2)} USD
                      </p>
                    </div>
                  )}
                </div>

                {/* Fee notice */}
                <div className="bg-info-50 rounded-lg p-3 border border-info-200 text-sm text-info-800">
                  <p className="flex items-center gap-2 font-medium">
                    <AlertCircle className="w-4 h-4" />
                    Fee is automatically deducted from your withdrawal amount
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="text-gray-800 font-semibold">Account Name</Label>
                  <Input
                    placeholder="Account holder's exact name"
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                    className="h-12 bg-white border-2 border-gray-200 hover:border-brand-400 focus:border-brand-500 focus:ring-brand-500/20 text-gray-900 font-medium placeholder:text-slate-500"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-gray-800 font-semibold">{getAccountFieldLabel()}</Label>
                  <Input
                    type="text"
                    inputMode={['bkash', 'nagad', 'easypaisa', 'esewa', 'frimi', 'gcash', 'gopay', 'momo', 'promptpay', 'grabpay', 'paynow', 'paypay', 'kakaopay', 'payme', 'linepay', 'wavepay', 'wing', 'bcel', 'progresifpay', 'qpay', 'kaspi', 'mpay', 'tbcpay', 'alipay'].includes(paymentMethod) ? 'numeric' : 'text'}
                    placeholder={getAccountFieldPlaceholder()}
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                    className="h-12 bg-white border-2 border-gray-200 hover:border-brand-400 focus:border-brand-500 focus:ring-brand-500/20 text-gray-900 font-medium placeholder:text-slate-500"
                  />
                  <p className="text-xs text-gray-500">
                    {paymentMethod === 'crypto_auto'
                      ? 'Paste your USDT TRC20 wallet address. Funds are auto-credited on-chain in seconds.'
                      : paymentMethod === 'upi'
                        ? 'Must be your exact UPI ID.'
                        : paymentMethod === 'alipay'
                          ? 'Use your Alipay email or numeric account.'
                          : `Use your exact ${countryConfig.paymentMethods.find(m => m.value === paymentMethod)?.label || 'wallet'} number.`}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="text-gray-800 font-semibold">Additional Information (Optional)</Label>
                  <Textarea
                    placeholder="Branch, routing number, IFSC code, etc."
                    value={additionalInfo}
                    onChange={(e) => setAdditionalInfo(e.target.value)}
                    rows={2}
                    className="bg-white border-2 border-gray-200 hover:border-brand-400 focus:border-brand-500 focus:ring-brand-500/20 text-gray-900 placeholder:text-slate-500"
                  />
                </div>

                <Button
                  className="w-full h-12 bg-gradient-to-r from-brand-600 to-info-600 hover:from-brand-700 hover:to-info-700 text-white font-semibold shadow-lg shadow-brand-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={() => {
                    const paymentValidationError = getPaymentValidationError();
                    if (paymentValidationError) {
                      toast.error(paymentValidationError);
                      return;
                    }
                    setShowConfirmDialog(true);
                  }}
                  disabled={
                    !amount ||
                    parseFloat(amount) <= 0 ||
                    !accountName.trim() ||
                    !accountNumber.trim() ||
                    parseFloat(amount) < getMinWithdrawalLocal() ||
                    (paymentMethod && PAYMENT_MAX_LIMITS[selectedCountry]?.[paymentMethod] &&
                      parseFloat(amount) > PAYMENT_MAX_LIMITS[selectedCountry][paymentMethod]
                    ) ||
                    beansValue > (agency?.wallet_balance || 0)
                  }
                >
                  <Download className="w-4 h-4 mr-2" />
                  Submit Withdrawal Request
                </Button>
          </CardContent>
        </Card>

        {/* Withdrawal History */}
        <Card className="shadow-xl border-0 bg-gradient-to-br from-warning-50 via-white to-warning-50 overflow-hidden">
          <CardHeader className="pb-3 border-b border-warning-200/60">
            <CardTitle className="text-base flex items-center gap-3 text-slate-800">
              <div className="w-10 h-10 bg-gradient-to-br from-info-500 to-brand-600 rounded-xl flex items-center justify-center shadow-lg">
                <Clock className="w-5 h-5 text-slate-800" />
              </div>
              <div>
                <p className="font-bold">Withdrawal History</p>
                <p className="text-xs text-slate-500 font-normal">{withdrawals.length} total requests</p>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {withdrawals.length === 0 ? (
              <div className="text-center py-16 px-4">
                <div className="w-20 h-20 bg-slate-100/50 rounded-full mx-auto mb-4 flex items-center justify-center">
                  <Clock className="w-10 h-10 text-slate-500" />
                </div>
                <p className="font-semibold text-slate-500">No withdrawals yet</p>
                <p className="text-sm text-slate-500 mt-1">Your withdrawal history will appear here</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-700/50">
                {withdrawals.map((withdrawal, index) => {
                  const wCurrency = withdrawal.payment_details?.currency_code || 'BDT';
                  const wConfig = Object.values(COUNTRY_CONFIGS).find(c => c.currency === wCurrency) || countryConfig;
                  const localAmt = withdrawal.payment_details?.local_amount || beansToLocal(withdrawal.amount);
                  
                  // For agency view: if helper has processed payment (helper_processed_at exists), 
                  // show as "approved" even if actual status is "processing"
                  const displayStatus = ((withdrawal.status === 'processing' && withdrawal.helper_processed_at) || withdrawal.status === 'approved')
                    ? 'completed'
                    : withdrawal.status;
                  
                  const statusConfig = {
                    completed: { bg: 'from-success-500/20 to-success-500/20', iconBg: 'bg-success-500', text: 'text-success-600', border: 'border-success-500/30' },
                    pending: { bg: 'from-warning-500/20 to-warning-500/20', iconBg: 'bg-warning-500', text: 'text-warning-600', border: 'border-warning-500/30' },
                    processing: { bg: 'from-info-500/20 to-info-500/20', iconBg: 'bg-info-500', text: 'text-info-600', border: 'border-info-500/30' },
                    rejected: { bg: 'from-danger-500/20 to-brand-500/20', iconBg: 'bg-danger-500', text: 'text-danger-600', border: 'border-danger-500/30' },
                    approved: { bg: 'from-success-500/20 to-success-500/20', iconBg: 'bg-success-500', text: 'text-success-600', border: 'border-success-500/30' }
                  };
                  const config = statusConfig[displayStatus as keyof typeof statusConfig] || statusConfig.pending;
                  
                  const countryFlag = withdrawal.payment_details?.country_code === 'BD' ? '🇧🇩' :
                    withdrawal.payment_details?.country_code === 'IN' ? '🇮🇳' :
                    withdrawal.payment_details?.country_code === 'PK' ? '🇵🇰' :
                    withdrawal.payment_details?.country_code === 'NP' ? '🇳🇵' : '🌍';
                  
                  return (
                    <button 
                      key={withdrawal.id}
                      onClick={() => {
                        setSelectedWithdrawal(withdrawal);
                        setShowDetailDialog(true);
                      }}
                      className={`w-full p-4 text-left hover:bg-slate-100/30 transition-all duration-200 active:scale-[0.99]`}
                    >
                      <div className="flex items-center gap-3">
                        {/* Status Icon */}
                        <div className={`w-12 h-12 rounded-xl ${config.iconBg} flex items-center justify-center shadow-lg shrink-0`}>
                          {displayStatus === 'pending' && <Clock className="w-6 h-6 text-slate-800" />}
                          {displayStatus === 'processing' && <Loader2 className="w-6 h-6 text-slate-800 animate-spin" />}
                          {displayStatus === 'completed' && <CheckCircle className="w-6 h-6 text-slate-800" />}
                          {displayStatus === 'approved' && <CheckCircle className="w-6 h-6 text-slate-800" />}
                          {displayStatus === 'rejected' && <XCircle className="w-6 h-6 text-slate-800" />}
                        </div>
                        
                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-lg">{countryFlag}</span>
                            <span className="text-slate-800 font-bold text-lg">{formatNumber(withdrawal.amount)}</span>
                            <span className="text-slate-500 text-sm">Beans</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <span className="bg-gradient-to-r from-brand-500/30 to-brand-500/30 text-brand-700 px-2 py-0.5 rounded-md text-xs font-medium border border-brand-500/30">
                              {withdrawal.payment_method?.toUpperCase()}
                            </span>
                            <span className="text-slate-500">•</span>
                            <span className="text-slate-500 text-xs">
                              {new Date(withdrawal.requested_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                          </div>
                        </div>
                        
                        {/* Amount & Status */}
                        <div className="text-right shrink-0">
                          <p className={`font-bold ${config.text}`}>
                            {wConfig.currencySymbol}{localAmt.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                          </p>
                          <p className={`text-xs font-medium ${config.text} capitalize`}>
                            {displayStatus}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Confirm Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="mx-4 rounded-2xl bg-gradient-to-br from-warning-50 via-white to-warning-50 border-white/20">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-800">
              <CheckCircle className="w-5 h-5 text-brand-600" />
              Confirm Withdrawal
            </DialogTitle>
            <DialogDescription className="text-slate-500">
              Please review and confirm your withdrawal details
            </DialogDescription>
          </DialogHeader>
          
          <div className="bg-white/5 rounded-xl p-4 space-y-3 border border-warning-200/60">
            <div className="flex items-center gap-2 pb-2 border-b border-warning-200/60">
              <span className="text-xl">{countryConfig.flag}</span>
              <span className="font-medium text-slate-800">{countryConfig.name}</span>
            </div>
            
            {/* Main Amount - Local Currency Only */}
            <div className="bg-success-500/10 rounded-xl p-4 text-center border border-success-500/30">
              <p className="text-sm text-slate-500 mb-1">Withdrawal Amount</p>
              <p className="text-3xl font-bold text-success-600">{formatLocalCurrency(localAmount)}</p>
            </div>
            
            {/* Fee Info - Local Currency Only */}
            <div className="bg-warning-500/10 rounded-lg p-3 border border-warning-500/30 space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-medium text-warning-700">Fee (deducted):</span>
                <span className="font-bold text-danger-600">-{countryConfig.currencySymbol}{getWithdrawalFeeLocal().toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              </div>
              <p className="text-xs text-warning-600/70 italic">Fee is deducted from your withdrawal amount</p>
              <div className="border-t border-warning-200/60 pt-2 mt-2">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-semibold text-success-600">You Will Receive:</span>
                  <span className="font-bold text-lg text-success-600">{countryConfig.currencySymbol}{Math.max(0, localAmount - getWithdrawalFeeLocal()).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-sm text-slate-500">Balance Deduction:</span>
                  <span className="font-medium text-slate-500">{countryConfig.currencySymbol}{localAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </div>
              </div>
            </div>
            
            <div className="border-t border-warning-200/60 pt-3 mt-3 space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">Payment Method:</span>
                <span className="font-medium text-slate-800 capitalize">{countryConfig.paymentMethods.find(m => m.value === paymentMethod)?.label || paymentMethod}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Account Name:</span>
                <span className="font-medium text-slate-800">{getNormalizedAccountName()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{getAccountFieldLabel()}:</span>
                <span className="font-medium text-slate-800">{getNormalizedAccountNumber()}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Min Withdrawal:</span>
                <span className="text-slate-500">
                  {countryConfig.currencySymbol}{formatNumber(Math.ceil(getMinWithdrawalLocal()))}
                </span>
              </div>
              {PAYMENT_MAX_LIMITS[selectedCountry]?.[paymentMethod] && (
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Max Limit:</span>
                  <span className="text-slate-500">
                    {countryConfig.currencySymbol}{formatNumber(PAYMENT_MAX_LIMITS[selectedCountry][paymentMethod])}
                  </span>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="flex gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)} disabled={submitting} className="flex-1 border-slate-600 text-slate-500 hover:bg-slate-100">
              Cancel
            </Button>
            <Button onClick={handleSubmitWithdrawal} disabled={submitting} className="flex-1 bg-gradient-to-r from-brand-600 to-info-600 text-white">
              {submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Withdrawal Detail Dialog */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="mx-4 rounded-2xl bg-gradient-to-br from-warning-50 via-white to-warning-50 border-white/20 max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-slate-800">
              {(() => {
                // For agency view: if helper has processed (helper_processed_at exists),
                // show as "approved" even if actual status is "processing"
                const detailDisplayStatus = ((selectedWithdrawal?.status === 'processing' && selectedWithdrawal?.helper_processed_at) || selectedWithdrawal?.status === 'approved')
                  ? 'completed'
                  : selectedWithdrawal?.status;
                
                const statusColorMap: Record<string, string> = {
                };
                const statusTextMap: Record<string, string> = {
                };
                
                return (
                  <>
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${statusColorMap[detailDisplayStatus || 'pending'] || 'bg-info-500'}`}>
                      {(detailDisplayStatus === 'pending') && <Clock className="w-5 h-5 text-slate-800" />}
                      {(detailDisplayStatus === 'processing') && <Loader2 className="w-5 h-5 text-slate-800 animate-spin" />}
                      {(detailDisplayStatus === 'completed' || detailDisplayStatus === 'approved') && <CheckCircle className="w-5 h-5 text-slate-800" />}
                      {(detailDisplayStatus === 'rejected') && <XCircle className="w-5 h-5 text-slate-800" />}
                    </div>
                    <div>
                      <p className="font-bold">Withdrawal Details</p>
                      <p className={`text-sm font-medium capitalize ${statusTextMap[detailDisplayStatus || 'pending'] || 'text-info-600'}`}>
                        {detailDisplayStatus}
                      </p>
                    </div>
                  </>
                );
              })()}
            </DialogTitle>
          </DialogHeader>
          
          {selectedWithdrawal && (
            <div className="space-y-4">
              {/* Amount Card */}
              <div className="bg-gradient-to-br from-success-500/20 to-success-500/20 rounded-xl p-4 border border-success-500/30">
                <div className="text-center">
                  <p className="text-3xl font-bold text-success-600">{formatNumber(selectedWithdrawal.amount)}</p>
                  <p className="text-xs text-slate-500">Beans</p>
                </div>
              </div>
              
              {/* Country, Payment Method, Currency Row */}
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <div className="bg-slate-100/50 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                  <span className="text-lg">
                    {selectedWithdrawal.payment_details?.country_code === 'BD' ? '🇧🇩' :
                     selectedWithdrawal.payment_details?.country_code === 'IN' ? '🇮🇳' :
                     selectedWithdrawal.payment_details?.country_code === 'PK' ? '🇵🇰' :
                     selectedWithdrawal.payment_details?.country_code === 'NP' ? '🇳🇵' : '🌍'}
                  </span>
                  <span className="text-slate-800 font-bold">{selectedWithdrawal.payment_details?.country_code || 'N/A'}</span>
                </div>
                <span className="text-slate-500">•</span>
                <div className="bg-gradient-to-r from-brand-500/30 to-brand-500/30 px-3 py-1.5 rounded-lg border border-brand-500/40">
                  <span className="text-brand-700 font-bold text-sm">{selectedWithdrawal.payment_method?.toUpperCase()}</span>
                </div>
                <span className="text-slate-500">•</span>
                <div className="bg-gradient-to-r from-success-500/30 to-success-500/30 px-3 py-1.5 rounded-lg border border-success-500/40">
                  <span className="text-success-700 font-bold text-sm">{selectedWithdrawal.payment_details?.currency_code || 'N/A'}</span>
                </div>
              </div>
              
              {/* Amount Details */}
              <div className="bg-white rounded-xl p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">USD Value</span>
                  <span className="text-success-600 font-bold text-lg">
                    ${(selectedWithdrawal.payment_details?.usd_amount || beansToUsd(selectedWithdrawal.amount)).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Local Amount</span>
                  <span className="text-brand-600 font-bold text-lg">
                    {(() => {
                      const wCurrency = selectedWithdrawal.payment_details?.currency_code || 'BDT';
                      const wConfig = Object.values(COUNTRY_CONFIGS).find(c => c.currency === wCurrency) || countryConfig;
                      const localAmt = selectedWithdrawal.payment_details?.local_amount || beansToLocal(selectedWithdrawal.amount);
                      return `${wConfig.currencySymbol}${localAmt.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
                    })()}
                  </span>
                </div>
                {selectedWithdrawal.payment_details?.exchange_rate && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500">Exchange Rate</span>
                    <span className="text-slate-500">$1 = {selectedWithdrawal.payment_details.exchange_rate}</span>
                  </div>
                )}
              </div>
              
              {/* Fee Info */}
              {selectedWithdrawal.payment_details?.withdrawal_fee_usd && (
                <div className="bg-warning-500/10 rounded-xl p-4 border border-warning-500/30">
                  <div className="flex justify-between items-center">
                    <span className="text-warning-600 font-medium">Withdrawal Fee</span>
                    <span className="text-warning-600 font-bold">
                      ${selectedWithdrawal.payment_details.withdrawal_fee_usd.toFixed(2)} ({formatNumber(selectedWithdrawal.payment_details.withdrawal_fee_beans || 0)} Beans)
                    </span>
                  </div>
                </div>
              )}
              
              {/* Payment Details */}
              <div className="bg-white rounded-xl p-4">
                <p className="text-slate-800 font-semibold mb-3 flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-info-600" />
                  Payment Details
                </p>
                <div className="space-y-2 text-sm">
                  {selectedWithdrawal.payment_details?.account_name && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">Account Name</span>
                      <span className="text-slate-800 font-medium">{selectedWithdrawal.payment_details.account_name}</span>
                    </div>
                  )}
                  {selectedWithdrawal.payment_details?.account_number && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">Account Number</span>
                      <span className="text-slate-800 font-medium">{selectedWithdrawal.payment_details.account_number}</span>
                    </div>
                  )}
                  {selectedWithdrawal.payment_details?.bank_name && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">Bank Name</span>
                      <span className="text-slate-800 font-medium">{selectedWithdrawal.payment_details.bank_name}</span>
                    </div>
                  )}
                  {selectedWithdrawal.payment_details?.additional_info && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">Additional Info</span>
                      <span className="text-slate-800 font-medium">{selectedWithdrawal.payment_details.additional_info}</span>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Request Time */}
              <div className="text-center text-sm text-slate-500 pt-2">
                <Clock className="w-4 h-4 inline-block mr-1" />
                Requested: {formatDate(selectedWithdrawal.requested_at)}
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button 
              onClick={() => setShowDetailDialog(false)} 
              className="w-full bg-gradient-to-r from-brand-600 to-info-600"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
};

export default AgencyWithdrawal;
