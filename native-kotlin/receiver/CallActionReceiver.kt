package com.merilive.app.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.merilive.app.service.IncomingCallService

class CallActionReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "CallActionReceiver"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action
        val callId = intent.getStringExtra("call_id")

        Log.d(TAG, "Received action: $action for call: $callId")

        if ("com.merilive.app.ACTION_DECLINE_CALL" == action) {
            // Stop the incoming call service
            val stopIntent = Intent(context, IncomingCallService::class.java).apply {
                this.action = IncomingCallService.ACTION_STOP_CALL
            }
            context.stopService(stopIntent)

            // Broadcast to close any UI
            val closeIntent = Intent("com.merilive.app.CLOSE_INCOMING_CALL").apply {
                putExtra("call_id", callId)
            }
            context.sendBroadcast(closeIntent)
        }
    }
}
