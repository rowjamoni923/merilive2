package com.merilive.app.plugin;

import android.util.Log;
import com.android.billingclient.api.*;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@CapacitorPlugin(name = "PlayStoreBilling")
public class PlayStoreBillingPlugin extends Plugin implements PurchasesUpdatedListener {

    private static final String TAG = "PlayStoreBilling";
    private BillingClient billingClient;
    private PluginCall pendingCall;
    private String pendingProductId;
    private boolean isConnecting = false;
    private final List<PluginCall> pendingInitializeCalls = new ArrayList<>();
    private final List<ReadyAction> readyQueue = new ArrayList<>();
    // Tokens we've already broadcast so we don't double-fire purchaseCompleted
    private final Set<String> broadcastedTokens = new HashSet<>();

    private static class ReadyAction {
        final PluginCall call;
        final Runnable action;

        ReadyAction(PluginCall call, Runnable action) {
            this.call = call;
            this.action = action;
        }
    }

    @Override
    public void load() {
        super.load();
        createBillingClient();
        startBillingConnection(null);
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        // Whenever the app comes back to the foreground (e.g. after a Play UI
        // pending purchase finally clears), sweep for unconsumed purchases
        // and broadcast them so the WebView can verify+credit.
        sweepUnconsumedPurchases();
    }

    @PluginMethod
    public void initialize(PluginCall call) {
        startBillingConnection(call);
    }

    private void createBillingClient() {
        if (billingClient != null) return;
        billingClient = BillingClient.newBuilder(getContext())
            .setListener(this)
            .enablePendingPurchases()
            .build();
    }

    private void startBillingConnection(PluginCall call) {
        createBillingClient();

        if (billingClient.isReady()) {
            resolveInitialize(call, true, "BillingClient already connected");
            return;
        }

        if (call != null) pendingInitializeCalls.add(call);
        if (isConnecting) return;

        isConnecting = true;

        billingClient.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(BillingResult result) {
                isConnecting = false;
                Log.d(TAG, "Billing setup finished: " + result.getResponseCode());
                if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                    resolveAllInitialize(true, "BillingClient connected");
                    runReadyQueue();
                    // Auto-sweep on (re)connect: any purchase that finished while
                    // the app was killed/backgrounded gets re-broadcast.
                    sweepUnconsumedPurchases();
                } else {
                    rejectReadyQueue("Billing setup failed: " + result.getDebugMessage(), "BILLING_SETUP_FAILED");
                    rejectAllInitialize("Billing setup failed: " + result.getDebugMessage(), "BILLING_SETUP_FAILED");
                }
            }

