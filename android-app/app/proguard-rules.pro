# Al-islaam Data ProGuard Rules

# ============================================================
# CRITICAL: Keep all app classes for USSD automation & Play Store
# Prevents R8/ProGuard from obfuscating class names
# ============================================================
-keep class com.alislaam.delivery.SplashActivity { *; }
-keep class com.alislaam.delivery.LoginActivity { *; }
-keep class com.alislaam.delivery.MainActivity { *; }
-keep class com.alislaam.delivery.AlIslaamDataApp { *; }

# Keep all services in our package (including AccessibilityService)
-keep class com.alislaam.delivery.service.** { *; }
-keep class com.alislaam.delivery.service.UssdAccessibilityService { *; }
-keep class com.alislaam.delivery.service.UssdDialerService { *; }

# Keep all receivers
-keep class com.alislaam.delivery.receiver.** { *; }

# Keep Accessibility Service classes
-keep class * extends android.accessibilityservice.AccessibilityService { *; }
-keepclassmembers class * extends android.accessibilityservice.AccessibilityService {
    public void onAccessibilityEvent(android.view.accessibility.AccessibilityEvent);
    public void onInterrupt();
    public void onServiceConnected();
}

# Keep data classes
-keep class com.alislaam.delivery.data.** { *; }

# Keep API client
-keep class com.alislaam.delivery.api.** { *; }

# ============================================================
# Kotlin and Coroutines
# ============================================================
-keepattributes *Annotation*
-keepattributes Signature
-keepattributes InnerClasses
-keepattributes EnclosingMethod

-keep class kotlin.** { *; }
-keep class kotlinx.coroutines.** { *; }
-dontwarn kotlinx.coroutines.**

# ============================================================
# OkHttp
# ============================================================
-dontwarn okhttp3.**
-dontwarn okio.**
-keep class okhttp3.** { *; }
-keep interface okhttp3.** { *; }

# ============================================================
# Jetpack Compose
# ============================================================
-keep class androidx.compose.** { *; }
-dontwarn androidx.compose.**

# ============================================================
# Room Database
# ============================================================
-keep class * extends androidx.room.RoomDatabase
-keep @androidx.room.Entity class *
-dontwarn androidx.room.paging.**

# ============================================================
# General Android
# ============================================================
-keep class android.telephony.** { *; }
