import { createContext, useContext } from 'react';

export interface CallContextType {
  startCall: (hostId: string, streamId?: string) => Promise<string | null>;
  isInCall: boolean;
}

export const CallContext = createContext<CallContextType | null>(null);

export function useCall() {
  const context = useContext(CallContext);
  if (!context) {
    return {
      startCall: async () => null as string | null,
      isInCall: false,
    };
  }
  return context;
}