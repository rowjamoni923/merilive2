import { ShieldAlert, X } from "lucide-react";
import { useVpnDetection } from "@/hooks/useVpnDetection";

const VpnWarningBanner = () => {
  const { isAnyDetected, isVpn, isProxy, isTor, isRelay, isChecking, dismissed, dismiss } = useVpnDetection();

  if (isChecking || !isAnyDetected || dismissed) return null;

  const types = [
    isVpn && "VPN",
    isProxy && "Proxy",
    isTor && "Tor",
    isRelay && "Relay",
  ].filter(Boolean).join(", ");

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] bg-gradient-to-r from-amber-500 to-orange-500 text-white px-4 py-3 shadow-lg animate-in slide-in-from-top duration-300">
      <div className="flex items-center justify-between max-w-lg mx-auto">
        <div className="flex items-center gap-2 flex-1">
          <ShieldAlert className="w-5 h-5 flex-shrink-0" />
          <div className="text-sm font-medium">
            <span className="font-bold">{types}</span> detected. Please disable VPN/Proxy for security.
          </div>
        </div>
        <button
          onClick={dismiss}
          className="ml-3 p-1 rounded-full hover:bg-white/20 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default VpnWarningBanner;
