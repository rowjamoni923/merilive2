package com.merilive.app.plugin;

import android.content.Context;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Pkg255 — Shake detector.
 *
 * Lightweight accelerometer-based shake detector. Emits "shake" event when
 * three sharp acceleration spikes happen within 1.5s. Used to trigger the
 * feedback / bug-report dialog (parity with Google Maps, Gmail, Discord).
 *
 * Threshold ~12 m/s^2 over gravity, cooldown 1s to avoid double-fire.
 */
@CapacitorPlugin(name = "ShakeDetector")
public class ShakeDetectorPlugin extends Plugin implements SensorEventListener {

    private static final float SHAKE_THRESHOLD_GFORCE = 2.4f; // ~24 m/s^2 = brisk shake
    private static final long SHAKE_WINDOW_MS = 1500L;
    private static final long SHAKE_COOLDOWN_MS = 1500L;
    private static final int REQUIRED_SPIKES = 3;

    private SensorManager sensorManager;
    private Sensor accelerometer;
    private boolean listening = false;
    private long lastShakeAt = 0L;
    private long firstSpikeAt = 0L;
    private int spikeCount = 0;

    @PluginMethod
    public void start(PluginCall call) {
        try {
            if (listening) { call.resolve(); return; }
            Context ctx = getContext();
            sensorManager = (SensorManager) ctx.getSystemService(Context.SENSOR_SERVICE);
            if (sensorManager == null) { call.reject("no sensor service"); return; }
            accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
            if (accelerometer == null) { call.reject("no accelerometer"); return; }
            sensorManager.registerListener(this, accelerometer, SensorManager.SENSOR_DELAY_UI);
            listening = true;
            call.resolve();
        } catch (Throwable t) { call.reject(t.getMessage() == null ? "start failed" : t.getMessage()); }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        try {
            if (listening && sensorManager != null) sensorManager.unregisterListener(this);
            listening = false;
            spikeCount = 0;
            firstSpikeAt = 0L;
            call.resolve();
        } catch (Throwable t) { call.reject(t.getMessage() == null ? "stop failed" : t.getMessage()); }
    }

    @Override
    protected void handleOnDestroy() {
        try {
            if (sensorManager != null) sensorManager.unregisterListener(this);
        } catch (Throwable ignored) {}
        listening = false;
        super.handleOnDestroy();
    }

    @Override
    protected void handleOnPause() {
        super.handleOnPause();
        if (listening && sensorManager != null) sensorManager.unregisterListener(this);
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        if (listening && sensorManager != null && accelerometer != null) {
            sensorManager.registerListener(this, accelerometer, SensorManager.SENSOR_DELAY_UI);
        }
    }

    @Override
    public void onSensorChanged(SensorEvent event) {
        if (event.sensor.getType() != Sensor.TYPE_ACCELEROMETER) return;
        float x = event.values[0], y = event.values[1], z = event.values[2];
        float gX = x / SensorManager.GRAVITY_EARTH;
        float gY = y / SensorManager.GRAVITY_EARTH;
        float gZ = z / SensorManager.GRAVITY_EARTH;
        double gForce = Math.sqrt(gX * gX + gY * gY + gZ * gZ);

        if (gForce > SHAKE_THRESHOLD_GFORCE) {
            long now = System.currentTimeMillis();
            if (now - lastShakeAt < SHAKE_COOLDOWN_MS) return;
            if (firstSpikeAt == 0L || now - firstSpikeAt > SHAKE_WINDOW_MS) {
                firstSpikeAt = now;
                spikeCount = 1;
                return;
            }
            spikeCount++;
            if (spikeCount >= REQUIRED_SPIKES) {
                lastShakeAt = now;
                spikeCount = 0;
                firstSpikeAt = 0L;
                JSObject data = new JSObject();
                data.put("gForce", gForce);
                data.put("at", now);
                notifyListeners("shake", data);
            }
        }
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) { /* no-op */ }
}
