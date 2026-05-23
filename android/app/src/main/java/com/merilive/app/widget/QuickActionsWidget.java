package com.merilive.app.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.widget.RemoteViews;

import com.merilive.app.MainActivity;
import com.merilive.app.R;

/**
 * Pkg250 — Quick Actions home screen widget.
 *
 * Three tap zones (Go Live / Chat / Wallet) launch MainActivity with a
 * `route` extra; existing handleNotificationRoute() forwards it to the
 * WebView. PendingIntent.FLAG_IMMUTABLE per Android 14+ requirement.
 *
 * Compatible with API 21+. Resizable (1x1 → 4x1). Includes a Refresh
 * action so the OS can poke the widget after data changes (not used yet
 * but kept for future "unread count" expansion).
 */
public class QuickActionsWidget extends AppWidgetProvider {

    public static final String ACTION_REFRESH = "com.merilive.app.widget.REFRESH";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] widgetIds) {
        for (int id : widgetIds) updateWidget(context, manager, id);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (ACTION_REFRESH.equals(intent.getAction())) {
            AppWidgetManager m = AppWidgetManager.getInstance(context);
            int[] ids = m.getAppWidgetIds(new ComponentName(context, QuickActionsWidget.class));
            for (int id : ids) updateWidget(context, m, id);
        }
    }

    /** Bump every widget — call from JS via WidgetBridge if you ever add live counters. */
    public static void requestRefresh(Context ctx) {
        Intent i = new Intent(ctx, QuickActionsWidget.class);
        i.setAction(ACTION_REFRESH);
        ctx.sendBroadcast(i);
    }

    private void updateWidget(Context ctx, AppWidgetManager manager, int widgetId) {
        RemoteViews views = new RemoteViews(ctx.getPackageName(), R.layout.widget_quick_actions);

        views.setOnClickPendingIntent(R.id.widget_go_live, routePI(ctx, "/go-live", 1001));
        views.setOnClickPendingIntent(R.id.widget_chat,    routePI(ctx, "/chat",    1002));
        views.setOnClickPendingIntent(R.id.widget_wallet,  routePI(ctx, "/recharge",1003));

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
