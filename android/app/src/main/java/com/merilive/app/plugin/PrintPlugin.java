package com.merilive.app.plugin;

import android.content.Context;
import android.os.Build;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Pkg262 — Print framework bridge. Renders arbitrary HTML (receipts, tickets,
 * invoices, share cards) through Android PrintManager → user picks any print
 * service (system default, Save as PDF, cloud printers, Bluetooth thermal
 * printers that register a PrintService).
 */
@CapacitorPlugin(name = "Print")
public class PrintPlugin extends Plugin {

    // Keep references to in-flight WebViews so they can be destroyed.
    // The print PrintDocumentAdapter requires the WebView to outlive pm.print()
    // until the system pulls pages — so we destroy on next print() call and on
    // plugin teardown rather than immediately.
    private final java.util.List<WebView> activeWebViews =
            java.util.Collections.synchronizedList(new java.util.ArrayList<>());

    private void disposeOldWebViews() {
        synchronized (activeWebViews) {
            for (WebView wv : activeWebViews) {
                try { wv.stopLoading(); wv.destroy(); } catch (Throwable ignored) {}
            }
            activeWebViews.clear();
        }
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("available", Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT);
        call.resolve(ret);
    }

    @PluginMethod
    public void printHtml(final PluginCall call) {
        final String html = call.getString("html");
        if (html == null || html.isEmpty()) {
            call.reject("html is required");
            return;
        }
        final String jobName = call.getString("jobName", "MeriLive Document");
        final String orientation = call.getString("orientation", "portrait");
        final String mediaSize = call.getString("mediaSize", "iso_a4");

        final android.app.Activity act = getActivity();
        if (act == null) { call.reject("no activity"); return; }
        if (act.isFinishing() || act.isDestroyed()) { call.reject("activity destroyed"); return; }

        act.runOnUiThread(() -> {
            try {
                // Dispose any WebViews left from previous print jobs to bound memory.
                disposeOldWebViews();

                final Context ctx = getContext();
                final WebView webView = new WebView(ctx);
                activeWebViews.add(webView);
                webView.getSettings().setJavaScriptEnabled(false);
                webView.getSettings().setLoadsImagesAutomatically(true);
                webView.setWebViewClient(new WebViewClient() {
                    @Override
                    public void onPageFinished(WebView view, String url) {
                        try {
                            PrintManager pm = (PrintManager) ctx.getSystemService(Context.PRINT_SERVICE);
                            if (pm == null) {
                                call.reject("PrintManager unavailable");
                                return;
                            }

                            PrintAttributes.MediaSize size;
                            switch (mediaSize) {
                                case "na_letter": size = PrintAttributes.MediaSize.NA_LETTER; break;
                                case "iso_a6":    size = PrintAttributes.MediaSize.ISO_A6; break;
                                case "thermal_80mm":
                                    size = new PrintAttributes.MediaSize("THERMAL_80", "Thermal 80mm", 3150, 11700);
                                    break;
                                case "iso_a4":
                                default: size = PrintAttributes.MediaSize.ISO_A4; break;
                            }
                            if ("landscape".equalsIgnoreCase(orientation)) {
                                size = size.asLandscape();
                            } else {
                                size = size.asPortrait();
                            }

                            PrintAttributes.Builder ab = new PrintAttributes.Builder()
                                .setMediaSize(size)
                                .setResolution(new PrintAttributes.Resolution("default", "default", 300, 300))
                                .setMinMargins(PrintAttributes.Margins.NO_MARGINS);

                            android.print.PrintDocumentAdapter adapter;
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                                adapter = view.createPrintDocumentAdapter(jobName);
                            } else {
                                call.reject("Print requires Android 5.0+");
                                return;
                            }
                            pm.print(jobName, adapter, ab.build());

                            JSObject ret = new JSObject();
                            ret.put("queued", true);
                            ret.put("jobName", jobName);
                            call.resolve(ret);
                        } catch (Throwable t) {
                            call.reject("print failed: " + t.getMessage(), t);
                        }
                    }
                });
                webView.loadDataWithBaseURL(null, html, "text/HTML", "UTF-8", null);
            } catch (Throwable t) {
                call.reject("print init failed: " + t.getMessage(), t);
            }
        });
    }

    @Override
    protected void handleOnDestroy() {
        disposeOldWebViews();
        super.handleOnDestroy();
    }
}
