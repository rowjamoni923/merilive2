/**
 * App State Hook
 * Stable app-state hook.
 * Zero-refresh policy: foreground/background changes must not trigger data
 * reloads. This hook intentionally returns a constant active state.
 */

interface AppState {
  isActive: boolean;
  lastActiveTime: number | null;
  backgroundDuration: number;
}

const STABLE_APP_STATE: AppState = {
  isActive: true,
  lastActiveTime: null,
  backgroundDuration: 0,
};

export const useAppState = () => {
  return STABLE_APP_STATE;
};

export default useAppState;