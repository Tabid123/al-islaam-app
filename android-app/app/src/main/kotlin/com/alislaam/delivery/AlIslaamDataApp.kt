package com.alislaam.delivery

import android.app.Application
import android.content.Intent
import android.os.Build
import androidx.work.*
import com.alislaam.delivery.service.UssdDialerService
import com.alislaam.delivery.worker.ServiceWatchdogWorker
import com.alislaam.delivery.worker.UssdPollingWorker
import java.util.concurrent.TimeUnit

class AlIslaamDataApp : Application() {
    
    companion object {
        private const val POLLING_WORK_NAME = "ussd_polling_work"
        private const val WATCHDOG_WORK_NAME = "service_watchdog_work"
    }
    
    override fun onCreate() {
        super.onCreate()

        // Kaydi khaladka ugu dambeeyay si markii xigta loo tuso (crash silent ah ka hortag).
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, error ->
            try {
                getSharedPreferences("alislaam_crash", MODE_PRIVATE).edit()
                    .putString("last_crash", "${error::class.java.simpleName}: ${error.message}")
                    .commit()
            } catch (_: Throwable) { }
            previous?.uncaughtException(thread, error)
        }
        
        
        // DO NOT start foreground service here - Android 12+ (especially 16) 
        // crashes when starting foreground services from Application.onCreate()
        // The service is started from MainActivity after permissions are granted
        
        android.util.Log.d("AlIslaamApp", "✅ App started - service will be launched from MainActivity")
        
        try {
            scheduleReliablePolling()
        } catch (e: Throwable) {
            android.util.Log.e("AlIslaamApp", "Worker scheduling failed: ${e.message}")
        }
        
        android.util.Log.d("AlIslaamApp", "✅ All workers scheduled")
    }
    
    private fun scheduleReliablePolling() {
        val workManager = WorkManager.getInstance(this)
        
        val pollingConstraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()
        
        val pollingRequest = PeriodicWorkRequestBuilder<UssdPollingWorker>(
            15, TimeUnit.MINUTES
        )
            .setConstraints(pollingConstraints)
            .setInitialDelay(1, TimeUnit.MINUTES)
            .setBackoffCriteria(
                BackoffPolicy.EXPONENTIAL,
                1, TimeUnit.MINUTES
            )
            .build()
        
        workManager.enqueueUniquePeriodicWork(
            POLLING_WORK_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
            pollingRequest
        )
        
        android.util.Log.d("AlIslaamApp", "📅 UssdPollingWorker scheduled (every 15 min)")
        
        val watchdogRequest = PeriodicWorkRequestBuilder<ServiceWatchdogWorker>(
            15, TimeUnit.MINUTES
        )
            .setInitialDelay(2, TimeUnit.MINUTES)
            .setBackoffCriteria(
                BackoffPolicy.EXPONENTIAL,
                1, TimeUnit.MINUTES
            )
            .build()
        
        workManager.enqueueUniquePeriodicWork(
            WATCHDOG_WORK_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
            watchdogRequest
        )
        
        android.util.Log.d("AlIslaamApp", "🐕 ServiceWatchdogWorker scheduled (every 15 min)")
    }
}
