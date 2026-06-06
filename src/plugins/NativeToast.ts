import { registerPlugin, Capacitor } from '@capacitor/core';

export interface NativeToastPlugin {
  show(options: { 
    text: string; 
    duration?: number; 
    type?: 'info' | 'success' | 'error' | 'warning' 
  }): Promise<void>;
}

const NativeToast = registerPlugin<NativeToastPlugin>('NativeToast');

export const showNativeToast = async (
  text: string, 
  type: 'info' | 'success' | 'error' | 'warning' = 'info'
) => {
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    try {
      await NativeToast.show({ text, type });
      return true;
    } catch (err) {
      console.error('Native toast failed:', err);
      return false;
    }
  }
  return false;
};

export default NativeToast;
