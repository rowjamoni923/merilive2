import { useEffect } from "react";

/**
 * Set a `data-*` attribute on <body> while the component is mounted.
 * Used by Wave mobile-guard CSS in src/index.css.
 */
export function useBodyMarker(attr: string, value: string = "true") {
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.setAttribute(attr, value);
    return () => {
      document.body.removeAttribute(attr);
    };
  }, [attr, value]);
}