            @Override
            public void onBillingServiceDisconnected() {
                isConnecting = false;
                Log.w(TAG, "Billing service disconnected");
            }
        });
    }

    private void resolveInitialize(PluginCall call, boolean success, String message) {
        if (call == null) return;
        JSObject ret = new JSObject();
        ret.put("success", success);
        ret.put("message", message);
        call.resolve(ret);
    }

    private void resolveAllInitialize(boolean success, String message) {
        for (PluginCall call : new ArrayList<>(pendingInitializeCalls)) {
            resolveInitialize(call, success, message);
        }
        pendingInitializeCalls.clear();
    }

    private void rejectAllInitialize(String message, String code) {
        for (PluginCall call : new ArrayList<>(pendingInitializeCalls)) {
            call.reject(message, code);
        }
        pendingInitializeCalls.clear();
    }

    private void runWhenReady(PluginCall call, Runnable action) {
        createBillingClient();
        if (billingClient.isReady()) {
            action.run();
            return;
        }

        readyQueue.add(new ReadyAction(call, action));
        startBillingConnection(null);
    }

    private void runReadyQueue() {
        for (ReadyAction item : new ArrayList<>(readyQueue)) {
            item.action.run();
        }
        readyQueue.clear();
    }

    private void rejectReadyQueue(String message, String code) {
        for (ReadyAction item : new ArrayList<>(readyQueue)) {
            item.call.reject(message, code);
        }
        readyQueue.clear();
        if (pendingCall != null) {
            pendingCall.reject(message, code);
            pendingCall = null;
            pendingProductId = null;
        }
    }

    @PluginMethod
    public void getProducts(PluginCall call) {
        runWhenReady(call, () -> queryProducts(call));
    }

    private void queryProducts(PluginCall call) {
        List<String> productIds = new ArrayList<>();
        try {
            org.json.JSONArray arr = call.getArray("productIds");
            for (int i = 0; i < arr.length(); i++) {
                productIds.add(arr.getString(i));
            }
        } catch (Exception e) {
            call.reject("Invalid productIds", e);
            return;
        }

        List<QueryProductDetailsParams.Product> products = new ArrayList<>();
        for (String id : productIds) {
            products.add(QueryProductDetailsParams.Product.newBuilder()
                .setProductId(id)
                .setProductType(BillingClient.ProductType.INAPP)
                .build());
        }

        QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
            .setProductList(products)
            .build();

        billingClient.queryProductDetailsAsync(params, (result, productDetailsList) -> {
            if (result.getResponseCode() == BillingClient.BillingResponseCode.OK && productDetailsList != null) {
                JSObject ret = new JSObject();
                org.json.JSONArray arr = new org.json.JSONArray();
                for (ProductDetails details : productDetailsList) {
                    JSObject item = new JSObject();
                    item.put("productId", details.getProductId());
                    item.put("title", details.getTitle());
                    item.put("name", details.getName());
                    item.put("description", details.getDescription());
                    if (details.getOneTimePurchaseOfferDetails() != null) {
                        item.put("price", details.getOneTimePurchaseOfferDetails().getFormattedPrice());
                        item.put("priceAmountMicros", details.getOneTimePurchaseOfferDetails().getPriceAmountMicros());
                        item.put("priceCurrencyCode", details.getOneTimePurchaseOfferDetails().getPriceCurrencyCode());
                    }
                    arr.put(item);
                }
                ret.put("products", arr);
                call.resolve(ret);
            } else {
                call.reject("Failed to query products: " + result.getDebugMessage(), "QUERY_PRODUCTS_FAILED");
            }
        });
    }

    @PluginMethod
    public void purchase(PluginCall call) {
        runWhenReady(call, () -> startPurchase(call));
    }

    private void startPurchase(PluginCall call) {
        String productId = call.getString("productId");
        if (productId == null) {
            call.reject("productId is required");
            return;
        }

        if (pendingCall != null) {
            call.reject("Another purchase is already in progress", "PURCHASE_IN_PROGRESS");
            return;
        }

        pendingCall = call;
        pendingProductId = productId;

        // STEP 1: Pre-check existing purchases. If the user already owns this
        // product (PURCHASED but unconsumed), resolve immediately with that
        // token instead of launching the billing flow (which would fail with
        // ITEM_ALREADY_OWNED and confuse the user).
        billingClient.queryPurchasesAsync(
            QueryPurchasesParams.newBuilder()
                .setProductType(BillingClient.ProductType.INAPP)
                .build(),
            (preResult, prePurchases) -> {
                if (preResult.getResponseCode() == BillingClient.BillingResponseCode.OK && prePurchases != null) {
                    for (Purchase p : prePurchases) {
                        if (p.getProducts().contains(productId)) {
                            if (p.getPurchaseState() == Purchase.PurchaseState.PURCHASED) {
                                Log.d(TAG, "Pre-existing PURCHASED found for " + productId + ", auto-resolving");
                                resolvePendingWithPurchase(p);
                                return;
                            }
                            if (p.getPurchaseState() == Purchase.PurchaseState.PENDING) {
                                Log.d(TAG, "Pre-existing PENDING found for " + productId);
                                if (pendingCall != null) {
                                    pendingCall.reject(
                                        "Your previous purchase is still pending in Google Play. It will be delivered automatically once Google approves it.",
                                        "PURCHASE_PENDING"
                                    );
                                    pendingCall = null;
                                    pendingProductId = null;
                                }
                                return;
                            }
                        }
                    }
                }
                // STEP 2: No deliverable existing purchase → launch the flow.
                launchBillingFlow(productId);
            }
        );
    }

    private void launchBillingFlow(String productId) {
        List<QueryProductDetailsParams.Product> products = new ArrayList<>();
        products.add(QueryProductDetailsParams.Product.newBuilder()
            .setProductId(productId)
            .setProductType(BillingClient.ProductType.INAPP)
            .build());

        QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
            .setProductList(products)
            .build();

        billingClient.queryProductDetailsAsync(params, (result, productDetailsList) -> {
            if (result.getResponseCode() == BillingClient.BillingResponseCode.OK
                    && productDetailsList != null && !productDetailsList.isEmpty()) {
                ProductDetails details = productDetailsList.get(0);
                List<BillingFlowParams.ProductDetailsParams> productDetailsParamsList = new ArrayList<>();
                productDetailsParamsList.add(BillingFlowParams.ProductDetailsParams.newBuilder()
                    .setProductDetails(details)
                    .build());

                BillingFlowParams flowParams = BillingFlowParams.newBuilder()
                    .setProductDetailsParamsList(productDetailsParamsList)
                    .build();

                BillingResult launchResult = billingClient.launchBillingFlow(getActivity(), flowParams);
                if (launchResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    if (launchResult.getResponseCode() == BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED) {
                        // Race: pre-check missed it. Try once more.
                        resolveExistingPurchaseForProduct(productId);
                        return;
                    }
                    if (pendingCall != null) {
                        pendingCall.reject("Purchase could not start: " + launchResult.getDebugMessage(), "BILLING_FLOW_FAILED");
                        pendingCall = null;
                        pendingProductId = null;
                    }
                }
            } else {
                if (pendingCall != null) {
                    pendingCall.reject("Product not found: " + productId, "PRODUCT_NOT_FOUND");
                    pendingCall = null;
                    pendingProductId = null;
                }
            }
        });
    }

    private void resolveExistingPurchaseForProduct(String productId) {
        billingClient.queryPurchasesAsync(
            QueryPurchasesParams.newBuilder()
                .setProductType(BillingClient.ProductType.INAPP)
                .build(),
            (result, purchases) -> {
                if (result.getResponseCode() == BillingClient.BillingResponseCode.OK && purchases != null) {
                    for (Purchase purchase : purchases) {
                        if (purchase.getProducts().contains(productId)
                                && purchase.getPurchaseState() == Purchase.PurchaseState.PURCHASED) {
                            resolvePendingWithPurchase(purchase);
                            return;
                        }
                    }
                }
                if (pendingCall != null) {
                    pendingCall.reject("You already own this item, but no deliverable purchase was found. Please reopen Recharge and try again.", "ITEM_ALREADY_OWNED");
                    pendingCall = null;
                    pendingProductId = null;
                }
            }
        );
    }

    private void resolvePendingWithPurchase(Purchase purchase) {
        if (pendingCall == null) return;
        JSObject ret = new JSObject();
        ret.put("success", true);
        ret.put("productId", purchase.getProducts().get(0));
        ret.put("purchaseToken", purchase.getPurchaseToken());
        ret.put("orderId", purchase.getOrderId());
        pendingCall.resolve(ret);
        pendingCall = null;
        pendingProductId = null;
        broadcastedTokens.add(purchase.getPurchaseToken());
    }

    /**
     * Fire purchaseCompleted/purchasePending events for ANY unconsumed purchase
     * found on the device. WebView listens and verifies them server-side.
     * Idempotent via broadcastedTokens set.
     */
    private void sweepUnconsumedPurchases() {
        if (billingClient == null || !billingClient.isReady()) return;
        billingClient.queryPurchasesAsync(
            QueryPurchasesParams.newBuilder()
                .setProductType(BillingClient.ProductType.INAPP)
                .build(),
            (result, purchases) -> {
                if (result.getResponseCode() != BillingClient.BillingResponseCode.OK || purchases == null) return;
                for (Purchase p : purchases) {
                    String token = p.getPurchaseToken();
                    if (token == null || broadcastedTokens.contains(token)) continue;

                    if (p.getPurchaseState() == Purchase.PurchaseState.PURCHASED) {
                        Log.d(TAG, "Sweep: broadcasting unconsumed PURCHASED " + p.getProducts().get(0));
                        broadcastedTokens.add(token);
                        final Purchase pp = p;
                        notifyListeners("purchaseCompleted", new JSObject() {{
                            put("productId", pp.getProducts().get(0));
                            put("purchaseToken", pp.getPurchaseToken());
                            put("orderId", pp.getOrderId());
                        }});
                    } else if (p.getPurchaseState() == Purchase.PurchaseState.PENDING) {
                        final Purchase pp = p;
                        notifyListeners("purchasePending", new JSObject() {{
                            put("productId", pp.getProducts().get(0));
                            put("purchaseToken", pp.getPurchaseToken());
                        }});
                    }
                }
            }
        );
    }

    @Override
    public void onPurchasesUpdated(BillingResult billingResult, List<Purchase> purchases) {
        int code = billingResult.getResponseCode();

        if (code == BillingClient.BillingResponseCode.OK && purchases != null) {
            for (Purchase purchase : purchases) {
                if (purchase.getPurchaseState() == Purchase.PurchaseState.PURCHASED) {
                    if (pendingCall != null) {
                        resolvePendingWithPurchase(purchase);
                    } else {
                        // No active call (app reopened mid-flow). Broadcast.
                        if (!broadcastedTokens.contains(purchase.getPurchaseToken())) {
                            broadcastedTokens.add(purchase.getPurchaseToken());
                            final Purchase pp = purchase;
                            notifyListeners("purchaseCompleted", new JSObject() {{
                                put("productId", pp.getProducts().get(0));
                                put("purchaseToken", pp.getPurchaseToken());
                                put("orderId", pp.getOrderId());
                            }});
                        }
                    }
                } else if (purchase.getPurchaseState() == Purchase.PurchaseState.PENDING) {
                    Log.d(TAG, "Purchase pending: " + purchase.getProducts().get(0));
                    final Purchase pp = purchase;
                    notifyListeners("purchasePending", new JSObject() {{
                        put("productId", pp.getProducts().get(0));
                        put("purchaseToken", pp.getPurchaseToken());
                    }});
                    if (pendingCall != null) {
                        pendingCall.reject(
                            "Your purchase is pending Google approval. It will auto-deliver once approved.",
                            "PURCHASE_PENDING"
                        );
                        pendingCall = null;
                        pendingProductId = null;
                    }
                }
            }
        } else if (code == BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED) {
            // Recover: query purchases and auto-resolve the matching one.
            String productId = pendingProductId;
            if (productId != null) {
                resolveExistingPurchaseForProduct(productId);
            } else if (pendingCall != null) {
                pendingCall.reject("Item already owned", "ITEM_ALREADY_OWNED");
                pendingCall = null;
                pendingProductId = null;
            }
        } else if (code == BillingClient.BillingResponseCode.USER_CANCELED) {
            if (pendingCall != null) {
                pendingCall.reject("Purchase cancelled by user", "USER_CANCELED");
                pendingCall = null;
                pendingProductId = null;
            }
        } else {
            if (pendingCall != null) {
                pendingCall.reject("Purchase failed: " + billingResult.getDebugMessage(), "PURCHASE_FAILED");
                pendingCall = null;
                pendingProductId = null;
            }
        }
    }

    @PluginMethod
    public void restorePurchases(PluginCall call) {
        runWhenReady(call, () -> queryExistingPurchases(call));
    }

    private void queryExistingPurchases(PluginCall call) {
        billingClient.queryPurchasesAsync(
            QueryPurchasesParams.newBuilder()
                .setProductType(BillingClient.ProductType.INAPP)
                .build(),
            (result, purchases) -> {
                JSObject ret = new JSObject();
                org.json.JSONArray arr = new org.json.JSONArray();
                if (purchases != null) {
                    for (Purchase p : purchases) {
                        // Only return PURCHASED — pending ones can't be verified yet.
                        if (p.getPurchaseState() != Purchase.PurchaseState.PURCHASED) continue;
                        JSObject item = new JSObject();
                        item.put("productId", p.getProducts().get(0));
                        item.put("purchaseToken", p.getPurchaseToken());
                        item.put("orderId", p.getOrderId());
                        arr.put(item);
                    }
                }
                ret.put("purchases", arr);
                call.resolve(ret);
            }
        );
    }
}
