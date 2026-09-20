package com.riyokaab.delivery.service

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.util.Log

/**
 * AccessibilityService to auto-click "OK/Confirm" dialogs on USSD responses
 * 
 * IMPORTANT: User must manually enable this service in:
 * Settings > Accessibility > Installed Services > Riyokaab Data > Enable
 * 
 * Features:
 * - Auto-clicks OK/Confirm/Dismiss buttons on USSD dialogs
 * - Handles multiple consecutive dialogs (Hormuud sends 2-3)
 * - Communicates with SmsReceiver via SharedPreferences
 * - Sends broadcast when clicks complete for UssdDialerService
 * - CAPTURES ALL DIALOG TEXT for delivery_notes
 */
class UssdAccessibilityService : AccessibilityService() {

    companion object {
        private const val TAG = "UssdAccessibility"
        const val ACTION_USSD_CLICK_COMPLETE = "com.riyokaab.data.USSD_CLICK_COMPLETE"
        const val PREFS_NAME = "riyokaab_ussd_prefs"
        const val KEY_EXPECTING_USSD = "expecting_ussd_dialogs"
        const val KEY_LAST_USSD_TIME = "last_ussd_time"
        const val KEY_LAST_USSD_RESPONSE = "last_ussd_response"
        const val KEY_LAST_USSD_RESPONSE_TIME = "last_ussd_response_time"
        const val KEY_LAST_USSD_FINAL_RESULT = "last_ussd_final_result"
        const val KEY_LAST_USSD_FINAL_RESULT_TIME = "last_ussd_final_result_time"
        
        // Button texts to auto-click (Somali and English) - EXPANDED LIST
        private val CONFIRM_BUTTONS = listOf(
            // English
            "ok", "OK", "Ok", "O.K.", "okay", "Okay", "OKAY",
            "yes", "Yes", "YES",
            "confirm", "Confirm", "CONFIRM",
            "send", "Send", "SEND",
            "dismiss", "Dismiss", "DISMISS",
            "cancel", "Cancel", "CANCEL",
            "close", "Close", "CLOSE",
            "done", "Done", "DONE",
            "continue", "Continue", "CONTINUE",
            "next", "Next", "NEXT",
            "accept", "Accept", "ACCEPT",
            "agree", "Agree", "AGREE",
            // Somali - EXPANDED with Haye!
            "haa", "Haa", "HAA",
            "haye", "Haye", "HAYE",           // ← ADDED: Common Somali OK
            "hagaag", "Hagaag", "HAGAAG",     // ← ADDED: "Fine/OK" in Somali
            "xaq", "Xaq", "XAQ",
            "kulan", "Kulan", "KULAN",
            "dhamaad", "Dhamaad", "DHAMAAD",
            "xayn", "Xayn", "XAYN",
            "sii wad", "Sii Wad", "SII WAD",
            "raali", "Raali", "RAALI",
            "ogolow", "Ogolow", "OGOLOW",
            // Symbols & Emojis
            "✓", "✔", "☑", "👍", "🆗"
        )
        
        // USSD-related package names (including Somali carriers and common dialers)
        private val USSD_PACKAGES = listOf(
            // ✅ SIM TOOLKIT - CRITICAL for Hormuud USSD dialogs!
            "com.android.stk",              // Standard SIM Toolkit
            "com.mediatek.stk",             // MediaTek SIM Toolkit
            "com.sec.android.app.stk",      // Samsung SIM Toolkit
            "com.qualcomm.simtoolkit",      // Qualcomm SIM Toolkit
            // Phone/Dialer apps
            "com.android.phone",
            "com.samsung.android.phone",
            "com.android.server.telecom",
            "com.mediatek.phone",
            "com.hormuud.phone",
            "com.somnet.dialer",
            "com.somtel.phone",
            "com.huawei.phone",
            "com.xiaomi.phone",
            "com.oppo.phone",
            "com.vivo.phone",
            // Additional common dialer packages
            "com.google.android.dialer",
            "com.android.incallui",
            "com.samsung.android.incallui",
            "com.sec.android.app.samsungapps",
            "com.lge.phone",
            "com.asus.contacts",
            "com.oneplus.dialer",
            "com.coloros.phone",
            "com.realme.phone"
        )
        
        // Timeout for expecting USSD flag (30 seconds - INCREASED from 15s)
        private const val EXPECTING_USSD_TIMEOUT_MS = 30000L
        private const val DEBOUNCE_MS = 400L
        private const val CLICK_DELAY_MS = 350L
        // Give Samsung/STK dialogs enough time to commit ACTION_SET_TEXT before Send.
        private const val INPUT_SETTLE_DELAY_MS = 1000L
        private const val MULTI_DIALOG_TIMEOUT_MS = 10000L
        // 200ms cadence for ~3 minutes of active session driving.
        private const val FLOW_WATCHER_MAX_POLLS = 900


        @Volatile
        private var instance: UssdAccessibilityService? = null

        /**
         * Xir session-ka USSD ee furan (dialog-ga shirkadda) si dialing cusub
         * uu u bilaabmo isagoo nadiif ah — "Invalid menu option" way hor istaagaysaa.
         */
        fun closeUssdSession() {
            instance?.closeCurrentUssdSession()
        }

        // ===== SESSION HOLD / KEEP-ALIVE =====
        /** Qoraalka menu-ga xirmooyinka ee HADDA shaashadda ku jira (null = session xiran). */
        @Volatile
        var heldMenuLive: String? = null
            private set

        /**
         * Shidan marka menu-ga xirmooyinka la qabtay oo la sugayo xulashada user-ka.
         * Inta ay shidan tahay, Send/OK marnaba lama gujinayo.
         */
        @Volatile
        var holdAwaitingSelection: Boolean = false
            private set

        /** Bilow kormeerka keep-alive: dialog-ga waa la sii firfircoonaynayaa oo la ilaalinayaa. */
        fun startHoldKeepAlive() {
            instance?.beginHoldKeepAlive()
        }

        fun stopHoldKeepAlive() {
            holdAwaitingSelection = false
            instance?.endHoldKeepAlive()
            heldMenuLive = null
        }


        /**
         * Session-ka furan ku sii wad ISLA MARKIIBA: dialog-gu horey buu u furnaa,
         * sidaas darteed event cusub ma imanayo — poller-ka flow-ka ayaa la kicinayaa
         * si safka xirmada loo galiyo oo Send loo taabto.
         */
        fun resumeFlowNow() {
            instance?.beginFlowResume()
        }
    }


    
    private val handler = Handler(Looper.getMainLooper())
    private var clickCount = 0
    private var lastClickTime = 0L
    private var multiDialogRunnable: Runnable? = null

    // Session guards to prevent duplicate PIN entry
    private var ussdSessionToken = 0L
    private var pinFilledForSession = false
    private var pinSubmittedForSession = false
    private var lastFlow870AttemptKey = ""
    private var lastFlow870AttemptTime = 0L
    private var flowActionInFlight = false
    private var flowActionStep = -1
    private var finalResultRunnable: Runnable? = null
    private var finalResultAttempts = 0
    private var finalResultModeActive = false
    private var discoveryWatcherRunnable: Runnable? = null
    private var discoveryWatcherAttempts = 0
    private var flowWatcherRunnable: Runnable? = null
    private var flowWatcherAttempts = 0
    private var lastNoMatchLogTime = 0L


    /**
     * Dialog-ga USSD ee furan xir: marka hore riix badhanka (OK/Cancel),
     * haddii la waayo BACK isticmaal — dhowr jeer si session-ku u xirmo.
     */
    fun closeCurrentUssdSession() {
        holdAwaitingSelection = false
        handler.post {

            var attempts = 0
            val step = object : Runnable {
                override fun run() {
                    attempts++
                    val clicked = try {
                        val root = rootInActiveWindow
                        root != null && findAndClickAnyButton(root)
                    } catch (e: Exception) {
                        Log.w(TAG, "⚠️ closeUssdSession: ${e.message}")
                        false
                    }
                    if (!clicked) {
                        try { performGlobalAction(GLOBAL_ACTION_BACK) } catch (_: Exception) {}
                    }
                    if (attempts < 3) handler.postDelayed(this, 400)
                }
            }
            handler.post(step)
        }
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        
        Log.d(TAG, "✅ UssdAccessibilityService connected and active")
        
        // Configure service - NO packageNames filter to listen to ALL apps
        val info = AccessibilityServiceInfo().apply {
            eventTypes = AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED or
                        AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED or
                        AccessibilityEvent.TYPE_WINDOWS_CHANGED
            feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC
            flags = AccessibilityServiceInfo.FLAG_INCLUDE_NOT_IMPORTANT_VIEWS or
                   AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS or
                   AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS
            notificationTimeout = 10  // FASTER: 10ms instead of 50ms
            
            // REMOVED: packageNames filter - now listens to ALL apps for USSD dialogs
        }
        
        serviceInfo = info
        Log.d(TAG, "🎯 Listening to ALL apps for USSD dialogs (no package filter)")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null) return
        
