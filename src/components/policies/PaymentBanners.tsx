import epayBg from "@/assets/banners/epay-global-withdrawal-banner.jpg";
import epayLogo from "@/assets/banners/epay-logo.png";
import localCurrencyBg from "@/assets/banners/local-currency-payment-banner.jpg";
import countryPaymentBg from "@/assets/banners/country-payment-bg.jpg";

/* ── ePay Global Banner ── */
export const EpayGlobalBanner = () => (
  <div className="rounded-2xl overflow-hidden relative">
    <img src={epayBg} alt="" className="w-full h-auto object-cover" />
    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/10" />
    <div className="absolute bottom-0 left-0 right-0 p-4 flex items-end gap-3">
      <div className="flex-1">
        <p className="text-amber-300 text-[11px] font-bold tracking-[0.15em] uppercase mb-1 drop-shadow-lg">
          Global Withdrawal
        </p>
        <h3 className="text-white text-xl font-extrabold leading-tight drop-shadow-lg">
          ePay Global Withdrawal
        </h3>
        <p className="text-white/70 text-xs mt-1 font-medium drop-shadow-md">
          Available when no Local Payroll Helper exists
        </p>
      </div>
      <img
        src={epayLogo}
        alt="ePay Logo"
        className="w-14 h-14 object-contain bg-white/90 rounded-xl p-1.5 flex-shrink-0 shadow-lg"
      />
    </div>
  </div>
);

/* ── Local Currency Banner ── */
export const LocalCurrencyBanner = () => (
  <div className="rounded-2xl overflow-hidden relative">
    <img src={localCurrencyBg} alt="" className="w-full h-auto object-cover" />
    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
    <div className="absolute bottom-0 left-0 right-0 p-4">
      <p className="text-emerald-300 text-[11px] font-bold tracking-[0.15em] uppercase mb-1 drop-shadow-lg">
        Auto Payment System
      </p>
      <h3 className="text-white text-xl font-extrabold leading-tight drop-shadow-lg">
        Local Currency Payment
      </h3>
      <p className="text-white/70 text-xs mt-1 font-medium drop-shadow-md">
        Instant local payment via Payroll Helpers
      </p>
    </div>
  </div>
);

/* ── Daily Transaction Limits — 15 Countries ── */
interface CountryFlag {
  flag: string;
  name: string;
}

const countries: CountryFlag[] = [
  { flag: "🇮🇳", name: "India" },
  { flag: "🇵🇰", name: "Pakistan" },
  { flag: "🇵🇭", name: "Philippines" },
  { flag: "🇮🇩", name: "Indonesia" },
  { flag: "🇪🇬", name: "Egypt" },
  { flag: "🇹🇷", name: "Turkey" },
  { flag: "🇳🇬", name: "Nigeria" },
  { flag: "🇰🇪", name: "Kenya" },
  { flag: "🇳🇵", name: "Nepal" },
  { flag: "🇱🇰", name: "Sri Lanka" },
  { flag: "🇬🇭", name: "Ghana" },
  { flag: "🇻🇳", name: "Vietnam" },
  { flag: "🇹🇭", name: "Thailand" },
  { flag: "🇿🇦", name: "South Africa" },
  { flag: "🇲🇾", name: "Malaysia" },
];

export const DailyTransactionLimitsBanner = () => (
  <div className="rounded-2xl overflow-hidden relative">
    <img src={countryPaymentBg} alt="" className="absolute inset-0 w-full h-full object-cover" />
    <div className="absolute inset-0 bg-black/40" />

    <div className="relative z-10 p-4">
      {/* Header */}
      <div className="text-center mb-3">
        <p className="text-amber-300 text-[11px] font-bold tracking-[0.15em] uppercase mb-0.5 drop-shadow-lg">
          Daily Transaction Limits
        </p>
        <h3 className="text-white text-base font-extrabold drop-shadow-lg">
          15 Countries Supported
        </h3>
      </div>

      {/* Flags grid */}
      <div className="grid grid-cols-5 gap-2 mb-3">
        {countries.map((c) => (
          <div
            key={c.name}
            className="flex flex-col items-center gap-1 bg-white/10 backdrop-blur-sm rounded-xl py-2 px-1 border border-white/10"
          >
            <span className="text-2xl">{c.flag}</span>
            <span className="text-white text-[8px] font-semibold text-center leading-tight truncate w-full drop-shadow-md">
              {c.name}
            </span>
          </div>
        ))}
      </div>

      {/* Footer badge */}
      <div className="flex justify-center">
        <span className="bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-[11px] font-bold px-4 py-1.5 rounded-full drop-shadow-lg">
          ✅ Local Currency Available
        </span>
      </div>
    </div>
  </div>
);
