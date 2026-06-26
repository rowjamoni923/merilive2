import { createContext, useContext } from 'react';

export interface CallContextType {
  startCall: (hostId: string, streamId?: string) => Promise<string | null>;
  endCall: () => Promise<void>;
  isInCall: boolean;
}

export const CallContext = createContext<CallContextType | null>(null);

export function useCall() {
  const context = useContext(CallContext);
  if (!context) {
    // Lightweight fallback while the call provider chunk is still loading or
    // on public/auth pages where calls are not mounted.
    return {
      startCall: async () => null as string | null,
      endCall: async () => {},
      isInCall: false,
    };
  }
  return context;
}