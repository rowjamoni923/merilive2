package com.merilive.app.util

import android.content.Context
import android.os.Bundle
import com.google.firebase.analytics.FirebaseAnalytics

/**
 * Analytics tracker for user events
 */
object AnalyticsTracker {
    private var firebaseAnalytics: FirebaseAnalytics? = null

    fun init(context: Context) {
        firebaseAnalytics = FirebaseAnalytics.getInstance(context)
    }

    fun trackEvent(eventName: String, params: Map<String, String> = emptyMap()) {
        val bundle = Bundle().apply {
            params.forEach { (key, value) -> putString(key, value) }
        }
        firebaseAnalytics?.logEvent(eventName, bundle)
    }

    fun trackScreenView(screenName: String) {
        trackEvent(FirebaseAnalytics.Event.SCREEN_VIEW, mapOf(
            FirebaseAnalytics.Param.SCREEN_NAME to screenName,
        ))
    }

    fun trackGiftSent(giftId: String, diamonds: Long, receiverId: String) {
        trackEvent("gift_sent", mapOf(
            "gift_id" to giftId,
            "diamonds" to diamonds.toString(),
            "receiver_id" to receiverId,
        ))
    }

    fun trackCallStarted(callType: String, receiverId: String) {
        trackEvent("call_started", mapOf(
            "call_type" to callType,
            "receiver_id" to receiverId,
        ))
    }

    fun trackRecharge(packageId: String, amount: Double) {
        trackEvent("recharge", mapOf(
            "package_id" to packageId,
            "amount" to amount.toString(),
        ))
    }

    fun trackGamePlay(gameKey: String, betAmount: Long, winAmount: Long) {
        trackEvent("game_play", mapOf(
            "game_key" to gameKey,
            "bet_amount" to betAmount.toString(),
            "win_amount" to winAmount.toString(),
        ))
    }

    fun trackLiveStream(action: String, roomId: String) {
        trackEvent("live_stream", mapOf(
            "action" to action,
            "room_id" to roomId,
        ))
    }

    fun setUserId(userId: String) {
        firebaseAnalytics?.setUserId(userId)
    }

    fun setUserProperty(key: String, value: String) {
        firebaseAnalytics?.setUserProperty(key, value)
    }
}