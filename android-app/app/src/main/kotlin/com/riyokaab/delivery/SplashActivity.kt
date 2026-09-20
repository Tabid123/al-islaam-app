package com.riyokaab.delivery

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.lifecycle.lifecycleScope
import com.riyokaab.delivery.auth.AuthRepository
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

class SplashActivity : ComponentActivity() {

    companion object {
        private const val SPLASH_DELAY_MS = 1200L
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        lifecycleScope.launch {
            delay(SPLASH_DELAY_MS)

            val auth = AuthRepository(applicationContext)
            // Session-ka dhacay MA aha sabab log out: marka hore refresh isku day.
            val signedIn = auth.isLoggedIn() || auth.ensureValidSession()

            val next = if (signedIn) {
                Intent(this@SplashActivity, MainActivity::class.java)
            } else {
                Intent(this@SplashActivity, LoginActivity::class.java)
            }
            startActivity(next)
            finish()
        }
    }
}
