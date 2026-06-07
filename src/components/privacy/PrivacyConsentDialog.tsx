import { useEffect } from "react";
import { getConsent, setConsent } from "@/lib/privacyConsent";

/**
 * Privacy consent is auto-granted on first launch. Users can change it
 * anytime from Settings → Privacy. No popup is shown — Android install
 * implicitly accepts via the Play Store data-safety disclosure.
 */
export function PrivacyConsentDialog() {
  useEffect(() => {
    if (getConsent() === null) {
      setConsent("granted");
    }
  }, []);

  return null;
}

export default PrivacyConsentDialog;
