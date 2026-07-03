package com.merilive.app.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.view.View;
import android.widget.RemoteViews;

import com.merilive.app.MainActivity;
import com.merilive.app.R;

/**
 * Pkg250 + Pkg252 — Quick Actions home screen widget.
 *
 * Three tap zones (Go Live / Chat / Wallet) launch MainActivity with a
 * `route` extra; existing handleNotificationRoute() forwards it to the
 * WebView. PendingIntent.FLAG_IMMUTABLE per Android 14+ requirement.
 *
 * Pkg252: live unread-count badge on the Chat slot, fed by
 * BackgroundSyncWorker (Pkg221) and JS foreground bridge
 * (BackgroundSyncPlugin.setUnreadCount).
 *
 * Compatible with API 21+. Resizable (1x1 → 4x1).
 */
public class QuickActionsWidget extends AppWidgetProvider {

    public static final String ACTION_REFRESH = "com.merilive.app.widget.REFRESH";
    /** Same SharedPreferences file used by Pkg221 BackgroundSyncPlugin/Worker. */
    private static final String PREFS = "merilive_bg_sync";
    private static final String KEY_UNREAD = "last_unread_total";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] widgetIds) {
        for (int id : widgetIds) updateWidget(context, manager, id);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (ACTION_REFRESH.equals(intent.getAction())) {
            refreshAll(context);
        }
    }

    /** Bump every widget — call after writing a new unread count to prefs. */
    public static void requestRefresh(Context ctx) {
        Intent i = new Intent(ctx, QuickActionsWidget.class);
        i.setAction(ACTION_REFRESH);
        ctx.sendBroadcast(i);
    }

    /**
     * Write the unread total to shared prefs and re-render every widget instance.
     * Called by BackgroundSyncWorker (periodic) and from JS via
     * BackgroundSyncPlugin.setUnreadCount (foreground).
     */
    public static void updateUnreadCount(Context ctx, int count) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit().putInt(KEY_UNREAD, Math.max(0, count)).apply();
        refreshAll(ctx);
    }

    private static void refreshAll(Context ctx) {
        AppWidgetManager m = AppWidgetManager.getInstance(ctx);
        ComponentName cn = new ComponentName(ctx, QuickActionsWidget.class);
        int[] ids = m.getAppWidgetIds(cn);
        if (ids == null || ids.length == 0) return;
        QuickActionsWidget w = new QuickActionsWidget();
        for (int id : ids) w.updateWidget(ctx, m, id);
    }

    private void updateWidget(Context ctx, AppWidgetManager manager, int widgetId) {
        RemoteViews views = new RemoteViews(ctx.getPackageName(), R.layout.widget_quick_actions);

        views.setOnClickPendingIntent(R.id.widget_go_live, routePI(ctx, "/go-live", 1001));
        views.setOnClickPendingIntent(R.id.widget_chat,    routePI(ctx, "/chat",    1002));
        views.setOnClickPendingIntent(R.id.widget_wallet,  routePI(ctx, "/recharge",1003));

        // Unread badge
        SharedPreferences prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        int unread = prefs.getInt(KEY_UNREAD, 0);
        if (unread > 0) {
            String label = unread > 99 ? "99+" : String.valueOf(unread);
            views.setTextViewText(R.id.widget_chat_badge, label);
            views.setViewVisibility(R.id.widget_chat_badge, View.VISIBLE);
        } else {
            views.setViewVisibility(R.id.widget_chat_badge, View.GONE);
        }

        manager.updateAppWidget(widgetId, views);
    }

    private PendingIntent routePI(Context ctx, String route, int reqCode) {
        Intent i = new Intent(ctx, MainActivity.class);
        i.setAction(Intent.ACTION_VIEW);
        i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        i.putExtra("route", route);
        // Unique data URI so PendingIntent doesn't get reused across routes
        i.setData(Uri.parse("merilive://widget" + route));
        return PendingIntent.getActivity(ctx, reqCode, i,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
