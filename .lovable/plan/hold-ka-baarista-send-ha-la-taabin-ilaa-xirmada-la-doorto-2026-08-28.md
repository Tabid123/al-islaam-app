# Hold-ka baarista: Send ha la taabin ilaa xirmada la doorto

## Waxa logcat-ku muujiyay (la xaqiijiyay)

Diiwaanka 15:43 (job `4eaa8241`):

```text
16.913  🔎 [Discovery] Package menu captured: --Maamuus--
16.914  ⏸️ [Discovery] Session la sii hayay (hold)
17.748  🎯 Found button: 'Send' - clicking...
17.751  ✅ Successfully clicked 'Send' button (click #2)
25.396  ⏸️ [Hold] Session furan — keep-alive shidan, xulasho la sugayo
```

Menu-ga xirmooyinka waa la qabtay oo hold waa la bilaabay, laakiin ~0.8s
kadib `tryClickConfirmButton()` ayaa helay badhanka **Send** oo taabtay
**iyadoon saf/xirmo la gelin**. Sidaas darteed session-ku wuxuu u
gudbayaa tallaabo aan la rabin ka hor inta user-ku lacagta bixin.

Sababta: marka hold-ku bilaabmo, poller-ka flow-ka iyo event-handler-ku
wali waxay wadaan raadinta `CONFIRM_BUTTONS` (Send/OK) — ma jiro wax
xannibaya guud ahaan gujinta inta xulasho la sugayo.

## Waxa la beddelayo

### 1. Xannib gujis kasta inta hold socoto (`UssdAccessibilityService.kt`)
- Ku dar calaamad `@Volatile holdAwaitingSelection` oo la shido isla
  markii menu-ga xirmooyinka la qabto (labada meelood: event path iyo
  discovery watcher), lana damiyo marka:
  - xulasho la xaqiijiyay la helo (`resumeFlowNow` / `resumeHeldSelection`), ama
  - `stopHoldKeepAlive()` la wacayo (hold dhamaaday/session luntay).
- Inta ay shidan tahay:
  - `tryClickConfirmButton()` waa ka noqonayaa ka hor raadinta
    `CONFIRM_BUTTONS` (log: `⏸️ [Hold] Send/OK waa la xannibay — xulasho la sugayo`),
  - `startFlowWatcher()` tick-yadu waxay kaliya sii wadayaan keep-alive
    akhrinta menu-ga — gujis ma sameynayaan,
  - `startMultiDialogListener()` iyo terminal-OK poller-ku waa demin
    inta hold-ku socdo.

### 2. Xulashada kaliya ayaa furta gujinta
- Marka `resumeHeldSelection` safka la xaqiijiyay soo celiyo:
  `holdAwaitingSelection = false`, kadibna la maro **isla pipeline-ka**:
  gelin input → sug 1s → xaqiiji in fiildhku leeyahay qiimaha → Send.
- Haddii xaqiijintu fashilanto, Send **lama** taabanayo (sidii hore),
  waxaana dib loo kicinayaa watcher-ka.

### 3. 1s sugitaan kadib gelinta xirmada
- `INPUT_SETTLE_DELAY_MS` (1000ms) waa la adkeynayaa in loo mari jiro
  **dhammaan** waddooyinka gelinta — gaar ahaan waddada resume-ka
  ee lacag-bixinta kadib, oo hadda toos u gudbi karta Send.

### 4. Log cad
- `⏸️ [Hold] Gujis la diiday (Send)` marka xannibaadu shaqeyso, si
  logcat-ka xiga uu si toos ah u muujiyo in aan Send la taabanin.

## Faahfaahin farsamo
File kaliya: `android-app/app/src/main/kotlin/com/riyokaab/delivery/service/UssdAccessibilityService.kt`
(calaamadda hold, guards-ka `tryClickConfirmButton`/watcher/multi-dialog,
iyo settle-delay-ga waddada resume-ka). Ussd870Flow iyo server-ku isbeddel ma leh.

Xaqiijinta ugu dambeysa waxay u baahan tahay APK cusub + logcat cusub —
sandbox-ku ma fulin karo dialog-yada shirkadda.
