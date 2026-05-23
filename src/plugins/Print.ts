/**
 * Pkg262 — Print framework bridge.
 *
 * Renders HTML through Android PrintManager so users can:
 *   - Save receipts/tickets as PDF (built-in "Save as PDF" service)
 *   - Send to any installed PrintService (Cloud Print, HP, Canon, thermal
 *     Bluetooth printers like 80mm POS units)
 *
 * Web fallback uses `window.print()` against a hidden iframe.
 *
 * Usage:
 *   await printHtml({
 *     html: '<h1>Receipt</h1><p>Total: ₹500</p>',
 *     jobName: 'Receipt #12345',
 *     mediaSize: 'thermal_80mm', // or 'iso_a4' | 'na_letter' | 'iso_a6'
 *     orientation: 'portrait',
 *   });
 */
import { Capacitor, registerPlugin } from "@capacitor/core";

export type PrintMediaSize = "iso_a4" | "na_letter" | "iso_a6" | "thermal_80mm";
export type PrintOrientation = "portrait" | "landscape";

export interface PrintHtmlOptions {
  html: string;
  jobName?: string;
  mediaSize?: PrintMediaSize;
  orientation?: PrintOrientation;
}

interface PrintPluginShape {
  isAvailable(): Promise<{ available: boolean }>;
  printHtml(opts: PrintHtmlOptions): Promise<{ queued: boolean; jobName: string }>;
}

const PrintNative = registerPlugin<PrintPluginShape>("Print");

export function isPrintNative(): boolean {
  return Capacitor.getPlatform() === "android";
}

export async function isPrintAvailable(): Promise<boolean> {
  if (isPrintNative()) {
    try {
      const r = await PrintNative.isAvailable();
      return !!r.available;
    } catch {
      return false;
    }
  }
  return typeof window !== "undefined" && typeof window.print === "function";
}

export async function printHtml(opts: PrintHtmlOptions): Promise<{ queued: boolean; jobName: string }> {
  const jobName = opts.jobName || "MeriLive Document";
  if (isPrintNative()) {
    return PrintNative.printHtml({
      html: opts.html,
      jobName,
      mediaSize: opts.mediaSize || "iso_a4",
      orientation: opts.orientation || "portrait",
    });
  }

  // Web fallback: hidden iframe + window.print
  return new Promise((resolve, reject) => {
    try {
      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "0";
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow?.document;
      if (!doc) {
        document.body.removeChild(iframe);
        reject(new Error("iframe document unavailable"));
        return;
      }
      doc.open();
      doc.write(opts.html);
      doc.close();

      const cleanup = () => {
        setTimeout(() => {
          try { document.body.removeChild(iframe); } catch {}
        }, 1000);
      };

      iframe.onload = () => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
          resolve({ queued: true, jobName });
        } catch (e) {
          reject(e);
        } finally {
          cleanup();
        }
      };
    } catch (e) {
      reject(e);
    }
  });
}
