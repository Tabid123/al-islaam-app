package com.alislaam.delivery.auth

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.alislaam.delivery.api.DeliveryApiClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

/**
 * Handles Supabase Auth (email + password) for the delivery APK.
 *
 * Uses the SAME admin accounts as the web dashboard. After successful login,
 * we verify the user has the `admin` or `super_admin` role via the existing
 * `is_admin(uuid)` SECURITY DEFINER function exposed by PostgREST.
 *
 * Session (access_token + refresh_token) is persisted in EncryptedSharedPreferences.
 */
class AuthRepository(context: Context) {

    companion object {
        private const val PREFS_NAME = "alislaam_auth_secure"
        private const val KEY_ACCESS_TOKEN = "access_token"
        private const val KEY_REFRESH_TOKEN = "refresh_token"
        private const val KEY_USER_ID = "user_id"
        private const val KEY_EMAIL = "email"
        private const val KEY_EXPIRES_AT = "expires_at"

        private const val AUTH_URL = "https://iwdtpouuxbzqhcqhujfv.supabase.co/auth/v1"
        private const val REST_URL = "https://iwdtpouuxbzqhcqhujfv.supabase.co/rest/v1"

        private val JSON = "application/json; charset=utf-8".toMediaType()
    }

    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    private val prefs = EncryptedSharedPreferences.create(
        context,
        PREFS_NAME,
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    private val http = DeliveryApiClient.sharedHttpClient
    private val anonKey: String = DeliveryApiClient().getAnonKey()

    data class LoginResult(
        val success: Boolean,
        val errorMessage: String? = null,
        val isAdmin: Boolean = false
    )

    /** Returns true if a valid (non-expired) session is stored. */
    fun isLoggedIn(): Boolean {
        val token = prefs.getString(KEY_ACCESS_TOKEN, null) ?: return false
        val expiresAt = prefs.getLong(KEY_EXPIRES_AT, 0L)
        // Allow 30s clock skew
        return token.isNotBlank() && expiresAt > (System.currentTimeMillis() / 1000) + 30
    }

    /** Waa jiraa session la kaydiyay (xitaa hadduu access token-ku dhacay). */
    fun hasStoredSession(): Boolean =
        !prefs.getString(KEY_REFRESH_TOKEN, null).isNullOrBlank()

    /**
     * Cusbooneysii session-ka adigoo isticmaalaya refresh_token.
     * Waa tan ka hortagaysa in app-ku iskiis u log out sameeyo saac kasta.
     */
    suspend fun refreshSession(): Boolean = withContext(Dispatchers.IO) {
        val refreshToken = prefs.getString(KEY_REFRESH_TOKEN, null)
        if (refreshToken.isNullOrBlank()) return@withContext false
        try {
            val body = JSONObject().apply { put("refresh_token", refreshToken) }
                .toString().toRequestBody(JSON)
            val req = Request.Builder()
                .url("$AUTH_URL/token?grant_type=refresh_token")
                .addHeader("apikey", anonKey)
                .addHeader("Content-Type", "application/json")
                .post(body)
                .build()

            http.newCall(req).execute().use { resp ->
                val text = resp.body?.string().orEmpty()
                if (!resp.isSuccessful) {
                    // 400/401 = refresh token-ku dhab ahaan waa la diiday → session waa dhammaaday.
                    // Cilado shabakad (5xx / exception) session-ka LAMA tirtirayo.
                    if (resp.code == 400 || resp.code == 401 || resp.code == 403) {
                        prefs.edit().clear().apply()
                    }
                    return@withContext false
                }
                val json = JSONObject(text)
                val accessToken = json.optString("access_token", "")
                if (accessToken.isBlank()) return@withContext false
                val newRefresh = json.optString("refresh_token", refreshToken)
                val expiresIn = json.optLong("expires_in", 3600L)
                prefs.edit()
                    .putString(KEY_ACCESS_TOKEN, accessToken)
                    .putString(KEY_REFRESH_TOKEN, newRefresh)
                    .putLong(KEY_EXPIRES_AT, (System.currentTimeMillis() / 1000) + expiresIn)
                    .apply()
                true
            }
        } catch (_: Exception) {
            // Shabakadu way go'day — session-ka sii hay, mar dambe ayaa la isku dayayaa.
            false
        }
    }

    /**
     * Hubi in session-ku sax yahay; haddii uu dhacay ama uu 5 daqiiqo gudahood
     * dhacayo, refresh samee. Waa in la waco kahor shaqo kasta oo muhiim ah.
     */
    suspend fun ensureValidSession(): Boolean {
        val expiresAt = prefs.getLong(KEY_EXPIRES_AT, 0L)
        val nowSec = System.currentTimeMillis() / 1000
        val token = prefs.getString(KEY_ACCESS_TOKEN, null)
        if (!token.isNullOrBlank() && expiresAt > nowSec + 300) return true
        if (!hasStoredSession()) return false
        return refreshSession()
    }

    fun getAccessToken(): String? = prefs.getString(KEY_ACCESS_TOKEN, null)
    fun getEmail(): String? = prefs.getString(KEY_EMAIL, null)


    suspend fun login(email: String, password: String): LoginResult = withContext(Dispatchers.IO) {
        try {
            val body = JSONObject().apply {
                put("email", email)
                put("password", password)
            }.toString().toRequestBody(JSON)

            val req = Request.Builder()
                .url("$AUTH_URL/token?grant_type=password")
                .addHeader("apikey", anonKey)
                .addHeader("Content-Type", "application/json")
                .post(body)
                .build()

            http.newCall(req).execute().use { resp ->
                val text = resp.body?.string().orEmpty()
                if (!resp.isSuccessful) {
                    val msg = try {
                        JSONObject(text).optString("error_description",
                            JSONObject(text).optString("msg", "Login failed"))
                    } catch (_: Exception) { "Login failed (${resp.code})" }
                    return@withContext LoginResult(false, msg)
                }

                val json = JSONObject(text)
                val accessToken = json.getString("access_token")
                val refreshToken = json.optString("refresh_token", "")
                val expiresIn = json.optLong("expires_in", 3600L)
                val user = json.optJSONObject("user")
                val userId = user?.optString("id").orEmpty()
                val userEmail = user?.optString("email").orEmpty()

                // Verify admin role via is_admin RPC
                val adminOk = verifyIsAdmin(accessToken, userId)
                if (!adminOk) {
                    return@withContext LoginResult(
                        false,
                        "Akoonkan admin uma aha. Fadlan isticmaal admin account."
                    )
                }

                prefs.edit()
                    .putString(KEY_ACCESS_TOKEN, accessToken)
                    .putString(KEY_REFRESH_TOKEN, refreshToken)
                    .putString(KEY_USER_ID, userId)
                    .putString(KEY_EMAIL, userEmail)
                    .putLong(KEY_EXPIRES_AT, (System.currentTimeMillis() / 1000) + expiresIn)
                    .apply()

                LoginResult(true, null, true)
            }
        } catch (e: Exception) {
            LoginResult(false, e.message ?: "Network error")
        }
    }

    private fun verifyIsAdmin(accessToken: String, userId: String): Boolean {
        if (userId.isBlank()) return false
        return try {
            // is_admin() takes no arguments — it uses auth.uid() from the JWT
            val body = JSONObject().toString().toRequestBody(JSON)
            val req = Request.Builder()
                .url("$REST_URL/rpc/is_admin")
                .addHeader("apikey", anonKey)
                .addHeader("Authorization", "Bearer $accessToken")
                .addHeader("Content-Type", "application/json")
                .post(body)
                .build()
            http.newCall(req).execute().use { r ->
                val t = r.body?.string()?.trim().orEmpty()
                r.isSuccessful && (t.equals("true", ignoreCase = true))
            }
        } catch (_: Exception) {
            false
        }
    }

    fun logout() {
        prefs.edit().clear().apply()
    }
}
