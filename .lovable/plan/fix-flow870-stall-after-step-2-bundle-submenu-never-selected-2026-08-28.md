# Fix Flow870 stall after step 2 (bundle submenu never selected)

## What the logs actually show

After `menu_data` (step 2) is submitted, the carrier bundle menu (`--Maamuus-- 1. $0.15=... 4. $0.25=Internet aan xadidnayn, 8 Saac`) appears ~600ms later and stays on screen unchanged for ~72s, yet the service never enters a row and never presses Send a second time.

Confirmed causes in `UssdAccessibilityService.kt` / `Ussd870Flow.kt`:

1. **No poller drives step matching.** `startFlowWatcher()` runs every 700ms but only calls `tryClickConfirmButton(null)` — it never re-runs `Ussd870Flow.matchStep()`. Step matching happens only inside `onAccessibilityEvent`. Samsung frequently renders the next USSD dialog without a usable window event, so the visible bundle menu is polled and discarded 10–100ms at a time with nothing acting on it.
2. **The "Dialog changed before Send" path is a dead end.** In the delayed post-input check, when `liveStep?.order != step.order` the code clears the action lock and returns with no rescheduled re-check. Because that stale callback belongs to the already-completed step 2, the warning is harmless in itself — but nothing re-drives the flow afterwards.
3. **Ambiguous logging.** `obtainBestUssdRoot()` returning null and `matchStep()` returning null log the same way, so "dialog not there yet" and "dialog present but not matched" were indistinguishable.

## Changes

### `UssdAccessibilityService.kt`
- Turn `startFlowWatcher()` into a real step driver: each tick (200ms while a step is pending, backing off to 700ms when idle, capped at the existing overall window) freshly calls `obtainBestUssdRoot(null)`, extracts text, runs `Ussd870Flow.matchStep()`, and if a not-yet-completed step matches and `flowActionInFlight` is false, runs the same enter-input → verify → Send pipeline used by the event path. Keep the existing terminal/OK-button click in the same tick.
- Extract the current inline event-handler block into a single reusable `driveFlowStep(root, dialogText)` function so the event path and the watcher path share identical logic (no divergence between them).
- Always re-query the root node at the moment of each check and recycle it after; never hold a node across the Send click.
- On the `liveStep?.order != step.order` branch, clear the lock and immediately kick the watcher (short 200ms tick) instead of ending the cycle.
- Distinct logging: `no USSD root available`, `root present but matchStep=null (text=…)`, `step already completed`, and `step matched` — so the next logcat separates "not rendered" from "lookup failed".

### `Ussd870Flow.kt`
- Verify `package_select` matching against the exact live format (`--Maamuus--` header, `N. $price=label` rows, pipe-flattened variant). Existing `isPackageMenuDialog` + `isUssdDialogText` handle it; add a unit test with the literal logged menu text to lock this in, plus one that asserts `$0.25 / 8 Saac` resolves to row 4.

### Tests
- Extend `Ussd870FlowTest.kt` with the real logged step-1 menu (`1.Data 2.Kuhadal 3.Data iyo Kuhadal | Cancel | Send`) and the real step-2 menu, asserting step routing (`menu_data` then `package_select`) and row 4 selection for the `$0.25 / 8 Saac` order.

## Acceptance
Two Send clicks per order: `menu_data` submitted, bundle submenu detected within ~1s of rendering even with no accessibility event, correct row entered, Send clicked. Transient `expected step N, found …` warnings are allowed only if the watcher retries and succeeds.

## Note
Final confirmation requires a fresh APK build and a new logcat capture on the device; the sandbox cannot exercise the carrier dialogs.
