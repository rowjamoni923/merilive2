import { useState, useEffect } from 'react';
import { getNativeFlags, subscribeNativeFlags, NativeFlags } from '@/utils/nativeFlags';

export const useNativeFlags = (): NativeFlags => {
  const [flags, setFlags] = useState<NativeFlags>(getNativeFlags());

  useEffect(() => {
    const unsub = subscribeNativeFlags(() => {
      setFlags(getNativeFlags());
    });
    return unsub;
  }, []);

  return flags;
};
