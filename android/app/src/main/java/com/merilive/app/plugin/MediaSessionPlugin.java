package com.merilive.app.plugin;

import android.app.PendingIntent;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Build;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;
import androidx.core.app.NotificationCompat;
import androidx.media.app.NotificationCompat.MediaStyle;
import androidx.media.session.MediaButtonReceiver;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.merilive.app.MainActivity;
import com.merilive.app.R;
import com.merilive.app.util.NotificationHelper;

import java.io.InputStream;
import java.net.URL;

/**
 * Pkg257 — MediaSession + lock-screen playback controls.
 * One session per app instance. JS owns playback; plugin reflects state to
 * the OS (lock screen, Bluetooth headset, Wear OS, Android Auto, Assistant).
 */
@CapacitorPlugin(name = "MediaSession")
public class MediaSessionPlugin extends Plugin {

    private static final int NOTIF_ID = 71257;
    private MediaSessionCompat session;

    @Override
    public void load() {
        session = new MediaSessionCompat(getContext(), "MeriLiveMedia");
        session.setFlags(
            MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS
                | MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS
        );

        Intent activityIntent = new Intent(getContext(), MainActivity.class);
        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT
            | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                ? PendingIntent.FLAG_IMMUTABLE : 0);
        session.setSessionActivity(
            PendingIntent.getActivity(getContext(), 0, activityIntent, piFlags)
        );

        session.setCallback(new MediaSessionCompat.Callback() {
            @Override public void onPlay() { emit("play"); }
            @Override public void onPause() { emit("pause"); }
            @Override public void onStop() { emit("stop"); }
            @Override public void onSkipToNext() { emit("next"); }
            @Override public void onSkipToPrevious() { emit("previous"); }
            @Override public void onSeekTo(long pos) {
                JSObject d = new JSObject(); d.put("position", pos);
                notifyListeners("action", action("seek", d));
            }
        });
    }

    private void emit(String action) {
        notifyListeners("action", action(action, null));
    }

    private JSObject action(String action, JSObject extra) {
        JSObject o = new JSObject();
        o.put("action", action);
        if (extra != null) o.put("data", extra);
        return o;
    }

    @PluginMethod
    public void setMetadata(PluginCall call) {
        String title = call.getString("title", "");
        String artist = call.getString("artist", "");
        String album = call.getString("album", "");
        long duration = call.getLong("duration", 0L);
        String artworkUrl = call.getString("artworkUrl", null);

        MediaMetadataCompat.Builder b = new MediaMetadataCompat.Builder()
            .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
            .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist)
            .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, album)
            .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, duration);

        if (artworkUrl != null && !artworkUrl.isEmpty()) {
            new Thread(() -> {
                try {
                    InputStream is = (InputStream) new URL(artworkUrl).getContent();
                    Bitmap bmp = BitmapFactory.decodeStream(is);
                    if (bmp != null) {
                        b.putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, bmp);
                    }
                } catch (Exception ignored) {}
                android.app.Activity act = getActivity();
                if (act != null && !act.isFinishing()) {
                    act.runOnUiThread(() -> {
                        if (session != null) session.setMetadata(b.build());
                    });
                }
            }).start();
        } else {
            session.setMetadata(b.build());
        }
        call.resolve();
    }

    @PluginMethod
    public void setPlaybackState(PluginCall call) {
        String state = call.getString("state", "paused"); // playing | paused | stopped | buffering
        long position = call.getLong("position", 0L);
        float speed = call.getFloat("speed", 1.0f);

        int s;
        switch (state) {
            case "playing": s = PlaybackStateCompat.STATE_PLAYING; break;
            case "buffering": s = PlaybackStateCompat.STATE_BUFFERING; break;
            case "stopped": s = PlaybackStateCompat.STATE_STOPPED; break;
            default: s = PlaybackStateCompat.STATE_PAUSED;
        }

        PlaybackStateCompat ps = new PlaybackStateCompat.Builder()
            .setActions(
                PlaybackStateCompat.ACTION_PLAY
                    | PlaybackStateCompat.ACTION_PAUSE
                    | PlaybackStateCompat.ACTION_PLAY_PAUSE
                    | PlaybackStateCompat.ACTION_STOP
                    | PlaybackStateCompat.ACTION_SEEK_TO
                    | PlaybackStateCompat.ACTION_SKIP_TO_NEXT
                    | PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS
            )
            .setState(s, position, speed)
            .build();
        session.setPlaybackState(ps);
        session.setActive(s == PlaybackStateCompat.STATE_PLAYING
            || s == PlaybackStateCompat.STATE_BUFFERING
            || s == PlaybackStateCompat.STATE_PAUSED);
        call.resolve();
    }

    @PluginMethod
    public void release(PluginCall call) {
        if (session != null) {
            session.setActive(false);
            session.release();
            session = null;
        }
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        if (session != null) {
            try { session.setActive(false); } catch (Exception ignored) {}
            try { session.release(); } catch (Exception ignored) {}
            session = null;
        }
        super.handleOnDestroy();
    }
}
