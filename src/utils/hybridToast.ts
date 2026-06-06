import { toast as sonnerToast } from "sonner";
import { showNativeToast } from "@/plugins/NativeToast";

/**
 * Pkg438 — Hybrid Toast wrapper.
 * Automatically uses Native Android Snackbar on devices, falls back to Sonner on web.
 */
export const toast = {
  success: (message: string, options?: any) => {
    showNativeToast(message, 'success').then(handled => {
      if (!handled) sonnerToast.success(message, options);
    });
  },
  error: (message: string, options?: any) => {
    showNativeToast(message, 'error').then(handled => {
      if (!handled) sonnerToast.error(message, options);
    });
  },
  info: (message: string, options?: any) => {
    showNativeToast(message, 'info').then(handled => {
      if (!handled) sonnerToast.info(message, options);
    });
  },
  warning: (message: string, options?: any) => {
    showNativeToast(message, 'warning').then(handled => {
      if (!handled) sonnerToast.warning(message, options);
    });
  },
  message: (message: string, options?: any) => {
    showNativeToast(message, 'info').then(handled => {
      if (!handled) sonnerToast.message(message, options);
    });
  }
};
