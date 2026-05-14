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
    defaultFeeUsd: 3,
    tiers: [
      { maxLocal: 10000, feeUsd: 1 },
      { maxLocal: 25000, feeUsd: 2 },
      { maxLocal: 50000, feeUsd: 3 },
      { maxLocal: 100000, feeUsd: 5 },
      { maxLocal: Infinity, feeUsd: 8 }
    ]
  },
  PK: {
    defaultFeeUsd: 3,
    tiers: [
      { maxLocal: 25000, feeUsd: 1 },
      { maxLocal: 50000, feeUsd: 2 },
      { maxLocal: 100000, feeUsd: 3 },
      { maxLocal: Infinity, feeUsd: 5 }
    ]
  },
  // Default for all other countries
  DEFAULT: {
    defaultFeeUsd: 2,
    tiers: [
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
      { value: "epay", label: "ePay (Global)" },
    ]
  },
  IN: {
    name: "India",
    flag: "🇮🇳",
    currency: "INR",
    currencySymbol: "₹",
    paymentMethods: [
      { value: "upi", label: "UPI" },
      { value: "epay", label: "ePay (Global)" },
    ]
  },
  PK: {
    name: "Pakistan",
    flag: "🇵🇰",
    currency: "PKR",
    currencySymbol: "Rs",
    paymentMethods: [
      { value: "easypaisa", label: "Easypaisa" },
      { value: "epay", label: "ePay (Global)" },
    ]
  },
  NP: {
    name: "Nepal",
    flag: "🇳🇵",
    currency: "NPR",
    currencySymbol: "Rs",
    paymentMethods: [
      { value: "esewa", label: "eSewa" },
      { value: "epay", label: "ePay (Global)" },
    ]
  },
  LK: {
    name: "Sri Lanka",
    flag: "🇱🇰",
    currency: "LKR",
    currencySymbol: "Rs",
    paymentMethods: [
      { value: "frimi", label: "FriMi" },
      { value: "epay", label: "ePay (Global)" },
    ]
  },
  PH: {
    name: "Philippines",
    flag: "🇵🇭",
    currency: "PHP",
    currencySymbol: "₱",
    paymentMethods: [
      { value: "gcash", label: "GCash" },
      { value: "epay", label: "ePay (Global)" },
    ]
  },
  ID: {
    name: "Indonesia",
    flag: "🇮🇩",
    currency: "IDR",
    currencySymbol: "Rp",
    paymentMethods: [
      { value: "gopay", label: "GoPay" },
      { value: "epay", label: "ePay (Global)" },
    ]
  },
  VN: {
    name: "Vietnam",
    flag: "🇻🇳",
    currency: "VND",
    currencySymbol: "₫",
    paymentMethods: [
      { value: "momo", label: "MoMo" },
      { value: "epay", label: "ePay (Global)" },
    ]
  },
  TH: {
    name: "Thailand",
    flag: "🇹🇭",
    currency: "THB",
    currencySymbol: "฿",
    paymentMethods: [
      { value: "promptpay", label: "PromptPay" },
      { value: "epay", label: "ePay (Global)" },
    ]
  },
  MY: {
    name: "Malaysia",
    flag: "🇲🇾",
    currency: "MYR",
    currencySymbol: "RM",
    paymentMethods: [
      { value: "grabpay", label: "GrabPay" },
      { value: "epay", label: "ePay (Global)" },
    ]
  },
  SG: {
    name: "Singapore",
    flag: "🇸🇬",
    currency: "SGD",
    currencySymbol: "S$",
    paymentMethods: [
      { value: "paynow", label: "PayNow" },
      { value: "epay", label: "ePay (Global)" },
    ]
  },
  JP: {
    name: "Japan",
    flag: "🇯🇵",
    currency: "JPY",
    currencySymbol: "¥",
    paymentMethods: [
      { value: "paypay", label: "PayPay" },
      { value: "epay", label: "ePay (Global)" },
    ]
  },
  KR: {
    name: "South Korea",
    flag: "🇰🇷",
    currency: "KRW",
    currencySymbol: "₩",
    paymentMethods: [
      { value: "kakaopay", label: "Kakao Pay" },
    ]
  },
  CN: {
    name: "China",
    flag: "🇨🇳",
    currency: "CNY",
    currencySymbol: "¥",
    paymentMethods: [
      { value: "alipay", label: "Alipay" },
    ]
  },
  HK: {
    name: "Hong Kong",
    flag: "🇭🇰",
    currency: "HKD",
    currencySymbol: "HK$",
    paymentMethods: [
      { value: "payme", label: "PayMe" },
    ]
  },
  TW: {
    name: "Taiwan",
    flag: "🇹🇼",
    currency: "TWD",
    currencySymbol: "NT$",
    paymentMethods: [
      { value: "linepay", label: "LINE Pay" },
    ]
  },
  MM: {
    name: "Myanmar",
    flag: "🇲🇲",
    currency: "MMK",
    currencySymbol: "K",
    paymentMethods: [
      { value: "wavepay", label: "Wave Pay" },
    ]
  },
  KH: {
    name: "Cambodia",
    flag: "🇰🇭",
    currency: "KHR",
    currencySymbol: "៛",
    paymentMethods: [
      { value: "wing", label: "Wing" },
    ]
  },
  LA: {
    name: "Laos",
    flag: "🇱🇦",
    currency: "LAK",
    currencySymbol: "₭",
    paymentMethods: [
      { value: "bcel", label: "BCEL One" },
    ]
  },
  BN: {
    name: "Brunei",
    flag: "🇧🇳",
    currency: "BND",
    currencySymbol: "B$",
    paymentMethods: [
      { value: "progresifpay", label: "Progresif Pay" },
    ]
  },
  MN: {
    name: "Mongolia",
    flag: "🇲🇳",
    currency: "MNT",
    currencySymbol: "₮",
    paymentMethods: [
      { value: "qpay", label: "QPay" },
    ]
  },
  KZ: {
    name: "Kazakhstan",
    flag: "🇰🇿",
    currency: "KZT",
    currencySymbol: "₸",
    paymentMethods: [
      { value: "kaspi", label: "Kaspi Gold" },
    ]
  },
  UZ: {
    name: "Uzbekistan",
    flag: "🇺🇿",
    currency: "UZS",
    currencySymbol: "soʻm",
    paymentMethods: [
      { value: "payme", label: "Payme" },
    ]
  },
  AZ: {
    name: "Azerbaijan",
    flag: "🇦🇿",
    currency: "AZN",
    currencySymbol: "₼",
    paymentMethods: [
      { value: "mpay", label: "m10" },
    ]
  },
  GE: {
    name: "Georgia",
    flag: "🇬🇪",
    currency: "GEL",
    currencySymbol: "₾",
    paymentMethods: [
      { value: "tbcpay", label: "TBC Pay" },
    ]
  },
  AM: {
    name: "Armenia",
    flag: "🇦🇲",
    currency: "AMD",
    currencySymbol: "֏",
    paymentMethods: [
      { value: "idram", label: "Idram" },
    ]
  },

  // Middle East
  AE: {
    name: "UAE",
    flag: "🇦🇪",
    currency: "AED",
    currencySymbol: "د.إ",
    paymentMethods: [
      { value: "applepay", label: "Apple Pay" },
    ]
  },
  SA: {
    name: "Saudi Arabia",
    flag: "🇸🇦",
    currency: "SAR",
    currencySymbol: "﷼",
    paymentMethods: [
      { value: "stcpay", label: "STC Pay" },
    ]
  },
  QA: {
    name: "Qatar",
    flag: "🇶🇦",
    currency: "QAR",
    currencySymbol: "ر.ق",
    paymentMethods: [
      { value: "vodafonepay", label: "Vodafone Pay" },
    ]
  },
  KW: {
    name: "Kuwait",
    flag: "🇰🇼",
    currency: "KWD",
    currencySymbol: "د.ك",
    paymentMethods: [
      { value: "knet", label: "K-Net" },
    ]
  },
  BH: {
    name: "Bahrain",
    flag: "🇧🇭",
    currency: "BHD",
    currencySymbol: "د.ب",
    paymentMethods: [
      { value: "benefitpay", label: "BenefitPay" },
    ]
  },
  OM: {
    name: "Oman",
    flag: "🇴🇲",
    currency: "OMR",
    currencySymbol: "ر.ع",
    paymentMethods: [
      { value: "thawani", label: "Thawani" },
    ]
  },
  JO: {
    name: "Jordan",
    flag: "🇯🇴",
    currency: "JOD",
    currencySymbol: "د.ا",
    paymentMethods: [
      { value: "efawateercom", label: "eFAWATEERcom" },
    ]
  },
  IQ: {
    name: "Iraq",
    flag: "🇮🇶",
    currency: "IQD",
    currencySymbol: "ع.د",
    paymentMethods: [
      { value: "zaincash", label: "Zain Cash" },
    ]
  },
  TR: {
    name: "Turkey",
    flag: "🇹🇷",
    currency: "TRY",
    currencySymbol: "₺",
    paymentMethods: [
      { value: "papara", label: "Papara" },
    ]
  },
  EG: {
    name: "Egypt",
    flag: "🇪🇬",
    currency: "EGP",
    currencySymbol: "E£",
    paymentMethods: [
      { value: "vodafonecash", label: "Vodafone Cash" },
    ]
  },

  // Africa
  NG: {
    name: "Nigeria",
    flag: "🇳🇬",
    currency: "NGN",
    currencySymbol: "₦",
    paymentMethods: [
      { value: "opay", label: "OPay" },
    ]
  },
  GH: {
    name: "Ghana",
    flag: "🇬🇭",
    currency: "GHS",
    currencySymbol: "₵",
    paymentMethods: [
      { value: "mtnmomo", label: "MTN MoMo" },
    ]
  },
  KE: {
    name: "Kenya",
    flag: "🇰🇪",
    currency: "KES",
    currencySymbol: "KSh",
    paymentMethods: [
      { value: "mpesa", label: "M-Pesa" },
    ]
  },
  TZ: {
    name: "Tanzania",
    flag: "🇹🇿",
    currency: "TZS",
    currencySymbol: "TSh",
    paymentMethods: [
      { value: "mpesa", label: "M-Pesa" },
    ]
  },
  UG: {
    name: "Uganda",
    flag: "🇺🇬",
    currency: "UGX",
    currencySymbol: "USh",
    paymentMethods: [
      { value: "mtnmomo", label: "MTN Mobile Money" },
    ]
  },
  ET: {
    name: "Ethiopia",
    flag: "🇪🇹",
    currency: "ETB",
    currencySymbol: "Br",
    paymentMethods: [
      { value: "telebirr", label: "TeleBirr" },
    ]
  },
  ZA: {
    name: "South Africa",
    flag: "🇿🇦",
    currency: "ZAR",
    currencySymbol: "R",
    paymentMethods: [
      { value: "snapscan", label: "SnapScan" },
    ]
  },
  MA: {
    name: "Morocco",
    flag: "🇲🇦",
    currency: "MAD",
    currencySymbol: "د.م.",
    paymentMethods: [
      { value: "cmi", label: "CMI" },
    ]
  },
  SN: {
    name: "Senegal",
    flag: "🇸🇳",
    currency: "XOF",
    currencySymbol: "CFA",
    paymentMethods: [
      { value: "wave", label: "Wave" },
    ]
  },
  CI: {
    name: "Ivory Coast",
    flag: "🇨🇮",
    currency: "XOF",
    currencySymbol: "CFA",
    paymentMethods: [
      { value: "orangemoney", label: "Orange Money" },
    ]
  },
  CM: {
    name: "Cameroon",
    flag: "🇨🇲",
    currency: "XAF",
    currencySymbol: "FCFA",
    paymentMethods: [
      { value: "orangemoney", label: "Orange Money" },
    ]
  },
  ZM: {
    name: "Zambia",
    flag: "🇿🇲",
    currency: "ZMW",
    currencySymbol: "ZK",
    paymentMethods: [
      { value: "mtnmomo", label: "MTN Mobile Money" },
    ]
  },
  ZW: {
    name: "Zimbabwe",
    flag: "🇿🇼",
    currency: "ZWL",
    currencySymbol: "Z$",
    paymentMethods: [
      { value: "ecocash", label: "EcoCash" },
    ]
  },
  MZ: {
    name: "Mozambique",
    flag: "🇲🇿",
    currency: "MZN",
    currencySymbol: "MT",
    paymentMethods: [
      { value: "mpesa", label: "M-Pesa" },
    ]
  },
  AO: {
    name: "Angola",
    flag: "🇦🇴",
    currency: "AOA",
    currencySymbol: "Kz",
    paymentMethods: [
      { value: "multicaixa", label: "Multicaixa Express" },
    ]
  },

  // Europe
  GB: {
    name: "United Kingdom",
    flag: "🇬🇧",
    currency: "GBP",
    currencySymbol: "£",
    paymentMethods: [
      { value: "revolut", label: "Revolut" },
    ]
  },
  DE: {
    name: "Germany",
    flag: "🇩🇪",
    currency: "EUR",
    currencySymbol: "€",
    paymentMethods: [
      { value: "paypal", label: "PayPal" },
    ]
  },
  FR: {
    name: "France",
    flag: "🇫🇷",
    currency: "EUR",
    currencySymbol: "€",
    paymentMethods: [
      { value: "paypal", label: "PayPal" },
    ]
  },
  IT: {
    name: "Italy",
    flag: "🇮🇹",
    currency: "EUR",
    currencySymbol: "€",
    paymentMethods: [
      { value: "satispay", label: "Satispay" },
    ]
  },
  ES: {
    name: "Spain",
    flag: "🇪🇸",
    currency: "EUR",
    currencySymbol: "€",
    paymentMethods: [
      { value: "bizum", label: "Bizum" },
    ]
  },
  PT: {
    name: "Portugal",
    flag: "🇵🇹",
    currency: "EUR",
    currencySymbol: "€",
    paymentMethods: [
      { value: "mbway", label: "MB WAY" },
    ]
  },
  NL: {
    name: "Netherlands",
    flag: "🇳🇱",
    currency: "EUR",
    currencySymbol: "€",
    paymentMethods: [
      { value: "ideal", label: "iDEAL" },
    ]
  },
  BE: {
    name: "Belgium",
    flag: "🇧🇪",
    currency: "EUR",
    currencySymbol: "€",
    paymentMethods: [
      { value: "bancontact", label: "Bancontact" },
    ]
  },
  AT: {
    name: "Austria",
    flag: "🇦🇹",
    currency: "EUR",
    currencySymbol: "€",
    paymentMethods: [
      { value: "eps", label: "EPS" },
    ]
  },
  CH: {
    name: "Switzerland",
    flag: "🇨🇭",
    currency: "CHF",
    currencySymbol: "CHF",
    paymentMethods: [
      { value: "twint", label: "TWINT" },
    ]
  },
  PL: {
    name: "Poland",
    flag: "🇵🇱",
    currency: "PLN",
    currencySymbol: "zł",
    paymentMethods: [
      { value: "blik", label: "BLIK" },
    ]
  },
  CZ: {
    name: "Czech Republic",
    flag: "🇨🇿",
    currency: "CZK",
    currencySymbol: "Kč",
    paymentMethods: [
      { value: "paypal", label: "PayPal" },
    ]
  },
  HU: {
    name: "Hungary",
    flag: "🇭🇺",
    currency: "HUF",
    currencySymbol: "Ft",
    paymentMethods: [
      { value: "paypal", label: "PayPal" },
    ]
  },
  RO: {
    name: "Romania",
    flag: "🇷🇴",
    currency: "RON",
    currencySymbol: "lei",
    paymentMethods: [
      { value: "revolut", label: "Revolut" },
    ]
  },
  BG: {
    name: "Bulgaria",
    flag: "🇧🇬",
    currency: "BGN",
    currencySymbol: "лв",
    paymentMethods: [
      { value: "paypal", label: "PayPal" },
    ]
  },
  GR: {
    name: "Greece",
    flag: "🇬🇷",
    currency: "EUR",
    currencySymbol: "€",
    paymentMethods: [
      { value: "paypal", label: "PayPal" },
    ]
  },
  SE: {
    name: "Sweden",
    flag: "🇸🇪",
    currency: "SEK",
    currencySymbol: "kr",
    paymentMethods: [
      { value: "swish", label: "Swish" },
    ]
  },
  NO: {
    name: "Norway",
    flag: "🇳🇴",
    currency: "NOK",
    currencySymbol: "kr",
    paymentMethods: [
      { value: "vipps", label: "Vipps" },
    ]
  },
  DK: {
    name: "Denmark",
    flag: "🇩🇰",
    currency: "DKK",
    currencySymbol: "kr",
    paymentMethods: [
      { value: "mobilepay", label: "MobilePay" },
    ]
  },
  FI: {
    name: "Finland",
    flag: "🇫🇮",
    currency: "EUR",
    currencySymbol: "€",
    paymentMethods: [
      { value: "mobilepay", label: "MobilePay" },
    ]
  },
  IE: {
    name: "Ireland",
    flag: "🇮🇪",
    currency: "EUR",
    currencySymbol: "€",
    paymentMethods: [
      { value: "revolut", label: "Revolut" },
    ]
  },
  UA: {
    name: "Ukraine",
    flag: "🇺🇦",
    currency: "UAH",
    currencySymbol: "₴",
    paymentMethods: [
      { value: "monobank", label: "Monobank" },
    ]
  },
  RU: {
    name: "Russia",
    flag: "🇷🇺",
    currency: "RUB",
    currencySymbol: "₽",
    paymentMethods: [
      { value: "sbp", label: "SBP" },
    ]
  },
  BY: {
    name: "Belarus",
    flag: "🇧🇾",
    currency: "BYN",
    currencySymbol: "Br",
    paymentMethods: [
      { value: "erip", label: "ERIP" },
    ]
  },
  RS: {
    name: "Serbia",
    flag: "🇷🇸",
    currency: "RSD",
    currencySymbol: "дин.",
    paymentMethods: [
      { value: "paypal", label: "PayPal" },
    ]
  },
  HR: {
    name: "Croatia",
    flag: "🇭🇷",
    currency: "EUR",
    currencySymbol: "€",
    paymentMethods: [
      { value: "paypal", label: "PayPal" },
    ]
  },
  SK: {
    name: "Slovakia",
    flag: "🇸🇰",
    currency: "EUR",
    currencySymbol: "€",
    paymentMethods: [
      { value: "paypal", label: "PayPal" },
    ]
  },
  SI: {
    name: "Slovenia",
    flag: "🇸🇮",
    currency: "EUR",
    currencySymbol: "€",
    paymentMethods: [
      { value: "paypal", label: "PayPal" },
    ]
  },
  LT: {
    name: "Lithuania",
    flag: "🇱🇹",
    currency: "EUR",
    currencySymbol: "€",
    paymentMethods: [
      { value: "revolut", label: "Revolut" },
    ]
  },
  LV: {
    name: "Latvia",
    flag: "🇱🇻",
    currency: "EUR",
    currencySymbol: "€",
    paymentMethods: [
      { value: "paypal", label: "PayPal" },
    ]
  },
  EE: {
    name: "Estonia",
    flag: "🇪🇪",
    currency: "EUR",
    currencySymbol: "€",
    paymentMethods: [
      { value: "wise", label: "Wise" },
    ]
  },
  MD: {
    name: "Moldova",
    flag: "🇲🇩",
    currency: "MDL",
    currencySymbol: "L",
    paymentMethods: [
      { value: "paypal", label: "PayPal" },
    ]
  },
  AL: {
    name: "Albania",
    flag: "🇦🇱",
    currency: "ALL",
    currencySymbol: "L",
    paymentMethods: [
      { value: "paypal", label: "PayPal" },
    ]
  },
  MK: {
    name: "North Macedonia",
    flag: "🇲🇰",
    currency: "MKD",
    currencySymbol: "ден",
    paymentMethods: [
      { value: "paypal", label: "PayPal" },
    ]
  },
  BA: {
    name: "Bosnia & Herzegovina",
    flag: "🇧🇦",
    currency: "BAM",
    currencySymbol: "KM",
    paymentMethods: [
      { value: "paypal", label: "PayPal" },
    ]
  },
  ME: {
    name: "Montenegro",
    flag: "🇲🇪",
    currency: "EUR",
    currencySymbol: "€",
    paymentMethods: [
      { value: "paypal", label: "PayPal" },
    ]
  },
  IS: {
    name: "Iceland",
    flag: "🇮🇸",
    currency: "ISK",
    currencySymbol: "kr",
    paymentMethods: [
      { value: "paypal", label: "PayPal" },
    ]
  },
  LU: {
    name: "Luxembourg",
    flag: "🇱🇺",
    currency: "EUR",
    currencySymbol: "€",
    paymentMethods: [
      { value: "paypal", label: "PayPal" },
    ]
  },
  MT: {
    name: "Malta",
    flag: "🇲🇹",
    currency: "EUR",
    currencySymbol: "€",
    paymentMethods: [
      { value: "paypal", label: "PayPal" },
    ]
  },
  CY: {
    name: "Cyprus",
    flag: "🇨🇾",
    currency: "EUR",
    currencySymbol: "€",
    paymentMethods: [
      { value: "paypal", label: "PayPal" },
    ]
  },

  // Americas
  US: {
    name: "United States",
    flag: "🇺🇸",
    currency: "USD",
    currencySymbol: "$",
    paymentMethods: [
      { value: "venmo", label: "Venmo" },
    ]
  },
  CA: {
    name: "Canada",
    flag: "🇨🇦",
    currency: "CAD",
    currencySymbol: "C$",
    paymentMethods: [
      { value: "interac", label: "Interac e-Transfer" },
    ]
  },
  MX: {
    name: "Mexico",
    flag: "🇲🇽",
    currency: "MXN",
    currencySymbol: "$",
    paymentMethods: [
      { value: "mercadopago", label: "Mercado Pago" },
    ]
  },
  BR: {
    name: "Brazil",
    flag: "🇧🇷",
    currency: "BRL",
    currencySymbol: "R$",
    paymentMethods: [
      { value: "pix", label: "PIX" },
    ]
  },
  AR: {
    name: "Argentina",
    flag: "🇦🇷",
    currency: "ARS",
    currencySymbol: "$",
    paymentMethods: [
      { value: "mercadopago", label: "Mercado Pago" },
    ]
  },
  CL: {
    name: "Chile",
    flag: "🇨🇱",
    currency: "CLP",
    currencySymbol: "$",
    paymentMethods: [
      { value: "mercadopago", label: "Mercado Pago" },
    ]
  },
  CO: {
    name: "Colombia",
    flag: "🇨🇴",
    currency: "COP",
    currencySymbol: "$",
    paymentMethods: [
      { value: "nequi", label: "Nequi" },
    ]
  },
  PE: {
    name: "Peru",
    flag: "🇵🇪",
    currency: "PEN",
    currencySymbol: "S/",
    paymentMethods: [
      { value: "yape", label: "Yape" },
    ]
  },
  VE: {
    name: "Venezuela",
    flag: "🇻🇪",
    currency: "VES",
    currencySymbol: "Bs",
    paymentMethods: [
      { value: "pagomovil", label: "Pago Móvil" },
    ]
  },
  EC: {
    name: "Ecuador",
    flag: "🇪🇨",
    currency: "USD",
    currencySymbol: "$",
    paymentMethods: [
      { value: "paypal", label: "PayPal" },
    ]
  },
  BO: {
    name: "Bolivia",
    flag: "🇧🇴",
    currency: "BOB",
    currencySymbol: "Bs",
    paymentMethods: [
      { value: "qr", label: "QR Simple" },
    ]
  },
  PY: {
    name: "Paraguay",
    flag: "🇵🇾",
    currency: "PYG",
    currencySymbol: "₲",
    paymentMethods: [
      { value: "tigo", label: "Tigo Money" },
    ]
  },
  UY: {
    name: "Uruguay",
    flag: "🇺🇾",
    currency: "UYU",
    currencySymbol: "$U",
    paymentMethods: [
      { value: "prex", label: "Prex" },
    ]
  },
  CR: {
    name: "Costa Rica",
    flag: "🇨🇷",
    currency: "CRC",
    currencySymbol: "₡",
    paymentMethods: [
      { value: "sinpe", label: "SINPE Móvil" },
    ]
  },
  PA: {
    name: "Panama",
    flag: "🇵🇦",
    currency: "PAB",
    currencySymbol: "B/.",
    paymentMethods: [
      { value: "yappy", label: "Yappy" },
    ]
  },
  GT: {
    name: "Guatemala",
    flag: "🇬🇹",
    currency: "GTQ",
    currencySymbol: "Q",
    paymentMethods: [
      { value: "tigo", label: "Tigo Money" },
    ]
  },
  HN: {
    name: "Honduras",
    flag: "🇭🇳",
    currency: "HNL",
    currencySymbol: "L",
    paymentMethods: [
      { value: "tigo", label: "Tigo Money" },
    ]
  },
  SV: {
    name: "El Salvador",
    flag: "🇸🇻",
    currency: "USD",
    currencySymbol: "$",
    paymentMethods: [
      { value: "chivo", label: "Chivo Wallet" },
    ]
  },
  NI: {
    name: "Nicaragua",
    flag: "🇳🇮",
    currency: "NIO",
    currencySymbol: "C$",
    paymentMethods: [
      { value: "paypal", label: "PayPal" },
    ]
  },
  DO: {
    name: "Dominican Republic",
    flag: "🇩🇴",
    currency: "DOP",
    currencySymbol: "RD$",
    paymentMethods: [
      { value: "yolopago", label: "Yolo Pago" },
    ]
  },
  PR: {
    name: "Puerto Rico",
    flag: "🇵🇷",
    currency: "USD",
    currencySymbol: "$",
    paymentMethods: [
      { value: "athm", label: "ATH Móvil" },
    ]
  },
  CU: {
    name: "Cuba",
    flag: "🇨🇺",
    currency: "CUP",
    currencySymbol: "$",
    paymentMethods: [
      { value: "transfermovil", label: "Transfermóvil" },
    ]
  },
  JM: {
    name: "Jamaica",
    flag: "🇯🇲",
    currency: "JMD",
    currencySymbol: "J$",
    paymentMethods: [
      { value: "lynk", label: "Lynk" },
    ]
  },
  TT: {
    name: "Trinidad & Tobago",
    flag: "🇹🇹",
    currency: "TTD",
    currencySymbol: "TT$",
    paymentMethods: [
      { value: "paypal", label: "PayPal" },
    ]
  },
  HT: {
    name: "Haiti",
    flag: "🇭🇹",
    currency: "HTG",
    currencySymbol: "G",
    paymentMethods: [
      { value: "moncash", label: "MonCash" },
    ]
  },

  // Oceania
  AU: {
    name: "Australia",
    flag: "🇦🇺",
    currency: "AUD",
    currencySymbol: "A$",
    paymentMethods: [
      { value: "payid", label: "PayID" },
    ]
  },
  NZ: {
    name: "New Zealand",
    flag: "🇳🇿",
    currency: "NZD",
    currencySymbol: "NZ$",
    paymentMethods: [
      { value: "paypal", label: "PayPal" },
    ]
  },
  FJ: {
    name: "Fiji",
    flag: "🇫🇯",
    currency: "FJD",
    currencySymbol: "FJ$",
    paymentMethods: [
      { value: "mpaisaFiji", label: "M-PAiSA" },
    ]
  },
  PG: {
    name: "Papua New Guinea",
    flag: "🇵🇬",
    currency: "PGK",
    currencySymbol: "K",
    paymentMethods: [
      { value: "paypal", label: "PayPal" },
    ]
  },

  // Additional countries
  AF: {
    name: "Afghanistan",
    flag: "🇦🇫",
    currency: "AFN",
    currencySymbol: "؋",
    paymentMethods: [
      { value: "hawala", label: "Hawala" },
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  BT: {
    name: "Bhutan",
    flag: "🇧🇹",
    currency: "BTN",
    currencySymbol: "Nu.",
    paymentMethods: [
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  MV: {
    name: "Maldives",
    flag: "🇲🇻",
    currency: "MVR",
    currencySymbol: "Rf",
    paymentMethods: [
      { value: "bml", label: "BML App" },
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  TJ: {
    name: "Tajikistan",
    flag: "🇹🇯",
    currency: "TJS",
    currencySymbol: "SM",
    paymentMethods: [
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  TM: {
    name: "Turkmenistan",
    flag: "🇹🇲",
    currency: "TMT",
    currencySymbol: "m",
    paymentMethods: [
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  KG: {
    name: "Kyrgyzstan",
    flag: "🇰🇬",
    currency: "KGS",
    currencySymbol: "с",
    paymentMethods: [
      { value: "o", label: "O! Money" },
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  YE: {
    name: "Yemen",
    flag: "🇾🇪",
    currency: "YER",
    currencySymbol: "﷼",
    paymentMethods: [
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  SY: {
    name: "Syria",
    flag: "🇸🇾",
    currency: "SYP",
    currencySymbol: "£",
    paymentMethods: [
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  PS: {
    name: "Palestine",
    flag: "🇵🇸",
    currency: "ILS",
    currencySymbol: "₪",
    paymentMethods: [
      { value: "jawwal", label: "Jawwal Pay" },
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  LY: {
    name: "Libya",
    flag: "🇱🇾",
    currency: "LYD",
    currencySymbol: "ل.د",
    paymentMethods: [
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  SD: {
    name: "Sudan",
    flag: "🇸🇩",
    currency: "SDG",
    currencySymbol: "ج.س.",
    paymentMethods: [
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  SS: {
    name: "South Sudan",
    flag: "🇸🇸",
    currency: "SSP",
    currencySymbol: "£",
    paymentMethods: [
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  SO: {
    name: "Somalia",
    flag: "🇸🇴",
    currency: "SOS",
    currencySymbol: "Sh",
    paymentMethods: [
      { value: "zaad", label: "Zaad" },
      { value: "edahab", label: "eDahab" },
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  DJ: {
    name: "Djibouti",
    flag: "🇩🇯",
    currency: "DJF",
    currencySymbol: "Fdj",
    paymentMethods: [
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  ER: {
    name: "Eritrea",
    flag: "🇪🇷",
    currency: "ERN",
    currencySymbol: "Nfk",
    paymentMethods: [
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  MG: {
    name: "Madagascar",
    flag: "🇲🇬",
    currency: "MGA",
    currencySymbol: "Ar",
    paymentMethods: [
      { value: "mvola", label: "MVola" },
      { value: "orangemoney", label: "Orange Money" },
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  MU: {
    name: "Mauritius",
    flag: "🇲🇺",
    currency: "MUR",
    currencySymbol: "₨",
    paymentMethods: [
      { value: "juice", label: "Juice by MCB" },
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  SC: {
    name: "Seychelles",
    flag: "🇸🇨",
    currency: "SCR",
    currencySymbol: "₨",
    paymentMethods: [
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  BW: {
    name: "Botswana",
    flag: "🇧🇼",
    currency: "BWP",
    currencySymbol: "P",
    paymentMethods: [
      { value: "smega", label: "Smega" },
      { value: "orange", label: "Orange Money" },
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  NA: {
    name: "Namibia",
    flag: "🇳🇦",
    currency: "NAD",
    currencySymbol: "N$",
    paymentMethods: [
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  LS: {
    name: "Lesotho",
    flag: "🇱🇸",
    currency: "LSL",
    currencySymbol: "L",
    paymentMethods: [
      { value: "mpesa", label: "M-Pesa" },
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  SZ: {
    name: "Eswatini",
    flag: "🇸🇿",
    currency: "SZL",
    currencySymbol: "E",
    paymentMethods: [
      { value: "mtn", label: "MTN MoMo" },
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  MW: {
    name: "Malawi",
    flag: "🇲🇼",
    currency: "MWK",
    currencySymbol: "MK",
    paymentMethods: [
      { value: "airtel", label: "Airtel Money" },
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  ML: {
    name: "Mali",
    flag: "🇲🇱",
    currency: "XOF",
    currencySymbol: "CFA",
    paymentMethods: [
      { value: "orangemoney", label: "Orange Money" },
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  BF: {
    name: "Burkina Faso",
    flag: "🇧🇫",
    currency: "XOF",
    currencySymbol: "CFA",
    paymentMethods: [
      { value: "orangemoney", label: "Orange Money" },
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  NE: {
    name: "Niger",
    flag: "🇳🇪",
    currency: "XOF",
    currencySymbol: "CFA",
    paymentMethods: [
      { value: "airtel", label: "Airtel Money" },
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  TD: {
    name: "Chad",
    flag: "🇹🇩",
    currency: "XAF",
    currencySymbol: "FCFA",
    paymentMethods: [
      { value: "airtel", label: "Airtel Money" },
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  CF: {
    name: "Central African Republic",
    flag: "🇨🇫",
    currency: "XAF",
    currencySymbol: "FCFA",
    paymentMethods: [
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  CG: {
    name: "Republic of Congo",
    flag: "🇨🇬",
    currency: "XAF",
    currencySymbol: "FCFA",
    paymentMethods: [
      { value: "airtel", label: "Airtel Money" },
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  CD: {
    name: "DR Congo",
    flag: "🇨🇩",
    currency: "CDF",
    currencySymbol: "FC",
    paymentMethods: [
      { value: "mpesa", label: "M-Pesa" },
      { value: "orangemoney", label: "Orange Money" },
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  GA: {
    name: "Gabon",
    flag: "🇬🇦",
    currency: "XAF",
    currencySymbol: "FCFA",
    paymentMethods: [
      { value: "airtel", label: "Airtel Money" },
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  GQ: {
    name: "Equatorial Guinea",
    flag: "🇬🇶",
    currency: "XAF",
    currencySymbol: "FCFA",
    paymentMethods: [
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  GN: {
    name: "Guinea",
    flag: "🇬🇳",
    currency: "GNF",
    currencySymbol: "FG",
    paymentMethods: [
      { value: "orangemoney", label: "Orange Money" },
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  GW: {
    name: "Guinea-Bissau",
    flag: "🇬🇼",
    currency: "XOF",
    currencySymbol: "CFA",
    paymentMethods: [
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  GM: {
    name: "Gambia",
    flag: "🇬🇲",
    currency: "GMD",
    currencySymbol: "D",
    paymentMethods: [
      { value: "qmoney", label: "QMoney" },
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  SL: {
    name: "Sierra Leone",
    flag: "🇸🇱",
    currency: "SLE",
    currencySymbol: "Le",
    paymentMethods: [
      { value: "orangemoney", label: "Orange Money" },
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  LR: {
    name: "Liberia",
    flag: "🇱🇷",
    currency: "LRD",
    currencySymbol: "L$",
    paymentMethods: [
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  TG: {
    name: "Togo",
    flag: "🇹🇬",
    currency: "XOF",
    currencySymbol: "CFA",
    paymentMethods: [
      { value: "flooz", label: "Flooz" },
      { value: "tmoney", label: "T-Money" },
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  BJ: {
    name: "Benin",
    flag: "🇧🇯",
    currency: "XOF",
    currencySymbol: "CFA",
    paymentMethods: [
      { value: "mtn", label: "MTN MoMo" },
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  MR: {
    name: "Mauritania",
    flag: "🇲🇷",
    currency: "MRU",
    currencySymbol: "UM",
    paymentMethods: [
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  CV: {
    name: "Cape Verde",
    flag: "🇨🇻",
    currency: "CVE",
    currencySymbol: "$",
    paymentMethods: [
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  ST: {
    name: "São Tomé and Príncipe",
    flag: "🇸🇹",
    currency: "STN",
    currencySymbol: "Db",
    paymentMethods: [
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  KM: {
    name: "Comoros",
    flag: "🇰🇲",
    currency: "KMF",
    currencySymbol: "CF",
    paymentMethods: [
      { value: "bank", label: "Bank Transfer" },
    ]
  },
  BI: {
    name: "Burundi",
    flag: "🇧🇮",
    currency: "BIF",
    currencySymbol: "FBu",
    paymentMethods: [
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
  const [freeWithdrawalLimit, setFreeWithdrawalLimit] = useState(50000); // beans below this = no fee
  const [minWithdrawalBeans, setMinWithdrawalBeans] = useState(100000);
  const [exchangeRates, setExchangeRates] = useState<Record<string, number>>(DEFAULT_EXCHANGE_RATES);
  const [hasLocalPayrollHelpers, setHasLocalPayrollHelpers] = useState<boolean | null>(null);
  const [countriesWithHelpers, setCountriesWithHelpers] = useState<string[]>([]);
  
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

  // Get current country config
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

  // Get withdrawal fee in USD based on tiered fee from DB (withdrawal_settings)
  // Fee is calculated based on beans amount, matched against tiered ranges
  const getWithdrawalFeeUsd = (localAmountOverride?: number) => {
    const localAmount = localAmountOverride !== undefined ? localAmountOverride : parseFloat(amount || '0');
    const beansAmount = localToBeans(localAmount);
    
    // Below free limit = no fee
    if (beansAmount <= freeWithdrawalLimit) return 0;
    
    // Find matching tier from DB
    for (const tier of withdrawalFees) {
      if (beansAmount >= tier.min_amount && beansAmount <= tier.max_amount) {
        if (tier.fee_type === 'percent') {
          const usdAmount = localToUsd(localAmount);
          return usdAmount * (tier.fee_value / 100);
        } else {
          // flat fee in USD
          return tier.fee_value;
        }
      }
    }
    
    // If no tier matched but fees exist, use last tier
    if (withdrawalFees.length > 0) {
      const lastTier = withdrawalFees[withdrawalFees.length - 1];
      if (lastTier.fee_type === 'percent') {
        const usdAmount = localToUsd(localAmount);
        return usdAmount * (lastTier.fee_value / 100);
      }
      return lastTier.fee_value;
    }
    
    // Default fallback: $5 flat
    return 5;
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
    if (paymentMethod === 'epay') return 'ePay Email';
    if (paymentMethod === 'upi') return 'UPI ID';
    if (paymentMethod === 'alipay') return 'Alipay Email / Account';
    return 'Wallet Number / Account Number';
  };

  const getAccountFieldPlaceholder = () => {
    if (paymentMethod === 'epay') return 'Enter your ePay email';
    if (paymentMethod === 'upi') return 'Enter your UPI ID';
    if (paymentMethod === 'alipay') return 'Enter your Alipay email or account number';
    return 'Enter your wallet/account number';
  };

  const getNormalizedAccountName = () => accountName.trim().replace(/\s+/g, ' ');

  const getNormalizedAccountNumber = () => {
    const normalized = accountNumber.trim();
    return ['epay', 'upi', 'alipay'].includes(paymentMethod)
      ? normalized
      : normalized.replace(/\s+/g, '');
  };

  const getAccountNumberValidationMessage = () => {
    const normalizedAccountNumber = getNormalizedAccountNumber();

    if (paymentMethod === 'epay') {
      return emailAccountSchema.safeParse(normalizedAccountNumber).success
        ? null
        : 'ePay account must be a valid email address';
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

  // Fetch countries that have active payroll helpers
  useEffect(() => {
    const fetchHelperCountries = async () => {
      const { data, error } = await supabase
        .from('topup_helpers')
        .select('country_code')
        .eq('is_verified', true)
        .eq('payroll_enabled', true)
        .eq('is_active', true);
      
      if (!error && data) {
        const countries = [...new Set(data.map(h => h.country_code).filter(Boolean))] as string[];
        setCountriesWithHelpers(countries);
        console.log('[Withdrawal] Countries with payroll helpers:', countries);
      }
    };
    fetchHelperCountries();
  }, []);

  // Check if selected country has local payroll helpers
  useEffect(() => {
    const hasHelpers = countriesWithHelpers.includes(selectedCountry);
    setHasLocalPayrollHelpers(hasHelpers);
    console.log('[Withdrawal] Country', selectedCountry, 'has helpers:', hasHelpers);
  }, [selectedCountry, countriesWithHelpers]);

  // Get available payment methods based on helper availability
  const getAvailablePaymentMethods = () => {
    if (!countryConfig) return [];
    
    // If country has local helpers, show local methods only (no ePay)
    // If country has NO helpers, show only ePay
    if (hasLocalPayrollHelpers === null) {
      // Still loading - show all methods temporarily
      return countryConfig.paymentMethods;
    }
    
    if (hasLocalPayrollHelpers) {
      // Has helpers - filter out ePay, show local methods only
      return countryConfig.paymentMethods.filter(m => m.value !== 'epay');
    } else {
      // No helpers - show only ePay
      return [{ value: "epay", label: "ePay (Global)" }];
    }
  };

  // Update payment method when country or helper availability changes
  useEffect(() => {
    if (!selectedCountry && !countryConfig) return;
    const availableMethods = getAvailablePaymentMethods();
    if (availableMethods.length > 0) {
      // Only update if current method is not in available methods
      const currentMethodAvailable = availableMethods.some(m => m.value === paymentMethod);
      if (!currentMethodAvailable || !paymentMethod) {
        setPaymentMethod(availableMethods[0].value);
      }
    }
  }, [selectedCountry, hasLocalPayrollHelpers]);

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

      // Fetch beans to USD rate from settings (primary)
      const { data: beansRateData } = await supabase
        .from('app_settings')
        .select('setting_value')
        .eq('setting_key', 'beans_to_usd_rate')
        .maybeSingle();
      
      if (beansRateData?.setting_value) {
        const rateValue = beansRateData.setting_value as { rate?: number };
        if (rateValue?.rate) {
          setCoinsToUsdRate(rateValue.rate);
        }
      } else {
        // Fallback to agency_commission setting
        const { data: settingsData } = await supabase
          .from('app_settings')
          .select('setting_value')
          .eq('setting_key', 'agency_commission')
          .maybeSingle();
        
        if (settingsData?.setting_value) {
          const commissionSettings = settingsData.setting_value as unknown as CommissionSettings;
          if (commissionSettings?.coins_to_dollar_rate) {
            setCoinsToUsdRate(commissionSettings.coins_to_dollar_rate);
          }
        }
      }

      // Fetch currency exchange rates from database
      const { data: currencyRatesData } = await supabase
        .from('currency_rates')
        .select('currency_code, rate_to_usd')
        .eq('is_active', true);
      
      if (currencyRatesData && currencyRatesData.length > 0) {
        const dbRates: Record<string, number> = {};
        currencyRatesData.forEach(rate => {
          dbRates[rate.currency_code] = rate.rate_to_usd;
        });
        setExchangeRates({...DEFAULT_EXCHANGE_RATES, ...dbRates});
      }

      // Fetch tiered withdrawal fees from DB (withdrawal_settings)
      const { data: wsData } = await supabase
        .from('app_settings')
        .select('setting_value')
        .eq('setting_key', 'withdrawal_settings')
        .maybeSingle();
      
      if (wsData?.setting_value) {
        const ws = typeof wsData.setting_value === 'string' 
          ? JSON.parse(wsData.setting_value) 
          : wsData.setting_value;
        if (ws.fees && Array.isArray(ws.fees)) {
          setWithdrawalFees(ws.fees);
          console.log('[AgencyWithdrawal] Tiered fees from DB:', ws.fees);
        }
        if (ws.free_withdrawal_limit) setFreeWithdrawalLimit(ws.free_withdrawal_limit);
        if (ws.min_withdrawal) setMinWithdrawalBeans(ws.min_withdrawal);
        if (ws.coins_to_dollar_rate) setCoinsToUsdRate(ws.coins_to_dollar_rate);
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
        p_agency_id: agency.id,
        p_amount: Math.round(withdrawAmountBeans), // Total amount (fee already included)
        p_payment_method: paymentMethod,
        p_payment_details: paymentDetails,
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
       if (paymentMethod === 'epay') {
         console.log('[Withdrawal] ePay method - helper notification skipped, goes to Admin Panel');
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
        return <Badge className="bg-amber-500 text-slate-800 border-0 shadow-sm px-3 py-1 font-medium"><Clock className="w-3 h-3 mr-1.5" /> Pending</Badge>;
      case 'processing':
        return <Badge className="bg-blue-500 text-slate-800 border-0 shadow-sm px-3 py-1 font-medium"><Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> Processing</Badge>;
      case 'approved':
        return <Badge className="bg-emerald-500 text-slate-800 border-0 shadow-sm px-3 py-1 font-medium"><CheckCircle className="w-3 h-3 mr-1.5" /> Completed</Badge>;
      case 'completed':
        return <Badge className="bg-emerald-500 text-slate-800 border-0 shadow-sm px-3 py-1 font-medium"><CheckCircle className="w-3 h-3 mr-1.5" /> Completed</Badge>;
      case 'rejected':
        return <Badge className="bg-red-500 text-slate-800 border-0 shadow-sm px-3 py-1 font-medium"><XCircle className="w-3 h-3 mr-1.5" /> Rejected</Badge>;
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
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 via-white to-indigo-50">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-purple-600 mx-auto" />
          <p className="mt-3 text-gray-600">Loading withdrawal...</p>
        </div>
      </div>
    );
  }

  // Amount is now in local currency
  const localAmount = parseFloat(amount || '0');
  const usdValue = localToUsd(localAmount);
  const beansValue = localToBeans(localAmount);

  return (
    <div className="fixed inset-0 flex flex-col bg-gradient-to-br from-purple-50 via-white to-indigo-50">
      {/* Header */}
      <header className="flex-shrink-0 sticky top-0 z-40 bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 text-white safe-area-top shadow-lg">
        <div className="px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" className="text-slate-800 hover:bg-white/20 rounded-full" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-bold flex items-center gap-2">
              <ArrowDownCircle className="w-5 h-5" />
              Agency Withdrawal
            </h1>
            <p className="text-xs text-slate-600">{agency?.name}</p>
          </div>
          <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-yellow-700" />
          </div>
        </div>
      </header>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch', paddingBottom: 'var(--content-bottom-padding)' }}>
        <main className="px-4 py-4 space-y-6">
        {/* Balance Card */}
        <Card className="bg-gradient-to-br from-emerald-500 via-green-500 to-teal-600 text-white border-0 shadow-xl overflow-hidden relative">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
          <CardContent className="p-6 relative z-10">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-14 h-14 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center shadow-inner">
                <Wallet className="w-7 h-7" />
              </div>
              <div className="flex-1">
                <p className="text-slate-700 text-sm font-medium">Total Beans</p>
                <p className="text-4xl font-bold tracking-tight">
                  {formatNumber(agency?.wallet_balance || 0)}
                </p>
                <p className="text-slate-500 text-xs mt-0.5">Withdrawable balance</p>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white/20 backdrop-blur-sm rounded-xl px-4 py-3 border border-amber-200/60">
                <div className="flex items-center gap-2 mb-1">
                  <DollarSign className="w-4 h-4 text-yellow-700" />
                  <p className="text-slate-700 text-xs">USD Value</p>
                </div>
                <p className="text-xl font-bold text-yellow-700">
                  ${beansToUsd(agency?.wallet_balance || 0).toFixed(2)}
                </p>
              </div>
              <div className="bg-white/20 backdrop-blur-sm rounded-xl px-4 py-3 border border-amber-200/60">
                <div className="flex items-center gap-2 mb-1">
                  <Globe className="w-4 h-4 text-cyan-700" />
                  <p className="text-slate-700 text-xs">{countryConfig.currency} Value</p>
                </div>
                <p className="text-xl font-bold text-cyan-700">
                  {formatLocalCurrency(beansToLocal(agency?.wallet_balance || 0))}
                </p>
              </div>
            </div>
            
            <div className="mt-4 py-3 bg-white/10 rounded-lg space-y-2">
              <div className="flex items-center justify-center gap-2">
                <TrendingUp className="w-4 h-4 text-slate-500" />
                <p className="text-slate-600 text-xs font-medium">
                  Exchange Rates (Set by Admin)
                </p>
              </div>
              <div className="flex items-center justify-center gap-4">
                <div className="text-center px-3">
                  <p className="text-yellow-700 font-bold">{formatNumber(coinsToUsdRate)}</p>
                  <p className="text-slate-500 text-xs">Beans = $1 USD</p>
                </div>
                <div className="h-8 w-px bg-white/20" />
                <div className="text-center px-3">
                  <p className="text-cyan-700 font-bold">{countryConfig.currencySymbol}{formatNumber(exchangeRates[countryConfig.currency] || 1)}</p>
                  <p className="text-slate-500 text-xs">= $1 USD</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Withdrawal Form */}
        <Card className="shadow-lg border-0 bg-white">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-gray-900">
              <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                <Download className="w-4 h-4 text-purple-600" />
              </div>
              New Withdrawal Request
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Allow multiple orders - no warning message, just show pending orders in history below */}
                {/* Country Selection */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-gray-800 font-medium">
                    <Globe className="w-4 h-4 text-purple-500" />
                    Your Country
                    <Lock className="w-3 h-3 text-amber-500" />
                  </Label>
                  <div className="w-full h-14 flex items-center justify-between px-4 bg-gray-100 border-2 border-gray-300 rounded-lg cursor-not-allowed">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{countryConfig.flag}</span>
                      <div>
                        <p className="font-semibold text-gray-900">{countryConfig.name}</p>
                        <p className="text-xs text-gray-500">{countryConfig.currency} - {countryConfig.currencySymbol}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 bg-amber-100 text-amber-700 px-2 py-1 rounded-md text-xs font-medium">
                      <Lock className="w-3 h-3" />
                      Locked
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Country is locked to your account registration location for security
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="text-gray-800 font-semibold">Payment Method</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger className="h-12 bg-white border-2 border-gray-200 hover:border-purple-400 focus:border-purple-500 focus:ring-purple-500/20 text-gray-900 font-medium">
                      <SelectValue placeholder="Select payment method" className="text-gray-900" />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-2 border-gray-200 shadow-xl">
                      {getAvailablePaymentMethods().map((method) => {
                        const maxLimit = PAYMENT_MAX_LIMITS[selectedCountry]?.[method.value];
                        return (
                          <SelectItem 
                            key={method.value} 
                            value={method.value}
                            className="text-gray-900 font-medium hover:bg-purple-50 focus:bg-purple-50 cursor-pointer py-3"
                          >
                            <div className="flex items-center justify-between w-full">
                              <span>
                                {method.value === 'epay' && '🌍 '}{method.label}
                              </span>
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
                  {paymentMethod === 'epay' ? (
                    <div className="bg-indigo-50 rounded-lg p-3 border border-indigo-200">
                      <div className="flex items-center gap-2 text-indigo-700 text-sm">
                        <Globe className="w-4 h-4" />
                        <span>
                          <strong>ePay (Global):</strong> Your request will be processed by Admin directly.
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
                      <div className="flex items-center gap-2 text-blue-700 text-sm">
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
                  {/* Show ePay notice if no local helpers */}
                  {!hasLocalPayrollHelpers && hasLocalPayrollHelpers !== null && (
                    <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
                      <div className="flex items-center gap-2 text-amber-700 text-sm">
                        <AlertCircle className="w-4 h-4" />
                        <span>
                          No local payment helpers in your country. Using <strong>ePay (Global)</strong> - processed by Admin.
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
                      className="flex-1 h-12 bg-white border-2 border-gray-200 hover:border-purple-400 focus:border-purple-500 focus:ring-purple-500/20 text-gray-900 font-medium placeholder:text-slate-500"
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
                      className="h-12 px-4 bg-purple-100 border-2 border-purple-300 text-purple-700 font-bold hover:bg-purple-200 hover:border-purple-400"
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
                        <span className="text-emerald-600 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full">
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
                            <span className="text-red-500 font-medium">
                              ⚠️ Exceeds max limit of {countryConfig.currencySymbol}{formatNumber(maxLimit)}
                            </span>
                          );
                        }
                        if (localAmt < minLocal) {
                          return (
                            <span className="text-amber-500 font-medium">
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
                <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl p-4 border border-amber-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-amber-800 font-semibold flex items-center gap-2">
                      <DollarSign className="w-4 h-4" />
                      Withdrawal Fee (Deducted)
                    </span>
                    <span className="text-red-600 font-bold">
                      -${getWithdrawalFeeUsd().toFixed(2)} USD
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="bg-white rounded-lg px-3 py-2">
                      <span className="text-gray-600">Fee in Beans:</span>
                      <span className="font-semibold text-red-600 ml-1">-{formatNumber(Math.round(getWithdrawalFeeBeans()))}</span>
                    </div>
                    <div className="bg-white rounded-lg px-3 py-2">
                      <span className="text-gray-600">Fee in {countryConfig.currency}:</span>
                      <span className="font-semibold text-red-600 ml-1">-{formatLocalCurrency(getWithdrawalFeeLocal())}</span>
                    </div>
                  </div>
                  
                  {/* Show fee tiers */}
                  {WITHDRAWAL_FEE_CONFIG[selectedCountry]?.tiers && (
                    <div className="mt-2 text-xs text-gray-700 bg-white rounded-lg p-2">
                      <p className="font-medium mb-1">Fee Tiers ({countryConfig.currency}):</p>
                      <div className="grid grid-cols-2 gap-1">
                        {WITHDRAWAL_FEE_CONFIG[selectedCountry].tiers?.slice(0, 4).map((tier, idx) => (
                          <span key={idx} className={`${localAmount <= tier.maxLocal && (idx === 0 || localAmount > (WITHDRAWAL_FEE_CONFIG[selectedCountry].tiers?.[idx-1]?.maxLocal || 0)) ? 'font-bold text-gray-900' : ''}`}>
                            {tier.maxLocal === Infinity 
                              ? `Above: $${tier.feeUsd}` 
                              : `≤${countryConfig.currencySymbol}${formatNumber(tier.maxLocal)}: $${tier.feeUsd}`}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Net Payout Calculation */}
                  {amount && parseFloat(amount) > 0 && (
                    <div className="mt-3 pt-3 border-t border-amber-200 space-y-2">
                      {/* Withdrawal Amount */}
                      <div className="flex justify-between text-sm text-gray-700">
                        <span>Withdrawal Amount:</span>
                        <span className="font-medium">{formatLocalCurrency(localAmount)}</span>
                      </div>
                      {/* Fee Deduction */}
                      <div className="flex justify-between text-sm text-red-600">
                        <span>Fee Deduction:</span>
                        <span className="font-medium">-{formatLocalCurrency(getWithdrawalFeeLocal())}</span>
                      </div>
                      {/* Net Payout */}
                      <div className="flex justify-between text-base bg-emerald-100 rounded-lg p-2 -mx-1">
                        <span className="font-bold text-emerald-800">You Will Receive:</span>
                        <span className="font-bold text-emerald-700">
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
                <div className="bg-blue-50 rounded-lg p-3 border border-blue-200 text-sm text-blue-800">
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
                    className="h-12 bg-white border-2 border-gray-200 hover:border-purple-400 focus:border-purple-500 focus:ring-purple-500/20 text-gray-900 font-medium placeholder:text-slate-500"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-gray-800 font-semibold">{getAccountFieldLabel()}</Label>
                  <Input
                    type={paymentMethod === 'epay' ? 'email' : 'text'}
                    inputMode={paymentMethod === 'epay' ? 'email' : ['bkash', 'nagad', 'easypaisa', 'esewa', 'frimi', 'gcash', 'gopay', 'momo', 'promptpay', 'grabpay', 'paynow', 'paypay', 'kakaopay', 'payme', 'linepay', 'wavepay', 'wing', 'bcel', 'progresifpay', 'qpay', 'kaspi', 'mpay', 'tbcpay', 'alipay'].includes(paymentMethod) ? 'numeric' : 'text'}
                    placeholder={getAccountFieldPlaceholder()}
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                    className="h-12 bg-white border-2 border-gray-200 hover:border-purple-400 focus:border-purple-500 focus:ring-purple-500/20 text-gray-900 font-medium placeholder:text-slate-500"
                  />
                  <p className="text-xs text-gray-500">
                    {paymentMethod === 'epay'
                      ? 'Must be a valid email address.'
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
                    className="bg-white border-2 border-gray-200 hover:border-purple-400 focus:border-purple-500 focus:ring-purple-500/20 text-gray-900 placeholder:text-slate-500"
                  />
                </div>

                <Button
                  className="w-full h-12 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-semibold shadow-lg shadow-purple-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
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
        <Card className="shadow-xl border-0 bg-gradient-to-br from-amber-50 via-white to-orange-50 overflow-hidden">
          <CardHeader className="pb-3 border-b border-amber-200/60">
            <CardTitle className="text-base flex items-center gap-3 text-slate-800">
              <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
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
                    completed: { bg: 'from-emerald-500/20 to-green-500/20', iconBg: 'bg-emerald-500', text: 'text-emerald-600', border: 'border-emerald-500/30' },
                    pending: { bg: 'from-amber-500/20 to-orange-500/20', iconBg: 'bg-amber-500', text: 'text-amber-600', border: 'border-amber-500/30' },
                    processing: { bg: 'from-blue-500/20 to-cyan-500/20', iconBg: 'bg-blue-500', text: 'text-blue-600', border: 'border-blue-500/30' },
                    rejected: { bg: 'from-red-500/20 to-pink-500/20', iconBg: 'bg-red-500', text: 'text-red-600', border: 'border-red-500/30' },
                    approved: { bg: 'from-emerald-500/20 to-green-500/20', iconBg: 'bg-emerald-500', text: 'text-emerald-600', border: 'border-emerald-500/30' }
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
                            <span className="bg-gradient-to-r from-pink-500/30 to-purple-500/30 text-pink-700 px-2 py-0.5 rounded-md text-xs font-medium border border-pink-500/30">
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
        <DialogContent className="mx-4 rounded-2xl bg-gradient-to-br from-amber-50 via-white to-orange-50 border-white/20">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-800">
              <CheckCircle className="w-5 h-5 text-purple-600" />
              Confirm Withdrawal
            </DialogTitle>
            <DialogDescription className="text-slate-500">
              Please review and confirm your withdrawal details
            </DialogDescription>
          </DialogHeader>
          
          <div className="bg-white/5 rounded-xl p-4 space-y-3 border border-amber-200/60">
            <div className="flex items-center gap-2 pb-2 border-b border-amber-200/60">
              <span className="text-xl">{countryConfig.flag}</span>
              <span className="font-medium text-slate-800">{countryConfig.name}</span>
            </div>
            
            {/* Main Amount - Local Currency Only */}
            <div className="bg-emerald-500/10 rounded-xl p-4 text-center border border-emerald-500/30">
              <p className="text-sm text-slate-500 mb-1">Withdrawal Amount</p>
              <p className="text-3xl font-bold text-emerald-600">{formatLocalCurrency(localAmount)}</p>
            </div>
            
            {/* Fee Info - Local Currency Only */}
            <div className="bg-amber-500/10 rounded-lg p-3 border border-amber-500/30 space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-medium text-amber-700">Fee (deducted):</span>
                <span className="font-bold text-red-600">-{countryConfig.currencySymbol}{getWithdrawalFeeLocal().toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              </div>
              <p className="text-xs text-amber-600/70 italic">Fee is deducted from your withdrawal amount</p>
              <div className="border-t border-amber-200/60 pt-2 mt-2">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-semibold text-emerald-600">You Will Receive:</span>
                  <span className="font-bold text-lg text-emerald-600">{countryConfig.currencySymbol}{Math.max(0, localAmount - getWithdrawalFeeLocal()).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-sm text-slate-500">Balance Deduction:</span>
                  <span className="font-medium text-slate-500">{countryConfig.currencySymbol}{localAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </div>
              </div>
            </div>
            
            <div className="border-t border-amber-200/60 pt-3 mt-3 space-y-2">
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
            <Button onClick={handleSubmitWithdrawal} disabled={submitting} className="flex-1 bg-gradient-to-r from-purple-600 to-indigo-600 text-white">
              {submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Withdrawal Detail Dialog */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="mx-4 rounded-2xl bg-gradient-to-br from-amber-50 via-white to-orange-50 border-white/20 max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-slate-800">
              {(() => {
                // For agency view: if helper has processed (helper_processed_at exists),
                // show as "approved" even if actual status is "processing"
                const detailDisplayStatus = ((selectedWithdrawal?.status === 'processing' && selectedWithdrawal?.helper_processed_at) || selectedWithdrawal?.status === 'approved')
                  ? 'completed'
                  : selectedWithdrawal?.status;
                
                const statusColorMap: Record<string, string> = {
                  completed: 'bg-emerald-500',
                  approved: 'bg-emerald-500',
                  pending: 'bg-amber-500',
                  processing: 'bg-blue-500',
                  rejected: 'bg-red-500'
                };
                const statusTextMap: Record<string, string> = {
                  completed: 'text-emerald-600',
                  approved: 'text-emerald-600',
                  pending: 'text-amber-600',
                  processing: 'text-blue-600',
                  rejected: 'text-red-600'
                };
                
                return (
                  <>
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${statusColorMap[detailDisplayStatus || 'pending'] || 'bg-indigo-500'}`}>
                      {(detailDisplayStatus === 'pending') && <Clock className="w-5 h-5 text-slate-800" />}
                      {(detailDisplayStatus === 'processing') && <Loader2 className="w-5 h-5 text-slate-800 animate-spin" />}
                      {(detailDisplayStatus === 'completed' || detailDisplayStatus === 'approved') && <CheckCircle className="w-5 h-5 text-slate-800" />}
                      {(detailDisplayStatus === 'rejected') && <XCircle className="w-5 h-5 text-slate-800" />}
                    </div>
                    <div>
                      <p className="font-bold">Withdrawal Details</p>
                      <p className={`text-sm font-medium capitalize ${statusTextMap[detailDisplayStatus || 'pending'] || 'text-indigo-600'}`}>
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
              <div className="bg-gradient-to-br from-emerald-500/20 to-green-500/20 rounded-xl p-4 border border-emerald-500/30">
                <div className="text-center">
                  <p className="text-3xl font-bold text-emerald-600">{formatNumber(selectedWithdrawal.amount)}</p>
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
                <div className="bg-gradient-to-r from-pink-500/30 to-purple-500/30 px-3 py-1.5 rounded-lg border border-pink-500/40">
                  <span className="text-pink-700 font-bold text-sm">{selectedWithdrawal.payment_method?.toUpperCase()}</span>
                </div>
                <span className="text-slate-500">•</span>
                <div className="bg-gradient-to-r from-green-500/30 to-emerald-500/30 px-3 py-1.5 rounded-lg border border-green-500/40">
                  <span className="text-green-700 font-bold text-sm">{selectedWithdrawal.payment_details?.currency_code || 'N/A'}</span>
                </div>
              </div>
              
              {/* Amount Details */}
              <div className="bg-white rounded-xl p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">USD Value</span>
                  <span className="text-emerald-600 font-bold text-lg">
                    ${(selectedWithdrawal.payment_details?.usd_amount || beansToUsd(selectedWithdrawal.amount)).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Local Amount</span>
                  <span className="text-purple-600 font-bold text-lg">
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
                <div className="bg-amber-500/10 rounded-xl p-4 border border-amber-500/30">
                  <div className="flex justify-between items-center">
                    <span className="text-amber-600 font-medium">Withdrawal Fee</span>
                    <span className="text-amber-600 font-bold">
                      ${selectedWithdrawal.payment_details.withdrawal_fee_usd.toFixed(2)} ({formatNumber(selectedWithdrawal.payment_details.withdrawal_fee_beans || 0)} Beans)
                    </span>
                  </div>
                </div>
              )}
              
              {/* Payment Details */}
              <div className="bg-white rounded-xl p-4">
                <p className="text-slate-800 font-semibold mb-3 flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-cyan-600" />
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
              className="w-full bg-gradient-to-r from-purple-600 to-indigo-600"
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
