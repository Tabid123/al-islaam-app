package com.riyokaab.delivery.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.riyokaab.delivery.api.DeliveryApiClient
import com.riyokaab.delivery.data.DeliveryDatabase
import com.riyokaab.delivery.service.UssdAccessibilityService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Bridges a late terminal carrier dialog back to the delivery API.
 *
 * Interactive USSD flows can outlive UssdDialerService.processOrder(): the dialer
 * reports the row as "processing", then AccessibilityService receives the terminal
 * carrier dialog a few seconds later. This receiver waits for that terminal result,
 * finds the most recent local task that is still processing, and finalizes exactly
 * that queue row. It never retries/dials USSD.
 */
class UssdFinalResultReceiver : BroadcastReceiver() {
    companion object {
        private const val TAG = "UssdFinalResult"
        private const val MAX_WAIT_MS = 60_000L
        private const val POLL_MS = 250L
        private const val TASK_MAX_AGE_MS = 5 * 60_000L

        private val successKeywords = listOf(
            "ugu shubtay", "u shubtay", "e-voucher", "haraagaagu waa",
            "success", "successful", "completed", "approved", "activated",
            "ku guulaysatay", "ku guuleysatay", "transaction id", "transcation id",
            "dhammays", "abaal"
        )

        private val failureKeywords = listOf(
            "khalad", "failed", "error", "rejected", "insufficient", "invalid",
            "denied", "declined", "cancelled", "canceled", "service error",
            "try again", "temporarily", "unavailable", "not available"
        )
    }

    override fun onReceive(context: Context, intent: Intent?) {
        if (intent?.action != UssdAccessibilityService.ACTION_USSD_CLICK_COMPLETE) return

        val pendingResult = goAsync()
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            try {
                val db = DeliveryDatabase.getInstance(context.applicationContext)
                val now = System.currentTimeMillis()
                val task = db.deliveryTaskDao().getRecentTasks().firstOrNull {
                    it.status == "processing" && now - it.createdAt <= TASK_MAX_AGE_MS
                }

                if (task == null) {
                    Log.d(TAG, "No recent interactive processing task to finalize")
                    return@launch
                }

                val prefs = context.getSharedPreferences(
                    UssdAccessibilityService.PREFS_NAME,
                    Context.MODE_PRIVATE
                )

                var finalText: String? = null
                var waited = 0L
                while (waited <= MAX_WAIT_MS) {
                    val text = prefs.getString(UssdAccessibilityService.KEY_LAST_USSD_FINAL_RESULT, null)
                    val ts = prefs.getLong(UssdAccessibilityService.KEY_LAST_USSD_FINAL_RESULT_TIME, 0L)
                    // Reject a stale carrier result from the previous delivery.
                    if (!text.isNullOrBlank() && ts >= task.createdAt - 5_000L) {
                        finalText = text
                        break
                    }
                    delay(POLL_MS)
                    waited += POLL_MS
                }

                val terminalText = finalText?.takeIf { it.isNotBlank() }
                if (terminalText == null) {
                    Log.w(TAG, "No terminal carrier result for queue=${task.id}; leaving processing for server safety sweep")
                    return@launch
                }

                val lower = terminalText.lowercase()
                val status = when {
                    successKeywords.any { lower.contains(it) } -> "completed"
                    failureKeywords.any { lower.contains(it) } -> "failed"
                    else -> {
                        // Unknown text is not enough proof of delivery or failure.
                        Log.w(TAG, "Ambiguous terminal text for queue=${task.id}; not finalizing: ${terminalText.take(120)}")
                        return@launch
                    }
                }

                val api = DeliveryApiClient()
                val ok = api.updateDeliveryStatus(
                    queueId = task.id,
                    status = status,
                    errorMessage = if (status == "failed") "Provider final response indicates failure" else null,
                    providerResponse = terminalText
                )

                if (ok) {
                    db.deliveryTaskDao().updateStatus(task.id, status)
                    prefs.edit()
                        .remove(UssdAccessibilityService.KEY_LAST_USSD_FINAL_RESULT)
                        .remove(UssdAccessibilityService.KEY_LAST_USSD_FINAL_RESULT_TIME)
                        .apply()
                    Log.d(TAG, "Finalized queue=${task.id} as $status from late carrier result")
                } else {
                    Log.w(TAG, "Server rejected final status for queue=${task.id}; keeping local processing state")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Late USSD finalization failed: ${e.message}", e)
            } finally {
                pendingResult.finish()
            }
        }
    }
}