        val packageName = event.packageName?.toString() ?: return
        
        // Check if we're expecting USSD dialogs (set by SmsReceiver / dialer)
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val expectingUssd = prefs.getBoolean(KEY_EXPECTING_USSD, false)
        val lastUssdTime = prefs.getLong(KEY_LAST_USSD_TIME, 0)

        // 🆕 Flow870 override: haddii flow-ka *870* uu firfircoon yahay,
        // ka gudub filter-yada (expecting flag + phone package check). Sabab:
        // qaar phone package-yada (Samsung/One UI/MIUI) magacoodu ma laha "phone"
        // ama "dialer", sidaas darteed dialog-ka *870* wuu ka fadhiisan lahaa.
        val flow870Active = Ussd870Flow.isActive(this)

        // Samsung/One UI mararka qaar dialog cusub ma soo saaraan event cusub; sidaas
        // darteed marka flow-ku firfircoon yahay poller madax-banaan ayaa socda.
        if (flow870Active) startFlowWatcher() else stopFlowWatcher()

        // Keep listening while the terminal carrier result is pending, even when its
        // package/window does not look like a normal phone app.
        if (!flow870Active && !finalResultModeActive && expectingUssd && System.currentTimeMillis() - lastUssdTime > EXPECTING_USSD_TIMEOUT_MS) {
            prefs.edit().putBoolean(KEY_EXPECTING_USSD, false).apply()
            pinFilledForSession = false
            pinSubmittedForSession = false
            ussdSessionToken = 0L
            lastFlow870AttemptKey = ""
            lastFlow870AttemptTime = 0L
            flowActionInFlight = false
            flowActionStep = -1
            Log.d(TAG, "⏰ Reset expecting_ussd flag (timeout after ${EXPECTING_USSD_TIMEOUT_MS/1000}s)")
            return
        }

        // New USSD session started: reset one-time PIN guards
        if (expectingUssd && lastUssdTime != 0L && lastUssdTime != ussdSessionToken) {
            stopFinalResultWatcher()
            ussdSessionToken = lastUssdTime
            pinFilledForSession = false
            pinSubmittedForSession = false
            Log.d(TAG, "🆕 New USSD session detected, PIN guards reset")
            lastFlow870AttemptKey = ""
            lastFlow870AttemptTime = 0L
            flowActionInFlight = false
            flowActionStep = -1
        }

        // Check if event is from a phone/dialer-related app
        val isUssdPackage = USSD_PACKAGES.any { packageName.contains(it, ignoreCase = true) }

        val isPhonePackage = packageName.contains("phone", ignoreCase = true) ||
                            packageName.contains("dialer", ignoreCase = true) ||
                            packageName.contains("stk", ignoreCase = true) ||
                            packageName.contains("toolkit", ignoreCase = true) ||
                            packageName.contains("telecom", ignoreCase = true) ||
                            packageName.contains("incall", ignoreCase = true) ||
                            packageName.contains("ussd", ignoreCase = true) ||
                            packageName.contains("call", ignoreCase = true) ||
                            packageName.contains("samsung", ignoreCase = true) ||
                            packageName.contains("mediatek", ignoreCase = true) ||
                            packageName.contains("qualcomm", ignoreCase = true)

        if (!flow870Active && !finalResultModeActive) {
            // Normal path: gate strictly on expecting flag + phone package
            if (!expectingUssd) {
                pinFilledForSession = false
                pinSubmittedForSession = false
                ussdSessionToken = 0L
                lastFlow870AttemptKey = ""
                lastFlow870AttemptTime = 0L
                return
            }
            if (!isUssdPackage && !isPhonePackage) {
                return
            }
        } else {
            Log.d(TAG, "🆕 [Flow870] Bypassing filters — processing event from $packageName (expecting=$expectingUssd, finalMode=$finalResultModeActive)")
        }
        
        // Debounce: Don't process if we clicked recently.
        // Discovery mode waa laga dhaafayaa — menu-ga xirmooyinka wuxuu soo bixi karaa
        // isla markiiba kadib click-ga Menu 1, oo debounce-ku wuu qarin lahaa.
        val discoveryActive = Ussd870Flow.isDiscoveryMode(this)
        if (discoveryActive) startDiscoveryMenuWatcher()
        val timeSinceLastClick = System.currentTimeMillis() - lastClickTime
        if (!discoveryActive && timeSinceLastClick < DEBOUNCE_MS) {
            Log.d(TAG, "⏳ Debounce: ignoring event (${timeSinceLastClick}ms since last click)")
            return
        }
        
        Log.d(TAG, "📱 Event from $packageName: ${event.eventType} (expecting=$expectingUssd, isPhone=$isPhonePackage)")
        
