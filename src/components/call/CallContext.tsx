import { createContext, useContext, useSyncExternalStore } from 'react';

export interface CallContextType {
  startCall: (hostId: string, streamId?: string) => Promise<string | null>;
  endCall: () => Promise<void>;
  isInCall: boolean;
}

export const CallContext = createContext<CallContextType | null>(null);

const fallbackCall: CallContextType = {
  startCall: async () => null,
  endCall: async () => {},
  isInCall: false,
};

let globalCallState: CallContextType = fallbackCall;
const listeners = new Set<() => void>();

export function setGlobalCallController(next: CallContextType | null) {
  globalCallState = next ?? fallbackCall;
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const getSnapshot = () => globalCallState;
const getServerSnapshot = () => fallbackCall;

export function useCall() {
  const context = useContext(CallContext);
  const external = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return context ?? external;
}