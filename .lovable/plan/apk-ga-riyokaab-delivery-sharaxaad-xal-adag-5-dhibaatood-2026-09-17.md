# APK-ga Riyokaab Delivery — sharaxaad + xal adag (5 dhibaatood)

## Sida nidaamku hadda u shaqeeyo (si aad u fahanto)

1. Dalab (manual / online / offline) → saf lagu abuuro `delivery_queue`.
2. Telefoonka (APK) 12 ilbiriqsi kasta wuxuu weydiiyaa server-ka "ma jiraa dalab aan qaado?".
3. Marka uu qaato: USSD ayuu garaacaa, dialog-yada shirkadda ayuu si otomaatig ah u buuxiyaa
   (xirmada, lambarka, PIN-ka).
4. Jawaabta ugu dambeysa ee shirkaddu soo saarto ayuu server-ka u diraa → `completed` ama `failed`.
5. Haddii jawaab la waayo → `verification_required` (macnaheedu: "lama hubo, gacanta ku hubi").

---

## Ciladaha: sababta + xalka

### 1) Dalabyada manual-ka ah ma dhacaan / verification_required ayey noqdaan
**Sababta (xog dhab ah):** dhammaan 15-ka saf ee hadhay — manual, online iyo offline — waxay wataan
isla qoraal: *"USSD dispatched but no provider callback within 90s"*. Micnaha: telefoonku USSD wuu diray,
laakiin jawaabta shirkadda ma qabanin 90 ilbiriqsi gudahood. Flow-yada sida *101 (Somtel) waxay qaadan
karaan 5 dialog oo ilaa 2–3 daqiiqo ah — 90 ilbiriqsi kuma filna. Dalabku wuu dhici karaa inuu guuleystay,
laakiin nidaamku ma oga, sidaa darteed "verification_required" ayuu ku dhufanayaa.

