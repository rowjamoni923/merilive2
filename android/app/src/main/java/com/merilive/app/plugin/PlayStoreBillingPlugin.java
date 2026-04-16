package com.merilive.app.plugin;

import android.util.Log;
import com.android.billingclient.api.*;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.List;

@CapacitorPlugin(name = "PlayStoreBilling")
public class PlayStoreBillingPlugin extends Plugin implements PurchasesUpdatedListener {

    private static final String TAG = "PlayStoreBilling";
    private BillingClient billingClient;
    private PluginCall pendingCall;

    @Override
    public void load() {
        billingClient = BillingClient.newBuilder(getContext())
            .setListener(this)
            .enablePendingPurchases()
            .build();

        billingClient.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(BillingResult result) {
                Log.d(TAG, "Billing setup finished: " + result.getResponseCode());
            }

            @Override
            public void onBillingServiceDisconnected() {
                Log.w(TAG, "Billing service disconnected");
            }
        });
    }

    @PluginMethod
    public void getProducts(PluginCall call) {
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
                    item.put("name", details.getName());
                    item.put("description", details.getDescription());
                    if (details.getOneTimePurchaseOfferDetails() != null) {
                        item.put("price", details.getOneTimePurchaseOfferDetails().getFormattedPrice());
                        item.put("priceMicros", details.getOneTimePurchaseOfferDetails().getPriceAmountMicros());
                        item.put("currency", details.getOneTimePurchaseOfferDetails().getPriceCurrencyCode());
                    }
                    arr.put(item);
                }
                ret.put("products", arr);
                call.resolve(ret);
            } else {
                call.reject("Failed to query products: " + result.getDebugMessage());
            }
        });
    }

    @PluginMethod
    public void purchaseProduct(PluginCall call) {
        String productId = call.getString("productId");
        if (productId == null) {
            call.reject("productId is required");
            return;
        }

        pendingCall = call;

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

                billingClient.launchBillingFlow(getActivity(), flowParams);
            } else {
                call.reject("Product not found: " + productId);
                pendingCall = null;
            }
        });
    }

    @Override
    public void onPurchasesUpdated(BillingResult billingResult, List<Purchase> purchases) {
        if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK && purchases != null) {
            for (Purchase purchase : purchases) {
                // Acknowledge or consume
                if (purchase.getPurchaseState() == Purchase.PurchaseState.PURCHASED) {
                    ConsumeParams consumeParams = ConsumeParams.newBuilder()
                        .setPurchaseToken(purchase.getPurchaseToken())
                        .build();

                    billingClient.consumeAsync(consumeParams, (result, token) -> {
                        Log.d(TAG, "Purchase consumed: " + result.getResponseCode());
                    });

                    if (pendingCall != null) {
                        JSObject ret = new JSObject();
                        ret.put("success", true);
                        ret.put("productId", purchase.getProducts().get(0));
                        ret.put("purchaseToken", purchase.getPurchaseToken());
                        ret.put("orderId", purchase.getOrderId());
                        pendingCall.resolve(ret);
                        pendingCall = null;
                    }

                    // Notify WebView
                    notifyListeners("purchaseCompleted", new JSObject() {{
                        put("productId", purchase.getProducts().get(0));
                        put("purchaseToken", purchase.getPurchaseToken());
                        put("orderId", purchase.getOrderId());
                    }});
                }
            }
        } else if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.USER_CANCELED) {
            if (pendingCall != null) {
                pendingCall.reject("Purchase cancelled by user");
                pendingCall = null;
            }
        } else {
            if (pendingCall != null) {
                pendingCall.reject("Purchase failed: " + billingResult.getDebugMessage());
                pendingCall = null;
            }
        }
    }

    @PluginMethod
    public void restorePurchases(PluginCall call) {
        billingClient.queryPurchasesAsync(
            QueryPurchasesParams.newBuilder()
                .setProductType(BillingClient.ProductType.INAPP)
                .build(),
            (result, purchases) -> {
                JSObject ret = new JSObject();
                org.json.JSONArray arr = new org.json.JSONArray();
                if (purchases != null) {
                    for (Purchase p : purchases) {
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