        when (event.eventType) {
            AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED,
            AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED,
            AccessibilityEvent.TYPE_WINDOWS_CHANGED -> {
                // Add delay before clicking to let dialog fully render
                handler.postDelayed({
                    // AccessibilityEvent objects are owned/recycled by Android after this
                    // callback. Re-read the live windows instead of retaining a stale event.
                    tryClickConfirmButton(null)
                }, CLICK_DELAY_MS)
            }
        }
    }

    private fun tryClickConfirmButton(event: AccessibilityEvent?) {
        // ===== HOLD GUARD =====
        // Inta menu-ga xirmooyinka la hayo oo xulasho la sugayo, gujis KASTA (Send/OK)
        // waa la xannibayaa — hore Send ayaa la taabanayay iyadoon saf la gelin.
        if (holdAwaitingSelection) {
            Log.d(TAG, "⏸️ [Hold] Gujis la diiday (Send/OK) — xulasho la sugayo")
            return
        }
        try {

            // Isticmaal rootInActiveWindow marka hore si aan u aragno dialog-ga oo dhan
            // (mararka qaar event.source wuxuu noqdaa EditText keliya, taasoo menu-ga qarin karta).
            val source = obtainBestUssdRoot(event) ?: run {
                if (Ussd870Flow.isActive(this)) {
                    Log.d(TAG, "🔍 [Flow870] No USSD root available yet (dialog not rendered / not a USSD window)")
                }
                return
            }

            
            // CAPTURE ALL DIALOG TEXT FIRST - before any filtering
            val dialogText = extractDialogText(source)
            
            // ALWAYS save dialog text if not empty - for delivery_notes
            if (!dialogText.isNullOrBlank() &&
                !dialogText.contains("notification:", ignoreCase = true) &&
                !dialogText.contains(", Folder", ignoreCase = true)
            ) {
                Log.d(TAG, "📝 Dialog text captured: ${dialogText.take(200)}")
                saveUssdResponse(dialogText)
            }
            
            // ===== DISCOVERY MODE (mudnaanta koowaad) =====
            // Marka menu-ga xirmooyinka la arko, isla markiiba keydi — ha sugin
            // in step-ka la match-gareeyo (mararka qaar step 3 horay ayaa loo calaamadiyay
            // ama flow-ku wuu dhamaaday, taasoo menu-ga qarin jirtay).
            if (Ussd870Flow.isDiscoveryMode(this) &&
                !dialogText.isNullOrBlank() &&
                Ussd870Flow.isPackageMenuDialog(dialogText)
            ) {
                Log.d(TAG, "🔎 [Discovery] Package menu captured: ${dialogText.take(200)}")
                Ussd870Flow.saveDiscoveryMenu(this, dialogText)
                stopDiscoveryMenuWatcher()
                val hold = Ussd870Flow.isHoldSession(this)
                Ussd870Flow.finish(this)
                stopFinalResultWatcher()
                // Session hold: dialog-ga ha xirin — user-ka ayaa lacagta bixinaya,
                // kadibna isla session-kan furan ayaa xirmada laga dooranayaa.
                if (!hold) {
                    dismissDialogWithBack()
                } else {
                    holdAwaitingSelection = true
                    Log.d(TAG, "⏸️ [Discovery] Session la sii hayay (hold) — Send waa la xannibay")
                }

                source.recycle()
                return
            }

            // ===== NEW: Ussd870Flow (hardcode) — hal block cusub =====
            // Haddii flow-ka *870* uu firfircoon yahay, isaga daa logic-ga Hormuud
            // oo mari layer-ka cusub. Haddii kale, hab-dhaqanka jira ayaa u shaqeeya.
            if (Ussd870Flow.isActive(this)) {
                val step = Ussd870Flow.matchStep(this, dialogText)
                if (step == null) {
                    val now = System.currentTimeMillis()
                    if (now - lastNoMatchLogTime > 2000L) {
                        lastNoMatchLogTime = now
                        Log.d(TAG, "🔍 [Flow870] Root present but matchStep=null (already completed or unrecognised) text=${dialogText.orEmpty().take(200)}")
                    }
                }



                if (step != null) {
                    Log.d(TAG, "🆕 [Flow870] Step matched: ${step.name} (order=${step.order})")
                    val input = Ussd870Flow.inputFor(this, step, dialogText)
                    Log.d(TAG, "🆕 [Flow870] Entering input: '${if (step.isPinField) "***" else input}'")

                    if (input.isBlank()) {
                        Log.e(TAG, "❌ [Flow870] Selected package name did not match any live carrier row; live menu=${dialogText.orEmpty().take(300)}")
                        lastFlow870AttemptKey = ""
                        lastFlow870AttemptTime = 0L
                        source.recycle()
                        return
                    }

                    // Accessibility emits many events while Samsung is updating the same USSD
                    // field. Only one enter+verify+Send operation may own a step at a time.
                    // Without this lock several delayed callbacks race each other, and a stale
                    // callback from Menu 1 can consume the package dialog before row selection.
                    if (flowActionInFlight) {
                        Log.d(TAG, "⏳ [Flow870] Action already in flight for step $flowActionStep; ignoring duplicate step ${step.order}")
                        source.recycle()
                        return
                    }

                    val attemptKey = "${step.order}:${input}:${dialogText.orEmpty().take(80)}"
                    val now = System.currentTimeMillis()
                    if (attemptKey == lastFlow870AttemptKey && now - lastFlow870AttemptTime < 1200L) {
                        Log.d(TAG, "⏳ [Flow870] Retry guard: same step attempted ${now - lastFlow870AttemptTime}ms ago")
                        source.recycle()
                        return
                    }
                    lastFlow870AttemptKey = attemptKey
                    lastFlow870AttemptTime = now
                    flowActionInFlight = true
                    flowActionStep = step.order

                    val entered = enterPinInDialog(source, input)
                    if (entered) {
                        handler.postDelayed({
                            val root = obtainBestUssdRoot(null) ?: run {
                                clearFlowAction(step.order)
                                return@postDelayed
                            }
                            val liveDialogText = extractDialogText(root)
                            val liveStep = Ussd870Flow.matchStep(this, liveDialogText)

                            // A delayed callback must never submit a newer/different dialog.
                            if (liveStep?.order != step.order) {
                                Log.w(TAG, "⚠️ [Flow870] Dialog changed before Send; expected step ${step.order}, found ${liveStep?.order} (live=${liveDialogText.orEmpty().take(160)})")
                                lastFlow870AttemptKey = ""
                                lastFlow870AttemptTime = 0L
                                clearFlowAction(step.order)
                                root.recycle()
                                // Never end the cycle here: the next carrier menu may already be
                                // on screen with no accessibility event to announce it.
                                kickFlowWatcher(200L)
                                return@postDelayed
                            }

                            // ✅ Verify the input field actually contains a value before pressing Send.
                            // Some carrier dialogs report ACTION_SET_TEXT success but the field
                            // stays empty; pressing Send with empty input causes "invalid" errors.
                            if (!verifyInputAcrossWindows(root, input)) {
                                // The phone in the live recording returns true from ACTION_SET_TEXT
                                // while leaving the visible USSD field empty. Repeating the same
                                // action cannot recover. For numbered menu choices, tap the actual
                                // keyboard key(s) instead; Send remains blocked until a fresh-window
                                // verification confirms the exact value is visible.
                                val retryEntered = if (!step.isPinField && input.all(Char::isDigit)) {
                                    Log.w(TAG, "⚠️ [Flow870] Input still empty; using visible keyboard digit fallback for menu step")
                                    typeDigitsViaAccessibility(root, input)
                                } else {
                                    Log.w(TAG, "⚠️ [Flow870] PIN input not yet visible; retrying secure text entry")
                                    enterPinInDialog(root, input)
                                }
                                root.recycle()
                                if (!retryEntered) {
                                    Log.w(TAG, "❌ [Flow870] Retry entry failed; leaving step pending. Send will NOT be clicked.")
                                    lastFlow870AttemptKey = ""
                                    lastFlow870AttemptTime = 0L
                                    clearFlowAction(step.order)
                                    return@postDelayed
                                }

                                // The retry also gets a full second to settle. Never verify and
                                // click in the same frame, which caused occasional empty Send taps.
                                handler.postDelayed({
                                    val retryRoot = obtainBestUssdRoot(null) ?: run {
                                        clearFlowAction(step.order)
                                        return@postDelayed
                                    }
                                    val retryDialogText = extractDialogText(retryRoot)
                                    val retryStep = Ussd870Flow.matchStep(this, retryDialogText)
                                    if (retryStep?.order != step.order || !verifyInputAcrossWindows(retryRoot, input)) {
                                        Log.w(TAG, "❌ [Flow870] Retried input was not committed; Send will NOT be clicked")
                                        lastFlow870AttemptKey = ""
                                        lastFlow870AttemptTime = 0L
                                        clearFlowAction(step.order)
                                        retryRoot.recycle()
                                        return@postDelayed
                                    }
                                    submitFlowStep(retryRoot, step, input)
                                    retryRoot.recycle()
                                }, INPUT_SETTLE_DELAY_MS)
                                return@postDelayed
                            }
                            submitFlowStep(root, step, input)
                            root.recycle()
                        }, INPUT_SETTLE_DELAY_MS)
                        source.recycle()
                        return
                    } else {
                        Log.w(TAG, "⚠️ [Flow870] Couldn't set input for step ${step.name}")
                        clearFlowAction(step.order)
                    }
                }
                // A final result dialog has no menu input, so matchStep() returns null.
                // Previously this branch returned before the normal OK-button logic ran,
                // leaving the carrier dialog permanently open.
                if (step == null && clickFinalResultAcrossWindows(source)) {
                    Ussd870Flow.finish(this)
                    stopFinalResultWatcher()
                    source.recycle()
                    return
                }
                // Flow870 firfircoon — HA soconin logic-ga PIN-ka Hormuud
                source.recycle()
                return
            }
            // ===== END NEW =====

            // CHECK FOR PIN INPUT DIALOG - only enter PIN once per USSD session
            val isPinDialog = dialogText?.contains("PIN", ignoreCase = true) == true ||
                             dialogText?.contains("pin", ignoreCase = true) == true ||
                             dialogText?.contains("password", ignoreCase = true) == true ||
                             dialogText?.contains("furaha", ignoreCase = true) == true
            
            if (isPinDialog) {
                Log.d(TAG, "🔐 PIN dialog detected")

                if (!pinFilledForSession) {
                    // Read PIN from SharedPreferences (set by UssdDialerService from web dashboard)
                    val rawPin = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                        .getString("current_pin_code", "8826") ?: "8826"
                    val digitsOnly = rawPin.filter { it.isDigit() }
                    // Flow870 accepts PIN 3-12 digits; other flows keep legacy 4-digit behavior.
                    val currentPin = if (Ussd870Flow.isActive(this)) {
                        if (digitsOnly.length in 3..12) digitsOnly else "8826"
                    } else {
                        digitsOnly.take(4).ifEmpty { "8826" }
                    }
                    Log.d(TAG, "🔐 Using PIN (flow870=${Ussd870Flow.isActive(this)}, len=${currentPin.length}): ${currentPin.take(2)}***")
                    val pinEntered = enterPinInDialog(source, currentPin)
                    if (!pinEntered) {
                        Log.w(TAG, "⚠️ PIN dialog found but couldn't set PIN text")
                        source.recycle()
                        return
                    }
                    pinFilledForSession = true
                    Log.d(TAG, "✅ PIN entered once for this session")
                } else {
                    Log.d(TAG, "⏭️ PIN already filled for this session, skipping re-entry")
                }

                if (!pinSubmittedForSession) {
                    pinSubmittedForSession = true
                    handler.postDelayed({
                        val root = obtainBestUssdRoot(null) ?: return@postDelayed
                        clickSendOrOkButton(root)
                        root.recycle()
                    }, 300)
                } else {
                    Log.d(TAG, "⏭️ PIN already submitted for this session, skipping re-submit")
                }

                source.recycle()
                return
            }
            
            // Dialog leh field bannaan micneheedu waa gelin la sugayo — Send ha la taabin.
            if (hasVisibleEditableNode(source) && !hasFilledEditableNode(source)) {
                Log.d(TAG, "⏭️ Send la diiday — field-ku wali waa bannaan yahay")
                source.recycle()
                return
            }

            // Search for clickable buttons with confirm text
            for (buttonText in CONFIRM_BUTTONS) {
                val nodes = source.findAccessibilityNodeInfosByText(buttonText)
                
                for (node in nodes) {
                    if (isClickableButton(node)) {
                        val nodeText = node.text?.toString() ?: buttonText
                        Log.d(TAG, "🎯 Found button: '$nodeText' - clicking...")
                        
                        val clicked = node.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                        
                        if (clicked) {
                            clickCount++
                            lastClickTime = System.currentTimeMillis()
                            Log.d(TAG, "✅ Successfully clicked '$nodeText' button (click #$clickCount)")
                            
                            // Start multi-dialog listener
                            startMultiDialogListener()
                            
                            // Notify completion
                            notifyClickComplete()
                            
                            node.recycle()
                            source.recycle()
                            return
                        } else {
                            // Try clicking parent if button itself isn't clickable
                            val parent = node.parent
                            if (parent != null && parent.isClickable) {
                                val parentClicked = parent.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                                if (parentClicked) {
                                    clickCount++
                                    lastClickTime = System.currentTimeMillis()
                                    Log.d(TAG, "✅ Successfully clicked parent of '$nodeText' (click #$clickCount)")
                                    startMultiDialogListener()
                                    notifyClickComplete()
                                    parent.recycle()
                                    node.recycle()
                                    source.recycle()
                                    return
                                }
                                parent.recycle()
                            }
                        }
                    }
                    node.recycle()
                }
            }
            
            // IMPORTANT: avoid unsafe fallback clicks on dialer keypad (can type extra digits)
            Log.d(TAG, "ℹ️ No known confirm button found; skipping unsafe fallback click")
            
            source.recycle()
        } catch (e: Exception) {
            Log.e(TAG, "❌ Error handling event: ${e.message}")
        }
    }

    /**
     * Keyboard-ku mararka qaar ayuu noqdaa active window, taasoo qarinaysa USSD dialog-ga.
     * Sidaas darteed waxaan ka dooranaa windows-ka root-ka ugu badan ee u eg USSD dialog.
     */
    private fun obtainBestUssdRoot(event: AccessibilityEvent?): AccessibilityNodeInfo? {
        val candidates = mutableListOf<AccessibilityNodeInfo>()

        try {
            rootInActiveWindow?.let { candidates.add(AccessibilityNodeInfo.obtain(it)) }
        } catch (_: Exception) {}

        try {
            event?.source?.let { eventSource ->
                candidates.add(AccessibilityNodeInfo.obtain(eventSource))
                eventSource.recycle()
            }
        } catch (_: Exception) {}

        try {
            for (window in windows) {
                window.root?.let { windowRoot ->
                    candidates.add(AccessibilityNodeInfo.obtain(windowRoot))
                    windowRoot.recycle()
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "⚠️ Could not inspect accessibility windows: ${e.message}")
        }

        if (candidates.isEmpty()) return null

        var best: AccessibilityNodeInfo? = null
        var bestScore = Int.MIN_VALUE

        for (candidate in candidates) {
            val text = extractDialogText(candidate).orEmpty()
            // A Flow870 action must never run against the launcher, notification shade,
            // keyboard or a stale non-USSD window. The latest Logcat showed those windows
            // beating the real package dialog and preventing package_select from running.
            if (Ussd870Flow.isActive(this) && !Ussd870Flow.isUssdDialogText(text)) {
                candidate.recycle()
                continue
            }
            val score = scoreUssdRootCandidate(candidate, text)
            if (score > bestScore) {
                best?.recycle()
                best = candidate
                bestScore = score
            } else {
                candidate.recycle()
            }
        }

        if (best == null) {
            Log.d(TAG, "⏳ No valid live USSD dialog root found")
            return null
        }
        Log.d(TAG, "🎯 Best USSD root score=$bestScore")
        return best
    }

    /**
     * USSD menus can replace their window without emitting a reliable accessibility event.
     * While discovery is active, inspect every live window repeatedly and capture the first
     * package menu. This is independent from the normal input/click state machine.
     */
    private fun startDiscoveryMenuWatcher() {
        if (discoveryWatcherRunnable != null) return
        discoveryWatcherAttempts = 0

        lateinit var watcher: Runnable
        watcher = Runnable {
            if (!Ussd870Flow.isDiscoveryMode(this)) {
                stopDiscoveryMenuWatcher()
                return@Runnable
            }

            discoveryWatcherAttempts++
            val menuText = findPackageMenuAcrossWindows()
            if (!menuText.isNullOrBlank()) {
                Log.d(TAG, "🔎 [Discovery watcher] Package menu captured: ${menuText.take(200)}")
                Ussd870Flow.saveDiscoveryMenu(this, menuText)
                stopDiscoveryMenuWatcher()
                val hold = Ussd870Flow.isHoldSession(this)
                Ussd870Flow.finish(this)
                if (!hold) {
                    dismissDialogWithBack()
                } else {
                    holdAwaitingSelection = true
                    Log.d(TAG, "⏸️ [Discovery watcher] Session la sii hayay (hold) — Send waa la xannibay")
                }

                return@Runnable
            }


            if (discoveryWatcherAttempts < 300) {
                handler.postDelayed(watcher, 100L)
            } else {
                stopDiscoveryMenuWatcher()
                Log.w(TAG, "⚠️ [Discovery watcher] Timed out without a package menu")
            }
        }

        discoveryWatcherRunnable = watcher
        handler.post(watcher)
        Log.d(TAG, "👀 Discovery menu watcher started")
    }

    private fun stopDiscoveryMenuWatcher() {
        discoveryWatcherRunnable?.let { handler.removeCallbacks(it) }
        discoveryWatcherRunnable = null
        discoveryWatcherAttempts = 0
    }

    /**
     * Samsung USSD dialogs badanaa ma soo saaraan TYPE_WINDOW_* event marka menu-ga
     * xiga la soo bandhigo — sidaas darteed state machine-ku wuu istaagaa isagoo
     * menu-ga xirmooyinku shaashadda saaran yahay. Poller-kani mar walba (700ms)
     * ayuu dib u eegaa windows-ka inta flow-ku firfircoon yahay.
     */
    private fun startFlowWatcher() {
        if (flowWatcherRunnable != null) return
        flowWatcherAttempts = 0

        lateinit var watcher: Runnable
        watcher = Runnable {
            if (!Ussd870Flow.isActive(this)) {
                stopFlowWatcher()
                return@Runnable
            }
            // Inta xulasho la sugayo, watcher-ku waxba ma gujinayo — kaliya wuu sii nooshahay.
            if (holdAwaitingSelection) {
                handler.postDelayed(watcher, 500L)
                return@Runnable
            }
            flowWatcherAttempts++

            try {
                // tryClickConfirmButton() re-queries the live windows from scratch and runs
                // the full match -> input -> verify -> Send pipeline, so the watcher is a real
                // step driver: Samsung often renders the next USSD menu with no usable event.
                tryClickConfirmButton(null)
            } catch (e: Exception) {
                Log.w(TAG, "⚠️ [Flow watcher] ${e.message}")
            }
            // Fast cadence while a step is still pending; back off once the flow is idle.
            val nextDelay = if (flowActionInFlight) 300L else 200L
            if (flowWatcherAttempts < FLOW_WATCHER_MAX_POLLS) {
                handler.postDelayed(watcher, nextDelay)
            } else {
                Log.w(TAG, "⚠️ [Flow watcher] Timed out after ${flowWatcherAttempts} polls")
                stopFlowWatcher()
            }
        }

        flowWatcherRunnable = watcher
        handler.postDelayed(watcher, 200L)
        Log.d(TAG, "👀 Flow watcher started (step driver, 200ms)")
    }

    /** Kick the watcher immediately (used after a stale/changed-dialog callback). */
    private fun kickFlowWatcher(delayMs: Long = 200L) {
        if (!Ussd870Flow.isActive(this)) return
        if (flowWatcherRunnable == null) {
            startFlowWatcher()
            return
        }
        flowWatcherRunnable?.let {
            handler.removeCallbacks(it)
            handler.postDelayed(it, delayMs)
        }
    }

    private fun stopFlowWatcher() {
        flowWatcherRunnable?.let { handler.removeCallbacks(it) }
        flowWatcherRunnable = null
        flowWatcherAttempts = 0
    }




    private fun findPackageMenuAcrossWindows(): String? {
        val roots = mutableListOf<AccessibilityNodeInfo>()
        try {
            rootInActiveWindow?.let { roots.add(AccessibilityNodeInfo.obtain(it)) }
            for (window in windows) {
                window.root?.let { root ->
                    roots.add(AccessibilityNodeInfo.obtain(root))
                    root.recycle()
                }
            }

            for (root in roots) {
                val text = extractDialogText(root).orEmpty()
                if (!isKeyboardRoot(root, text) && Ussd870Flow.isPackageMenuDialog(text)) {
                    saveUssdResponse(text)
                    return text
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "⚠️ [Discovery watcher] Window scan failed: ${e.message}")
        } finally {
            roots.forEach {
                try { it.recycle() } catch (_: Exception) {}
            }
        }
        return null
    }

    private fun scoreUssdRootCandidate(root: AccessibilityNodeInfo, text: String): Int {
        val lower = text.lowercase()
        var score = 0

        if (Ussd870Flow.isUssdDialogText(text)) score += 500
        if (Ussd870Flow.isPackageMenuDialog(text)) score += 300

        if (lower.contains("mudnaan")) score += 140
        if (lower.contains("pin") || lower.contains("password") || lower.contains("furaha")) score += 130
        if (lower.contains("airtime") || lower.contains("credit") || lower.contains("waqti")) score += 100
        if (lower.contains("data") && Regex("""\d+\s*[\.)\-:]""").containsMatchIn(text)) score += 90
        if (lower.contains("send") || lower.contains("ok") || lower.contains("confirm")) score += 30
        if (lower.contains("cancel")) score += 10
        if (hasEditableNode(root)) score += 25

        // Soft-keyboard roots commonly contain these labels/keys; avoid selecting them.
        if (lower.contains("english (uk)") || lower.contains("q | w | e") || lower.contains("!#1")) {
            score -= 120
        }

        score += text.length.coerceAtMost(200) / 20
        return score
    }

    private fun hasEditableNode(node: AccessibilityNodeInfo): Boolean {
        try {
            val className = node.className?.toString() ?: ""
            if (className.contains("EditText", ignoreCase = true) || node.isEditable) return true

            for (i in 0 until node.childCount) {
                val child = node.getChild(i) ?: continue
                val found = hasEditableNode(child)
                child.recycle()
                if (found) return true
            }
        } catch (e: Exception) {
            Log.e(TAG, "❌ Error checking editable nodes: ${e.message}")
        }
        return false
    }

    /** Hidden stale EditTexts may remain in an STK tree after PIN submission. */
    private fun hasVisibleEditableNode(node: AccessibilityNodeInfo): Boolean {
        try {
            val className = node.className?.toString() ?: ""
            if (node.isVisibleToUser && (className.contains("EditText", ignoreCase = true) || node.isEditable)) {
                return true
            }
            for (i in 0 until node.childCount) {
                val child = node.getChild(i) ?: continue
                val found = hasVisibleEditableNode(child)
                child.recycle()
                if (found) return true
            }
        } catch (e: Exception) {
            Log.w(TAG, "⚠️ Error checking visible editable nodes: ${e.message}")
        }
        return false
    }

    /** Ma jiraa field muuqda oo qoraal ku jiro (waa la buuxiyay)? */
    private fun hasFilledEditableNode(node: AccessibilityNodeInfo): Boolean {
        try {
            val className = node.className?.toString() ?: ""
            if (node.isVisibleToUser && (className.contains("EditText", ignoreCase = true) || node.isEditable)) {
                val txt = node.text?.toString()?.trim().orEmpty()
                if (txt.isNotEmpty()) return true
            }
            for (i in 0 until node.childCount) {
                val child = node.getChild(i) ?: continue
                val found = hasFilledEditableNode(child)
                child.recycle()
                if (found) return true
            }
        } catch (e: Exception) {
            Log.w(TAG, "⚠️ Error checking filled editable nodes: ${e.message}")
        }
        return false
    }



    private fun isKeyboardRoot(root: AccessibilityNodeInfo, text: String): Boolean {
        val packageName = root.packageName?.toString()?.lowercase().orEmpty()
        val lower = text.lowercase()
        return packageName.contains("inputmethod") ||
            packageName.contains("keyboard") ||
            packageName.contains("gboard") ||
            lower.contains("english (uk)") ||
            lower.contains("english (us)") ||
            lower.contains("q | w | e") ||
            lower.contains("!#1")
    }
    
    /**
     * Extract ALL text content from the USSD dialog
     * This captures the Hormuud confirmation message for delivery_notes
     * IMPROVED: Captures all text including short strings and button labels
     */
    private fun extractDialogText(root: AccessibilityNodeInfo): String? {
        val textParts = mutableListOf<String>()
        extractTextRecursively(root, textParts)
        
        if (textParts.isNotEmpty()) {
            val fullText = textParts.joinToString(" | ")
            Log.d(TAG, "📄 Extracted dialog texts: $fullText")
            return fullText
        }
        return null
    }
    
    /**
     * Recursively extract text from ALL nodes in the dialog
     * IMPROVED: Captures ALL text regardless of length, including button labels and content descriptions
     */
    private fun extractTextRecursively(node: AccessibilityNodeInfo, texts: MutableList<String>) {
        try {
            // Capture ALL text - no length filter
            val text = node.text?.toString()
            if (!text.isNullOrBlank()) {
                texts.add(text.trim())
            }
            
            // Also capture content description (important for some dialogs)
            val contentDesc = node.contentDescription?.toString()
            if (!contentDesc.isNullOrBlank() && contentDesc != text) {
                texts.add(contentDesc.trim())
            }
            
            // Recurse into all children
            for (i in 0 until node.childCount) {
                node.getChild(i)?.let { child ->
                    extractTextRecursively(child, texts)
                    child.recycle()
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "❌ Error extracting text: ${e.message}")
        }
    }
    
    /**
     * Save captured USSD response to SharedPreferences
     * UssdDialerService will read this and send to backend as delivery_notes
     */
    private fun saveUssdResponse(text: String) {
        try {
            val low = text.lowercase()
            if (low.contains("using your microphone") || low.contains("using your camera") ||
                low.contains("applications are using")) {
                Log.d(TAG, "🚫 Ignoring system notice, not a carrier response")
                return
            }
            getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putString(KEY_LAST_USSD_RESPONSE, text)
                .putLong(KEY_LAST_USSD_RESPONSE_TIME, System.currentTimeMillis())
                .apply()
            Log.d(TAG, "💾 Saved USSD response to SharedPreferences: ${text.take(100)}")
        } catch (e: Exception) {
            Log.e(TAG, "❌ Failed to save USSD response: ${e.message}")
        }
    }

    /** Save only the terminal carrier message. Intermediate menu/PIN text cannot overwrite it. */
    private fun saveFinalUssdResult(text: String) {
        if (text.isBlank()) return
        try {
            getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putString(KEY_LAST_USSD_FINAL_RESULT, text)
                .putLong(KEY_LAST_USSD_FINAL_RESULT_TIME, System.currentTimeMillis())
                .apply()
            Log.d(TAG, "💾 Saved FINAL carrier result: ${text.take(150)}")
        } catch (e: Exception) {
            Log.e(TAG, "❌ Failed to save final carrier result: ${e.message}")
        }
    }
    
    /**
     * Start listening for additional dialogs for 10 seconds
     * Hormuud often sends 2-3 consecutive USSD dialogs
     */
    private fun startMultiDialogListener() {
        if (holdAwaitingSelection) {
            Log.d(TAG, "⏸️ [Hold] Multi-dialog listener waa la joojiyay — xulasho la sugayo")
            return
        }

        // Cancel any existing runnable
        multiDialogRunnable?.let { handler.removeCallbacks(it) }
        
        multiDialogRunnable = Runnable {
            Log.d(TAG, "🏁 Multi-dialog listener ended. Total clicks: $clickCount")
            
            // Reset click count for next session
            clickCount = 0
            
            // Reset expecting flag
            getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putBoolean(KEY_EXPECTING_USSD, false)
                .apply()
            
            // Send final completion broadcast with package name for Android 13+
            sendBroadcast(Intent(ACTION_USSD_CLICK_COMPLETE).apply {
                setPackage(packageName)
                putExtra("total_clicks", clickCount)
                putExtra("success", true)
            })
        }
        
        handler.postDelayed(multiDialogRunnable!!, MULTI_DIALOG_TIMEOUT_MS)
        Log.d(TAG, "⏳ Started multi-dialog listener for ${MULTI_DIALOG_TIMEOUT_MS/1000}s")
    }
    
    /**
     * Enter PIN into an EditText/input field in the USSD dialog
     * Hormuud sends a PIN prompt after *712*phone*amount# - we auto-enter "8826"
     */
    private fun enterPinInDialog(root: AccessibilityNodeInfo, pin: String): Boolean {
        try {
            val editTexts = mutableListOf<AccessibilityNodeInfo>()
            findEditTexts(root, editTexts)

            if (editTexts.isEmpty()) {
                root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)?.let { focused ->
                    if (focused.isEditable) {
                        editTexts.add(AccessibilityNodeInfo.obtain(focused))
                    }
                    focused.recycle()
                }
            }
            
            Log.d(TAG, "🔐 Found ${editTexts.size} editable fields in USSD dialog")
            if (editTexts.isEmpty()) return typeDigitsViaAccessibility(root, pin)

            var setSuccess = false
            for (editText in editTexts) {
                val existing = editText.text?.toString()?.trim().orEmpty()

                // Force replace existing text with exact PIN value (no appending)
                editText.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
                editText.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                val arguments = android.os.Bundle().apply {
                    putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, pin)
                }
                var success = editText.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, arguments)

                // Some USSD input fields reject ACTION_SET_TEXT but accept paste into the focused field.
                if (!success) {
                    try {
                        val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
                        clipboard.setPrimaryClip(android.content.ClipData.newPlainText("ussd_input", pin))
                        success = editText.performAction(AccessibilityNodeInfo.ACTION_PASTE)
                        Log.d(TAG, "📋 Paste fallback for USSD input success=$success")
                    } catch (pasteError: Exception) {
                        Log.w(TAG, "⚠️ Paste fallback failed: ${pasteError.message}")
                    }
                }

                if (success) {
                    editText.refresh()
                    val after = editText.text?.toString()?.trim().orEmpty()
                    // Require actual text to be present. For password fields text may be hidden
                    // but length is usually reported; accept password only if length matches pin.
                    val accepted = when {
                        after == pin || after.endsWith(pin) -> true
                        editText.isPassword && after.length == pin.length -> true
                        else -> false
                    }
                    if (accepted) {
                        setSuccess = true
                        Log.d(TAG, "✅ USSD input '$pin' set successfully (replaced previous value='$existing', afterLen=${after.length})")
                    } else {
                        // Samsung's USSD EditText often reports its old/blank accessibility
                        // value for a short time even though ACTION_SET_TEXT succeeded. Treat
                        // this as provisionally entered; the caller re-reads every live window
                        // after INPUT_SETTLE_DELAY_MS and will refuse to press Send if it did
                        // not actually commit. Falling back to keyboard here could duplicate it.
                        setSuccess = true
                        Log.d(TAG, "⏳ USSD input action accepted; waiting for accessibility text to settle (currentLen=${after.length})")
                    }
                }
            }

            editTexts.forEach { it.recycle() }
            if (!setSuccess) {
                Log.w(TAG, "⚠️ Text/paste failed; trying digit-key fallback for USSD input")
                setSuccess = typeDigitsViaAccessibility(root, pin)
            }
            return setSuccess
        } catch (e: Exception) {
            Log.e(TAG, "❌ Failed to enter PIN: ${e.message}")
        }
        return false
    }

    /**
     * Verify that at least one EditText in the current dialog has a non-empty value that
     * matches (or contains the length of) the expected input. This prevents pressing Send
     * on an empty menu/PIN field when ACTION_SET_TEXT silently failed.
     */
    private fun verifyInputPresent(root: AccessibilityNodeInfo, expected: String): Boolean {
        return try {
            val edits = mutableListOf<AccessibilityNodeInfo>()
            findEditTexts(root, edits)
            var ok = false
            for (e in edits) {
                e.refresh()
                val txt = e.text?.toString().orEmpty()
                    .replace('\u00A0', ' ')
                    .trim()
                val expectedNormalized = expected.replace('\u00A0', ' ').trim()
                val actualDigits = txt.filter(Char::isDigit)
                val expectedDigits = expectedNormalized.filter(Char::isDigit)
                val match = when {
                    txt == expectedNormalized -> true
                    expectedDigits.isNotEmpty() && actualDigits == expectedDigits -> true
                    e.isPassword && txt.length == expectedNormalized.length -> true
                    else -> false
                }
                if (match) {
                    ok = true
                    Log.d(TAG, "🔎 verifyInputPresent: OK (field text='${if (e.isPassword) "***" else txt}', len=${txt.length}, expectedLen=${expected.length})")
                }
                e.recycle()
                if (ok) break
            }
            if (!ok) Log.w(TAG, "🔎 verifyInputPresent: NO EditText contains expected value (checked ${edits.size} field(s))")
            ok
        } catch (ex: Exception) {
            Log.e(TAG, "❌ verifyInputPresent error: ${ex.message}")
            false
        }
    }

    /**
     * Samsung often exposes the USSD message, input and Send button in separate
     * accessibility windows. Verify the value against every live window instead of
     * trusting only the root selected for the menu text.
     */
    private fun verifyInputAcrossWindows(primary: AccessibilityNodeInfo, expected: String): Boolean {
        if (verifyInputPresent(primary, expected)) return true

        try {
            rootInActiveWindow?.let { activeRoot ->
                if (verifyInputPresent(activeRoot, expected)) return true
            }
            for (window in windows) {
                val windowRoot = window.root ?: continue
                val verified = verifyInputPresent(windowRoot, expected)
                windowRoot.recycle()
                if (verified) return true
            }
        } catch (e: Exception) {
            Log.w(TAG, "⚠️ Could not verify USSD input across windows: ${e.message}")
        }
        return false
    }

    /** Submit only after the caller has verified the exact input in the current dialog. */
    private fun submitFlowStep(
        root: AccessibilityNodeInfo,
        step: Ussd870Flow.Step,
        expectedInput: String,
        attempt: Int = 0
    ) {
        val clicked = clickSendAcrossWindows(root)
        if (clicked) {
            Ussd870Flow.markStepCompleted(this, step.order)
            lastFlow870AttemptKey = ""
            lastFlow870AttemptTime = 0L
            clearFlowAction(step.order)
            Log.d(TAG, "✅ [Flow870] Step ${step.name} submitted and marked completed")
            if (step.isPinField && Ussd870Flow.hasPendingReceiverStep(this)) {
                // Somtel *101*: PIN-ka ka hor lambarka helaha ayaa mararka qaar la weydiiyaa.
                // Ha bilaabin final-result watcher-ka (wuxuu flow-ka xiraa) inta lambarku
                // aan la gelin — halkii, sii wad wadista dialog-yada.
                Log.d(TAG, "⏳ [Flow101] PIN la diray laakiin lambarka helaha wali wuu maqan yahay — flow la sii wadayo")
                handler.postDelayed({
                    if (Ussd870Flow.isActive(this)) tryClickConfirmButton(null)
                }, 400L)
            } else if (step.isPinField) {
                startFinalResultWatcher()
            } else {
                // Samsung may replace the menu without emitting a reliable new event.
                // Re-drive the flow as soon as the next carrier dialog has had time to render,
                // so package_select is not orphaned after Menu 1 was submitted.
                handler.postDelayed({
                    if (Ussd870Flow.isActive(this)) tryClickConfirmButton(null)
                }, 350L)
            }
        } else if (attempt < 20) {
            // Samsung may expose/enable Send slightly after the input value is committed.
            // Keep the step locked and poll fresh windows rather than retyping or stalling.
            Log.w(TAG, "⏳ [Flow870] Send not ready for ${step.name}; retry ${attempt + 1}/20")
            handler.postDelayed({
                val liveRoot = obtainBestUssdRoot(null) ?: run {
                    lastFlow870AttemptKey = ""
                    lastFlow870AttemptTime = 0L
                    clearFlowAction(step.order)
                    return@postDelayed
                }
                val liveStep = Ussd870Flow.matchStep(this, extractDialogText(liveRoot))
                if (liveStep?.order == step.order && verifyInputAcrossWindows(liveRoot, expectedInput)) {
                    submitFlowStep(liveRoot, step, expectedInput, attempt + 1)
                } else {
                    lastFlow870AttemptKey = ""
                    lastFlow870AttemptTime = 0L
                    clearFlowAction(step.order)
                    Log.w(TAG, "⚠️ [Flow870] Dialog changed while waiting for Send; step will be re-evaluated")
                }
                liveRoot.recycle()
            }, 200L)
        } else {
            lastFlow870AttemptKey = ""
            lastFlow870AttemptTime = 0L
            clearFlowAction(step.order)
            Log.e(TAG, "❌ [Flow870] Verified input but Send stayed unavailable for ${step.name}")
        }
    }

    private fun clearFlowAction(stepOrder: Int) {
        if (flowActionStep != stepOrder) return
        flowActionInFlight = false
        flowActionStep = -1
    }

    /** Find Send in every live window; on Samsung it may not share the menu/input root. */
    private fun clickSendAcrossWindows(primary: AccessibilityNodeInfo): Boolean {
        if (clickSendOrOkButton(primary)) return true

        try {
            rootInActiveWindow?.let { activeRoot ->
                if (clickSendOrOkButton(activeRoot)) return true
            }
            for (window in windows) {
                val windowRoot = window.root ?: continue
                val clicked = clickSendOrOkButton(windowRoot)
                windowRoot.recycle()
                if (clicked) return true
            }
        } catch (e: Exception) {
            Log.w(TAG, "⚠️ Could not find Send across USSD windows: ${e.message}")
        }
        return false
    }
    
    /**
     * Recursively find all EditText fields in the view hierarchy
     */
    private fun findEditTexts(node: AccessibilityNodeInfo, results: MutableList<AccessibilityNodeInfo>) {
        try {
            val className = node.className?.toString() ?: ""
            if (className.contains("EditText", ignoreCase = true) || node.isEditable) {
                results.add(AccessibilityNodeInfo.obtain(node))
            }
            for (i in 0 until node.childCount) {
                node.getChild(i)?.let { child ->
                    findEditTexts(child, results)
                    child.recycle()
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "❌ Error finding EditTexts: ${e.message}")
        }
    }

    /**
     * Some carrier dialogs/keyboard windows ignore ACTION_SET_TEXT/ACTION_PASTE.
     * Safe fallback: click visible digit keys only. Inputs here are menu numbers/PIN digits.
     */
    private fun typeDigitsViaAccessibility(root: AccessibilityNodeInfo, value: String): Boolean {
        val digits = value.filter { it.isDigit() }
        if (digits.isEmpty()) return false

        var typedAny = false
        for (digit in digits) {
            val clicked = clickDigitKeyAcrossWindows(root, digit.toString())
            Log.d(TAG, "⌨️ Digit fallback '$digit' clicked=$clicked")
            if (!clicked) return typedAny
            typedAny = true
        }
        return typedAny
    }

    private fun clickDigitKeyAcrossWindows(root: AccessibilityNodeInfo, digit: String): Boolean {
        if (clickDigitKey(root, digit)) return true

        try {
            for (window in windows) {
                val windowRoot = window.root ?: continue
                val clicked = clickDigitKey(windowRoot, digit)
                windowRoot.recycle()
                if (clicked) return true
            }
        } catch (e: Exception) {
            Log.w(TAG, "⚠️ Could not scan windows for digit fallback: ${e.message}")
        }
        return false
    }

    private fun clickDigitKey(root: AccessibilityNodeInfo, digit: String): Boolean {
        val nodes = root.findAccessibilityNodeInfosByText(digit)
        for (node in nodes) {
            try {
                val nodeText = node.text?.toString()?.trim().orEmpty()
                val nodeDesc = node.contentDescription?.toString()?.trim().orEmpty()
                if (nodeText == digit || nodeDesc == digit) {
                    if (clickNodeOrClickableAncestor(node, "digit '$digit'")) {
                        return true
                    }
                }
            } finally {
                node.recycle()
            }
        }
        return false
    }
    
    /**
     * Click Send/OK button after entering PIN
     */
    private fun clickSendOrOkButton(root: AccessibilityNodeInfo): Boolean {
        try {
            // Priority order: Send > OK > Confirm
            val sendButtons = listOf("Send", "send", "SEND", "Dir", "dir", "DIR", "OK", "ok", "Ok", "Confirm", "confirm", "Haye", "haye")
            
            for (buttonText in sendButtons) {
                val nodes = root.findAccessibilityNodeInfosByText(buttonText)
                for (node in nodes) {
                    if (clickNodeOrClickableAncestor(node, "'$buttonText' after USSD input")) {
                        clickCount++
                        lastClickTime = System.currentTimeMillis()
                        Log.d(TAG, "✅ Clicked '$buttonText' after USSD input (click #$clickCount)")
                        startMultiDialogListener()
                        notifyClickComplete()
                        node.recycle()
                        return true
                    }
                    node.recycle()
                }
            }

            if (clickButtonLikeByLabel(root, setOf("send", "ok", "confirm", "dir", "haye"))) {
                clickCount++
                lastClickTime = System.currentTimeMillis()
                Log.d(TAG, "✅ Clicked button-like Send/OK after USSD input (click #$clickCount)")
                startMultiDialogListener()
                notifyClickComplete()
                return true
            }
            
            // IMPORTANT: do not click random buttons/keys in PIN dialog
            Log.w(TAG, "⚠️ No Send/OK button found after PIN set; skipping unsafe fallback click")
        } catch (e: Exception) {
            Log.e(TAG, "❌ Error clicking send after PIN: ${e.message}")
        }
        return false
    }

    /**
     * Click only a terminal result button. Unlike clickSendOrOkButton(), this deliberately
     * excludes Send/Confirm so a menu or PIN prompt can never be submitted accidentally.
     */
    private fun clickFinalResultOk(root: AccessibilityNodeInfo): Boolean {
        val labels = setOf("ok", "o.k.", "okay", "haye", "hagaag", "done", "close", "dismiss", "xir")

        // Capture from the exact window containing the terminal button before dismissing it.
        // Do not veto the whole window because some carrier implementations retain a hidden
        // editable node from the preceding PIN prompt.
        val finalText = extractDialogText(root).orEmpty()
        if (finalText.isBlank() || isKeyboardRoot(root, finalText)) return false

        // Marnaba ha gujin dialog leh field bannaan oo la sugayo gelin — hore OK/Haye
        // ayaa la taabtay iyadoon xirmada la dooran.
        if (hasVisibleEditableNode(root)) {
            val stillNeedsInput = !finalResultModeActive ||
                Ussd870Flow.isActive(this) ||
                Ussd870Flow.isPackageMenuDialog(finalText) ||
                !hasFilledEditableNode(root)
            if (stillNeedsInput) {
                Log.d(TAG, "⏭️ Terminal OK la diiday — dialog-gu wali gelin buu sugayaa")
                return false
            }
        }
        val clicked = clickButtonLikeByLabel(root, labels)
        if (!clicked) return false

        saveFinalUssdResult(finalText)
        clickCount++
        lastClickTime = System.currentTimeMillis()
        Log.d(TAG, "✅ Final carrier result OK clicked (click #$clickCount)")
        startMultiDialogListener()
        notifyClickComplete()
        return true
    }

    /** Search every visible accessibility window; the active root is often the keyboard. */
    private fun clickFinalResultAcrossWindows(primary: AccessibilityNodeInfo? = null): Boolean {
        val roots = mutableListOf<AccessibilityNodeInfo>()
        try {
            primary?.let { roots.add(AccessibilityNodeInfo.obtain(it)) }
            rootInActiveWindow?.let { roots.add(AccessibilityNodeInfo.obtain(it)) }
            for (window in windows) {
                window.root?.let { windowRoot ->
                    roots.add(AccessibilityNodeInfo.obtain(windowRoot))
                    windowRoot.recycle()
                }
            }

            for (root in roots) {
                if (clickFinalResultOk(root)) return true
            }
        } catch (e: Exception) {
            Log.w(TAG, "⚠️ Could not scan all windows for final OK: ${e.message}")
        } finally {
            roots.forEach {
                try { it.recycle() } catch (_: Exception) {}
            }
        }
        return false
    }

    /**
     * Some locked phones do not send a fresh accessibility event when the terminal USSD
     * result replaces the PIN dialog. Poll every 500ms for up to 12 seconds as a fallback.
     */
    private fun startFinalResultWatcher() {
        stopFinalResultWatcher()
        finalResultAttempts = 0
        finalResultModeActive = true

        lateinit var watcher: Runnable
        watcher = Runnable {
            finalResultAttempts++
            val clicked = clickFinalResultAcrossWindows()

            if (clicked) {
                Ussd870Flow.finish(this)
                stopFinalResultWatcher()
                Log.d(TAG, "🏁 Final result dismissed by watcher")
            } else if (finalResultAttempts < (if (Ussd870Flow.isSomtel101Flow(this)) 90 else 24)) {
                handler.postDelayed(watcher, 500L)
            } else {
                Log.w(TAG, "⚠️ Final result watcher ended without finding an OK button")
                // Last-resort dismissal prevents a carrier dialog from blocking the next order.
                dismissDialogWithBack()
                Ussd870Flow.finish(this)
                stopFinalResultWatcher()
            }
        }

        finalResultRunnable = watcher
        handler.postDelayed(watcher, 500L)
        Log.d(TAG, "👀 Final result watcher started")
    }

    private fun stopFinalResultWatcher() {
        finalResultRunnable?.let { handler.removeCallbacks(it) }
        finalResultRunnable = null
        finalResultAttempts = 0
        finalResultModeActive = false
    }

    private fun clickNodeOrClickableAncestor(node: AccessibilityNodeInfo, label: String): Boolean {
        try {
            if (isClickableButton(node) && node.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
                Log.d(TAG, "✅ Clicked node for $label")
                return true
            }

            var parent = node.parent
            var depth = 0
            while (parent != null && depth < 4) {
                val nextParent = parent.parent
                val clicked = parent.isEnabled && parent.isClickable && parent.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                if (clicked) {
                    Log.d(TAG, "✅ Clicked ancestor depth=$depth for $label")
                    nextParent?.recycle()
                    parent.recycle()
                    return true
                }
                parent.recycle()
                parent = nextParent
                depth++
            }
        } catch (e: Exception) {
            Log.w(TAG, "⚠️ Click failed for $label: ${e.message}")
        }
        return false
    }

    private fun clickButtonLikeByLabel(root: AccessibilityNodeInfo, labels: Set<String>): Boolean {
        try {
            val text = root.text?.toString()?.trim()?.lowercase().orEmpty()
            val desc = root.contentDescription?.toString()?.trim()?.lowercase().orEmpty()
            val className = root.className?.toString().orEmpty()
            val isButtonLike = className.contains("Button", ignoreCase = true) ||
                className.contains("TextView", ignoreCase = true)

            if (root.isEnabled && isButtonLike && (text in labels || desc in labels)) {
                if (clickNodeOrClickableAncestor(root, "button-like '$text$desc'")) return true
            }

            for (i in 0 until root.childCount) {
                val child = root.getChild(i) ?: continue
                val clicked = clickButtonLikeByLabel(child, labels)
                child.recycle()
                if (clicked) return true
            }
        } catch (e: Exception) {
            Log.w(TAG, "⚠️ Button-like search failed: ${e.message}")
        }
        return false
    }
    
    /**
     * Send broadcast to notify UssdDialerService that we clicked a button
     */
    private fun notifyClickComplete() {
        try {
            val intent = Intent(ACTION_USSD_CLICK_COMPLETE).apply {
                setPackage(packageName)  // Required for Android 13+
                putExtra("click_count", clickCount)
                putExtra("timestamp", System.currentTimeMillis())
            }
            sendBroadcast(intent)
            Log.d(TAG, "📢 Sent USSD_CLICK_COMPLETE broadcast with setPackage (click #$clickCount)")
        } catch (e: Exception) {
            Log.e(TAG, "❌ Failed to send broadcast: ${e.message}")
        }
    }

    private fun isClickableButton(node: AccessibilityNodeInfo?): Boolean {
        if (node == null) return false
        
        val className = node.className?.toString() ?: ""
        val isButton = className.contains("Button", ignoreCase = true) ||
                      className.contains("TextView", ignoreCase = true)
        
        return node.isClickable || (isButton && node.isEnabled)
    }

    private fun findAndClickAnyButton(root: AccessibilityNodeInfo): Boolean {
        try {
            // Recursively search for any button in the view hierarchy
            for (i in 0 until root.childCount) {
                val child = root.getChild(i) ?: continue
                
                val className = child.className?.toString() ?: ""
                
                if (className.contains("Button", ignoreCase = true) && child.isClickable) {
                    val text = child.text?.toString() ?: ""
                    Log.d(TAG, "🔍 Found button: '$text' - attempting click...")
                    
                    if (child.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
                        clickCount++
                        lastClickTime = System.currentTimeMillis()
                        Log.d(TAG, "✅ Clicked button: '$text' (click #$clickCount)")
                        startMultiDialogListener()
                        notifyClickComplete()
                        child.recycle()
                        return true
                    }
                }
                
                // Recurse into children
                if (findAndClickAnyButton(child)) {
                    child.recycle()
                    return true
                }
                child.recycle()
            }
        } catch (e: Exception) {
            Log.e(TAG, "❌ Error searching for buttons: ${e.message}")
        }
        return false
    }
    
    /**
     * FALLBACK: Use GLOBAL_ACTION_BACK to dismiss dialog if no button found
     */
    private fun dismissDialogWithBack() {
        Log.d(TAG, "⚠️ No button found, using GLOBAL_ACTION_BACK fallback to dismiss dialog")
        val result = performGlobalAction(GLOBAL_ACTION_BACK)
        if (result) {
            clickCount++
            lastClickTime = System.currentTimeMillis()
            Log.d(TAG, "✅ GLOBAL_ACTION_BACK successful (click #$clickCount)")
            startMultiDialogListener()
            notifyClickComplete()
        } else {
            Log.e(TAG, "❌ GLOBAL_ACTION_BACK failed")
        }
    }

    override fun onInterrupt() {
        Log.d(TAG, "UssdAccessibilityService interrupted")
    }

    // ===================== SESSION HOLD KEEP-ALIVE =====================

    private var holdKeepAliveRunnable: Runnable? = null

    /**
     * Inta lacag-bixintu socoto, dialog-ga USSD wuu furan yahay. Halkan waxaan:
     *  1) 2.5s kasta dib u akhrinaa windows-ka si node-yadu ay u sii firfircoonaadaan
     *     (refresh) — taasi waxay ka celinaysaa in system-ku dialog-ga uu recycle gareeyo.
     *  2) Kaydinaa qoraalka menu-ga tooska ah [heldMenuLive] si xulashada dabadeed
     *     loo xaqiijiyo in xirmadu weli la mid tahay.
     * Session-ka USSD-ga waqtigiisa shirkaddu ayaa leh; haddii ay xirto [heldMenuLive]
     * wuxuu noqonayaa null, dialer-kuna wuxuu bilaabayaa renewal (dial cusub).
     */
    private fun beginHoldKeepAlive() {
        endHoldKeepAlive()
        Log.d(TAG, "🫀 [Keep-alive] Bilaabay — session la ilaalinayaa")
        var consecutiveMisses = 0
        val runnable = object : Runnable {
            override fun run() {
                val menu = try { findPackageMenuAcrossWindows() } catch (_: Exception) { null }
                if (!menu.isNullOrBlank()) {
                    heldMenuLive = menu
                    consecutiveMisses = 0
                } else {
                    // App-ka lacag-bixinta ama lock-screen-ku wuxuu qarin karaa USSD window-ka
                    // iyadoo session-ku weli nool yahay. Ha tirtirin menu-gii ugu dambeeyay:
                    // null-ku wuxuu hore u dhalin jiray renewal/redial been-abuur ah.
                    consecutiveMisses++
                    if (consecutiveMisses == 6) {
                        Log.w(TAG, "🫀 [Keep-alive] Menu 15s lama arag; kii la xaqiijiyay waa la hayaa ilaa xulasho timaado")
                    }
                }
                handler.postDelayed(this, 2500)
            }
        }
        holdKeepAliveRunnable = runnable
        handler.post(runnable)
    }

    private fun endHoldKeepAlive() {
        holdKeepAliveRunnable?.let { handler.removeCallbacks(it) }
        holdKeepAliveRunnable = null
        Log.d(TAG, "🫀 [Keep-alive] Joojiyay")
    }

    /**
     * Kicin degdeg ah kadib lacag-bixinta: guard-yada dib u deji, kadibna isla markiiba
     * dialog-ga furan ku shaqee (galinta safka + Send), oo poller-ka sii wad.
     */
    private fun beginFlowResume() {
        handler.post {
            // Xulasho waa la helay — hadda gujintu waa la fasaxay.
            holdAwaitingSelection = false
            endHoldKeepAlive()

            lastFlow870AttemptKey = ""
            lastFlow870AttemptTime = 0L
            flowActionInFlight = false
            flowActionStep = -1
            finalResultModeActive = false
            getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
                .putBoolean(KEY_EXPECTING_USSD, true)
                .putLong(KEY_LAST_USSD_TIME, System.currentTimeMillis())
                .apply()
            Log.d(TAG, "▶️ [Hold] Resume kicinaya — dialog-ga furan ayaa la doonayaa")
            startFlowWatcher()
            try { tryClickConfirmButton(null) } catch (e: Exception) {
                Log.w(TAG, "⚠️ [Hold resume] ${e.message}")
            }
        }
    }



    override fun onDestroy() {
        super.onDestroy()
        if (instance === this) instance = null
        multiDialogRunnable?.let { handler.removeCallbacks(it) }
        stopDiscoveryMenuWatcher()
        stopFlowWatcher()
        stopFinalResultWatcher()
        endHoldKeepAlive()
        heldMenuLive = null
        holdAwaitingSelection = false

        Log.d(TAG, "UssdAccessibilityService destroyed")
    }

}
