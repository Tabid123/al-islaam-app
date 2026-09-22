package com.alislaam.delivery

import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.lifecycle.lifecycleScope
import com.alislaam.delivery.auth.AuthRepository
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

class SplashActivity : ComponentActivity() {

    companion object {
        private const val SPLASH_DELAY_MS = 1200L
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Haddii crash hore dhacay, tus qoraalka si loo ogaado sababta.
        try {
            val crashPrefs = getSharedPreferences("alislaam_crash", MODE_PRIVATE)
            val last = crashPrefs.getString("last_crash", null)
            if (!last.isNullOrBlank()) {
                crashPrefs.edit().remove("last_crash").apply()
                Toast.makeText(this, "Khalad hore: ${last.take(180)}", Toast.LENGTH_LONG).show()
            }
        } catch (_: Throwable) { }

        lifecycleScope.launch {
            var signedIn = false
            try {
                delay(SPLASH_DELAY_MS)
                val auth = AuthRepository(applicationContext)
                // Session-ka dhacay MA aha sabab log out: marka hore refresh isku day.
                signedIn = auth.isLoggedIn() || auth.ensureValidSession()
            } catch (e: Throwable) {
                // Ha xirmin app-ka — u gudub login-ka.
                android.util.Log.e("SplashActivity", "Startup error: ${e.message}", e)
                signedIn = false
            }

            val next = if (signedIn) {
                Intent(this@SplashActivity, MainActivity::class.java)
            } else {
                Intent(this@SplashActivity, LoginActivity::class.java)
            }
            try {
                startActivity(next)
                finish()
            } catch (e: Throwable) {
                android.util.Log.e("SplashActivity", "Navigation error: ${e.message}", e)
            }
        }
    }
}