**Xalka:** waqtiga sugitaanka jawaabtu wuxuu ku xirnaan doonaa nooca flow-ga (caadi 60s, *101/*870/*866/*212
ilaa 180s). Jawaab kasta oo soo baxda — xitaa mid soo daahay — waa la qabanayaa oo server-ka loo dirayaa.
`verification_required` waxaa la isticmaalayaa oo keliya marka dhab ahaan wax jawaab ah la waayo.

### 2) Dalab caadi ah oo pending ku haray, aan la dirin
**"Quful" waa maxay?** Hal SIM mar keliya hal USSD ayuu wadi karaa — telefoon labo USSD isku mar ma
garaaci karo (shirkaddu hal session ayey furtaa). Sidaa darteed inta dalab socdo, SIM-kaas "xiran" ayuu
yahay. Taasi caadi waa.

**Sababta dhibaatadu u dhacdo:** hadda qufulku ma aha mid SIM ah — waa **hal quful oo device-ka oo dhan
xira** (`isProcessingOrder`), xitaa labada SIM. Weliba ma laha waqti kama dambeys ah: haddii hal flow
istaago (dialog aan soo bixin), qufulku weligiis xiran ayuu ahaanayaa ilaa app-ka dib loo furo — device-ku
wuxuu u muuqdaa "Online" laakiin dalab dambe qaadi maayo. Baarista *212* sidoo kale qufulka ayey sidaa
inta session-ka la hayo.

**Xalka — hal USSD hal device + lease/heartbeat:**
- **Hal telefoon = hal USSD mar keliya** (labada SIM isma raacayaan). Sababta: AccessibilityService-ku
  wuxuu arkaa dialog kasta; haddii 2 USSD isku mar socdaan, wuxuu PIN-ka dalab A ku qori karaa dalab B.
- Haddii telefoon kale oo ku habboon oo online/bannaan jiro, server-ku order-kaas isaga ayuu siin karaa;
  haddii uusan jirin, order-ku wuxuu sugayaa device bannaan.
- Marka device dalab qaato, server-ku wuxuu u sameeyaa **lease** (4–5 daqiiqo). Inta heartbeat-ku socdo,
  cid kale dalabka ma qaadi karto — xitaa haddii *101 uu qaato 3 daqiiqo.
- Lease-ku wuxuu ka hortagayaa in order-ku ku xannibmo device dhintay ama crash-gareeyey. Duplicate
  prevention-ka waxaa si gaar ah u maamulaya active-order guard.
- Qufulka gudaha app-ka wuxuu leeyahay waqti kama dambeys (240s). Marka timeout-ku dhaco, lock-ka si toos
  ah ma furmayo: marka hore USSD session-ka cancel/cleanup, flow state clear, kadib unlock/recovery.
- *212 discovery ma xannibayo system-ka oo dhan; isla device-ka hal USSD ayaa ka socon kara, laakiin device
  kale oo bannaan ayaa qaadan kara orders-ka kale.

### 3) Dalabyada manual-ka si nadiif ah ha u baxaan
**Sababta:** dalabyada manual-ka ah wadada ay maraan waa isla mid, laakiin marmar USSD-gu wuu dhiman yahay
(lambar/PIN aan la buuxin) oo safku pending ayuu iska fadhiyaa iyadoo aan cidna ogeyn.

**Xalka:** marka dalab manual la abuuro, USSD-ga waa la hubinayaa (lambarka + PIN la beddelay). Haddii wax
maqan yihiin, isla markaas qalad cad ayaa la tusayaa halkii uu si aamusan u lumi lahaa.

### 4) Jawaab qaldan ama verification_required in kasta oo la diray
**Sababta (caddayn cusub, 17 Sep 13:12–13:22):**
- 13:20 dalab manual (622548664, Somtel *101) → USSD waa la diray, 90s jawaab lama helin →
  `verification_required`. (13:14 saf hore ayuu lahaa — taasi waa **dib-u-dirid xigxigta**, ma aha laba
  gaarsiin isku mar dhacday.)
- 13:22 dalab online (isla lambar, *101) → isla sidii.
- 13:12 saf "completed" jawaabtiisu waxay ahayd `"Choose what to show in the All tab | SIM 1 | SIM 2 | OK"` —
  taasi waa qoraal shaashadda Android, ma aha jawaabta Somtel. Micnaha: app-ku dialog kasta oo soo baxa
  ayuu qabtaa, mararka qaarna mid khaldan ayuu server-ka u diraa.

**Sabab-guud:** app-ku jawaabta dhabta ah ee *101 ma qabto — 90s ayuu sugaa, kadibna wixii dialog ah ee
u dambeeyay ayuu qaataa. Sidaa darteed dalabku wuu dhici karaa inuu guuleystay, haddana
`verification_required` ama jawaab khaldan ayuu muujinayaa.

**Xalka:**
- Jawaabta la aqbalayo waa in ay noqoto mid dhab ah oo shirkadda ka timid (Somali/English keywords +
  diidmada qoraallada Android UI sida "SIM 1 | SIM 2 | Recents | Google Voice Typing").
- 180s sugitaan flow-yada *101/*870/*866/*212, oo jawaab soo daahday la qabanayo (late callback).
- Marka jawaab dhab ah la helo: `completed`/`failed` — `verification_required` waxaa la isticmaalayaa
  oo keliya marka dhab ahaan waxba la waayo.
- Dib-u-dirid: hal saf firfircoon hal order — saf cusub kaliya marka kii hore dhammaaday ama lease-kiisu
  dhacay, si aan gaarsiin labanlaab ah mustaqbalka u dhicin.

### 5) APK-gu iskiis ayuu log out sameeyaa
**Sababta:** token-ka gelitaanku wuxuu dhacaa 1 saac kadib. App-ku refresh token wuu kaydiyaa laakiin
**marnaba ma isticmaalo** — `isLoggedIn()` waxay keliya eegtaa waqtiga, markaa Splash-ku Login ayuu ku celiyaa.

**Xalka:** `refreshSession()` ayaa lagu darayaa; app-ku 45 daqiiqo kasta ayuu token-ka cusboonaysiin doonaa,
Splash-kuna refresh ayuu isku dayayaa ka hor inta aanu Login ku celin. Log out waxaa keliya sameeyn kara
adiga.

### Dheeraad: "Riyokaab Delivery isn't responding" (ANR)
**Sababta:** watchdog-gu 15 daqiiqo kasta service-ka wuu joojiyaa kadibna wuu bilaabaa (`stopService` +
`Thread.sleep`) xitaa marka dalab socdo; shaqooyin culus sida akhrinta SMS inbox ayaa main thread saaran.
**Xalka:** watchdog-gu service-ka ma joojinayo hadii uu shaqaynayo; shaqada culus dhammaan background ayey
u guurayaan.

---

## Sida ay wax u shaqayn doonaan kadib isbeddelka

Order → device claim → lease → hal USSD → validated provider response → completed/failed → cleanup → unlock.

Haddii device-ku dhinto: heartbeat stops → lease expires → device kale ayaa reclaim gareeya.

Haddii final response la waayo: flow timeout → cleanup → `verification_required`, laakiin late callback sax
loo correlate-gareeyey waa la aqbali karaa.

- Dalab kasta (manual, online, offline) hal wado ayuu maraa, hal mar ayaa la diraa.
- Hal telefoon hal USSD mar keliya — labada SIM isku mar ma shaqaynayaan (si dialog-yadu isugu qasmin).
- Haddii telefoon kale oo ku habboon oo online/bannaan jiro, server-ku order-kaas isaga ayuu siin karaa;
  haddii uusan jirin, order-ku wuxuu sugayaa device bannaan.
- Device-ku isma xirayo, app-kuna isma log out gareynayo.

## Faahfaahin farsamo

**Android (`android-app/`)**
- `auth/AuthRepository.kt`: `refreshSession()` (`grant_type=refresh_token`) + `ensureValidToken()`;
  `SplashActivity` iyo `UssdDialerService` ayaa wacaya.
- `service/UssdDialerService.kt`: `isProcessingOrder` → quful device-heer ah leh `orderId` + timestamp iyo
  timeout 240s (hal USSD hal device). Cooldown-ka waxaa loo dhimi karaa qiyaastii 2–3s kadib marka final
  dialog la dismiss/cleanup-gareeyo; haddii session-kii hore wali nool yahay, order cusub ha bilaaban.
  Waqtiga sugitaanka jawaabta wuxuu ka imanayaa nooca flow-ga (ilaa 180s); SMS inbox polling
  `Dispatchers.IO`; recovery marka `processOrder` istaago.
- `service/UssdAccessibilityService.kt` + `receiver/UssdFinalResultReceiver.kt`: kaliya **validated provider
  terminal response** ayaa la kaydinayaa oo server-ka loo dirayaa. Android/System UI text lama aqbalayo.
  Late callback waxaa la aqbalayaa oo keliya haddii uu si sax ah ugu xiran yahay `queueId`/`orderId` kii
  session-kaas, si response order hore aanu order cusub ugu dhicin.
- `worker/ServiceWatchdogWorker.kt`: `Thread.sleep` ka saar; `stopService` oo keliya marka service-ku jabay.
- `api/DeliveryApiClient.kt`: `updateDeliveryStatus` 3 jeer retry; heartbeat lease-ka cusbooneysiinaya.

**Database**
- `delivery_queue`: `lease_expires_at` + `lease_device_id`; `claim_next_delivery` wuxuu bixinayaa lease
  4–5 daqiiqo ah oo heartbeat-ku cusbooneysiiyo.
- Dib-u-qaadis (reclaim) **kaliya** marka lease-ku dhaco (heartbeat la waayo) — ma aha waqti adag oo 3 daqiiqo.
- Partial unique index ama trigger ayaa diidaya laba active queue row oo isku `order_id` ah.
- `guard_interactive_ussd_processing` waqtiga loo waafajinayo flow-ga dhabta ah (ma aha 90s adag).
- Lease heartbeat-ku waa inuu ku xirnaadaa active `queueId`/`orderId`-ka saxda ah; heartbeat guud oo
  device-level ah yuusan lease order duug ah sii noolayn.

**Dhammaystir:** APK cusub waa in lagu dhisaa GitHub Actions oo device kasta lagu rakibaa — isbeddellada
telefoonka APK-gii hore kuma jiraan.
