# Xalka Data Sender (APK Al-islaam): lacag la bixiyay, xirmo aan la dirin

## Waxa baaritaanku muujiyay (xog dhab ah)

1. **Sababta 1aad (la xaqiijiyay) — menu-ga Somtel ayuu ku xayiraa.**
   Menu-ga ugu horreeya ee `*101#` wuxuu leeyahay "7. Xulimo-Social **Bundle**". APK-gu ereyga "Bundle" ayuu u qaataa in kani yahay liiska xirmooyinka, sidaas darteed:
   - "Dhameys Plus" (Menu 1) lama doorto,
   - wuxuu raadiyaa "6 hrs" oo aan menu-gan ku jirin, waxba ma qoro,
   - dialog-ga furan ayuu iska dhaafaa: sanduuqa qoraalka waa madhan yahay (sida sawirka macmiilka).
   Lacagta waa la qaatay, xirmana lama dirin.
2. **Sababta 2aad — dalabyadu "la hubin" (unverified) ayay ku xayirmaan.** Marka dialog-gu xayiro, natiijo ma soo laabato. Kadib server-ku dalabka wuxuu calaamadeeyaa "Device result not received — verify", qof admin ah ayaana gacanta ku hubin. Database-ka waxaa ku jira dalabyo noocaas ah iyo 4 dalab `*101#` oo "pending" ku xayiran tan iyo 27 Oct.
3. **Dib-u-isku-dayyo badan oo fashilmay.** 19 isku-day ayaa la sameeyay lambar horay xirmada u haystay ("horey ayuu u haystaa adeega Unlimited"), 13 kalena lambar aan shaqaynayn. Fashil joogto ah dib looma isku dayo, laakiin hadda waa lagu celceliyaa.
4. **Lacag aan dalab lahayn.** Lacag-bixin $0.1 ah (06 Nov) way timid, laakiin waxay ahayd "unmatched". Macmiilku wax ma helo, admin-kuna wax ogeysiis ah ma helo.

## Waxa la hagaajinayo

**A. APK — menu-ga Somtel/Hormuud/Somnet (sababta ugu weyn)**
- Liiska xirmooyinka waxaa loo aqoonsanayaa oo keliya marka safafka badankood ay leeyihiin qiime ama cabbir ($, MB/GB, saac/hrs, maalin). Hal erey oo "Bundle" ah kuma filna.
- Menu 1 (tusaale "Dhameys Plus") ayaa mudnaanta koowaad leh: haddii magaciisu ka muuqdo dialog-ga, isaga ayaa la doortaa.
- **Marnaba dialog lagama tagi doono isagoo furan.** Haddii magaca xirmada la waayo, ama 8 ilbiriqsi la sugo iyadoo aan wax isbeddelin, session-ka waa la xiraa (Cancel). Dalabka waxaa loo calaamadeeyaa "Failed" waxaana lagu darayaa sabab cad iyo qoraalka menu-ga, si admin-ku u arko.
- Farriinta ugu dambeysa ee shirkadda waa la akhrinayaa. "Ku guulaysatay / laguu furay" waxay noqonaysaa **Delivered**. "Horey u haystaa / ma shaqaynayo / haraag kuma filna / PIN qalad" waxay noqonaysaa **Failed**, dib-u-isku-dayna lama sameynayo.

**B. Xawaare — lacagta ilaa ~15 ilbiriqsi gudahood**
- Marka SMS-ka lacagtu yimaado, isla markiiba dalabka waa la qaadaa (hadda wuxuu sugi karaa ilaa 12–20 ilbiriqsi).
- Wakhtiga sugitaanka natiijada ayaa la gaabinayaa, si dalab xayiran aanu u joojin kuwa ka dambeeya.

**C. Server — dalab aan xayirmin**
- Dalabyada ku xayiran "pending/processing" in ka badan 3 daqiiqo si toos ah ayaa loo eegayaa: haddii natiijo jirto, waa la xirayaa; haddii kale, waxaa loo gudbinayaa admin-ka si cad.
- Fashil joogto ah (lambar horay u haysta, lambar aan shaqaynayn) dib looma isku dayo. Waa la joojiyaa, admin-kana waa loo muujiyaa.
- Lacag "unmatched" ah oo timaada waxay ka muuqanaysaa liiska admin-ka iyadoo calaamad cas leh, waxaana lagu darayaa badhan "Dir xirmada / Celi".

**D. Hubin**
- Tijaabooyin Kotlin ah oo isticmaalaya qoraalka dhabta ah ee menu-ga Somtel ee sawirka: in "Dhameys Plus" la doorto, in "Bundle" uusan khalad keenin, iyo in magac la waayay uu xiro session-ka.
- Tijaabooyinka fariimaha guusha iyo fashilka.
- APK cusub ayaa laga dhisayaa GitHub Actions (sandbox-ka ma dhisi karo APK).

## Xusuusin daacad ah
"100% kalsooni" waxaa lagu gaari karaa oo keliya marka APK-ga cusub lagu rakibo telefoonka data sender-ka, lagana tijaabiyo dalab dhab ah oo `*101#` ah. Code-ka iyo tijaabooyinka waan hubin karaa, laakiin telefoonka dhabta ah anigu ma tijaabin karo.

## Faahfaahin farsamo
- `Ussd870Flow.isPackageMenuDialog`: shardi ka dhig in ≥60% safafka tirsan ay leeyihiin price/size marker; "bundle" ka saar marker-ka keligiis.
- `matchStep`: haddii `menu_data` aan la dhammeyn oo Menu 1 label uu ku jiro dialog-ga (`resolveMenuField(..., allowDefault=false)` ≠ ""), soo celi `menu_data` ka hor `package_select`.
- `UssdAccessibilityService` (line ~423, `input.isBlank()`): ku beddel `cancelSession + reportFailure(order, reason, dialogText)`. Ku dar stall watchdog (8s, isla dialog hash) oo Ussd870Flow firfircoon.
- `SmsReceiver` → payment match ka dib `TRIGGER_IMMEDIATE_POLL` intent; `UssdDialerService` busy interval 3s → 2s, kadib packet ka dib 30s.
- Edge `process-payment-receipt` / delivery_queue: classifier fashil-joogto ah (`horey ayuu u haystaa`, `ma shaqaynayo`) → `failed_permanent`, retry ma jiro. SQL function + cron-ka server route ah ee stuck >3 min → `verification_required` + admin flag.
- Tests cusub: `android-app/app/src/test/kotlin/com/alislaam/.../Ussd870FlowSomtelTest.kt`.
