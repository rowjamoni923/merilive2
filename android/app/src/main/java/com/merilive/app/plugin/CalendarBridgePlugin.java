package com.merilive.app.plugin;

import android.content.Intent;
import android.provider.CalendarContract;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Pkg263 — Calendar add-event bridge.
 *
 * Permission-free: uses ACTION_INSERT against CalendarContract.Events so the
 * user's own calendar app (Google Calendar / Samsung Calendar / Outlook)
 * opens with the event pre-filled. User taps Save → event lands in their
 * calendar with a reminder. No READ_/WRITE_CALENDAR permission needed.
 *
 * Use cases: scheduled live shows, PK battle start time, party events,
 * tournament rounds, host go-live reminders.
 */
@CapacitorPlugin(name = "CalendarBridge")
public class CalendarBridgePlugin extends Plugin {

    @PluginMethod
    public void addEvent(PluginCall call) {
        String title = call.getString("title");
        if (title == null || title.isEmpty()) {
            call.reject("title is required");
            return;
        }
        Long beginTime = call.getLong("beginTime");      // epoch ms
        Long endTime = call.getLong("endTime");          // epoch ms (optional, defaults +1h)
        String description = call.getString("description", "");
        String location = call.getString("location", "");
        Boolean allDay = call.getBoolean("allDay", false);
        Integer reminderMinutes = call.getInt("reminderMinutes", 15);

        if (beginTime == null) {
            call.reject("beginTime is required (epoch ms)");
            return;
        }
        if (endTime == null) {
            endTime = beginTime + 60L * 60L * 1000L;
        }

        try {
            Intent intent = new Intent(Intent.ACTION_INSERT)
                .setData(CalendarContract.Events.CONTENT_URI)
                .putExtra(CalendarContract.Events.TITLE, title)
                .putExtra(CalendarContract.Events.DESCRIPTION, description)
                .putExtra(CalendarContract.Events.EVENT_LOCATION, location)
                .putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, beginTime.longValue())
                .putExtra(CalendarContract.EXTRA_EVENT_END_TIME, endTime.longValue())
                .putExtra(CalendarContract.EXTRA_EVENT_ALL_DAY, allDay != null && allDay)
                .putExtra(CalendarContract.Reminders.MINUTES, reminderMinutes != null ? reminderMinutes : 15)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

            if (intent.resolveActivity(getContext().getPackageManager()) == null) {
                call.reject("No calendar app installed");
                return;
            }

            getContext().startActivity(intent);
            JSObject ret = new JSObject();
            ret.put("launched", true);
            call.resolve(ret);
        } catch (Throwable t) {
            call.reject("calendar add failed: " + t.getMessage(), t);
        }
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        Intent test = new Intent(Intent.ACTION_INSERT).setData(CalendarContract.Events.CONTENT_URI);
        boolean ok = test.resolveActivity(getContext().getPackageManager()) != null;
        JSObject ret = new JSObject();
        ret.put("available", ok);
        call.resolve(ret);
    }
}
