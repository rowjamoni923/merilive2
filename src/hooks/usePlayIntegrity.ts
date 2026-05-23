// Pkg236 — usePlayIntegrity hook
// Wraps the native Play Integrity bridge + verify-play-integrity edge fn.
// Usage:
//   const { verify } = usePlayIntegrity();
//   const verdict = await verify(); // { passed: boolean, ... } | null

import { useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  isPlayIntegrityAvailable,
  preparePlayIntegrity,
  requestPlayIntegrityToken,
} from "@/plugins/playIntegrity";

export interface PlayIntegrityVerdict {
  passed: boolean;
  appVerdict?: string;
  deviceVerdicts?: string[];
  accountVerdict?: string;
  nonceOk?: boolean;
  packageOk?: boolean;
}

function randomNonce(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function usePlayIntegrity() {
  const preparedRef = useRef(false);

  useEffect(() => {
    if (!isPlayIntegrityAvailable() || preparedRef.current) return;
    preparedRef.current = true;
    // Warmup early; cheap if already prepared
    preparePlayIntegrity().catch(() => {});
  }, []);

  const verify = useCallback(
    async (opts?: { nonce?: string }): Promise<PlayIntegrityVerdict | null> => {
      if (!isPlayIntegrityAvailable()) return null;
      const nonce = opts?.nonce ?? randomNonce();
      const token = await requestPlayIntegrityToken(nonce);
      if (!token) return null;
      const { data, error } = await supabase.functions.invoke(
        "verify-play-integrity",
        { body: { integrityToken: token, nonce } },
      );
      if (error) {
        console.warn("[PlayIntegrity] verify edge fn error", error);
        return null;
      }
      return (data as PlayIntegrityVerdict) ?? null;
    },
    [],
  );

  return { verify, available: isPlayIntegrityAvailable() };
}
