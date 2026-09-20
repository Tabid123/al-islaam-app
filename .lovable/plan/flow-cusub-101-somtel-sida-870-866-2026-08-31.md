# Flow cusub *101* (Somtel) — sida *870*/*866*

## Hadafka
Ku dar shabakad Saddexaad oo menu-flow ah: **Somtel *101***. Logic-ka waa kan *870*/*866* (menu → xirmo → PIN), laakiin farqi muhiim ah: **lambarka helaha (receiver) lagama darayo dial code-ka** — waxaa la garaacayaa `*101#` kadibna lambarka waxaa laga galiyaa tallaabo menu ah (dialog-ka), ka hor PIN-ka.

## Isbeddelada Android (`Ussd870Flow.kt` + `UssdDialerService.kt`)

1. **Diiwaangeli prefix-ka**: ku dar `"*101*"` liiska `MENU_FLOW_PREFIXES` — taasi si otomaatig ah u dhaqaajisaa `isFlow870()`, `dialPrefix()`, iyo dhammaan flow-ka la wadaago.

2. **Trigger code gaar ah *101***: `triggerCode()` hadda wuxuu soo saaraa `*101*{receiver}#`. Ku dar branch:
   - Haddii prefix = `"*101*"` → soo celi kaliya `"*101#"` (receiver laguma daro).
   - Prefix-yada kale siday yihiin ha u ahaadeen.

3. **Tallaabo lambarka helaha (receiver step)**: flow-ku hadda ma kaydsanayo receiver-ka (wuxuu ku darsamayaa dial code). Ku dar:
   - Key cusub `KEY_RECEIVER_PHONE` oo `UssdDialerService` ku xafido lambarka helaha marka flow-ka la activate gareeyo (`activate()` wuxuu qaadanayaa receiver ikhtiyaari ah).
   - Step cusub (`order = 6`, magac `receiver_phone`) oo:
     - u shaqeeya KALIYA marka `currentPrefix() == "*101*"`,
     - match gareeya dialog-ka lambarka ("Lambarka", "number", "numberka", "Geli lambarka", "phone"),
     - qora lambarka ka yimid `KEY_RECEIVER_PHONE` (9 lambar, digits kaliya).
   - Habeysi `matchStep()` si uusan step-kaas u dhicin *870*/*866* (halkaas receiver dial code ku jiro).

4. **Provider mapping** `UssdDialerService.kt:1269`: hadda `prefix == "*866*" → "Somnet" else "Hormuud"`. Ka dhig:
   - `*866*` → Somnet, `*101*` → Somtel, kale → Hormuud.

5. **Somtel slowdown**: `isSomnet866()` waxaa loogu talagalay shabakad gaabis ah — haddii Somtel sidoo kale gaabis tahay, ka dhig `isSlowNetwork()` (866 + 101); haddii kale ha taaban (ka eegi doonnaa logcat tijaabada).

6. **Unit test cusub**: `Ussd101FlowTest.kt` — trigger code = `*101#`, receiver step wuxuu qoraa lambarka saxda ah, iyo in *870* flow aanu step-ka receiver ahayn isbeddelin.

## Isbeddelada Admin UI (`src/components/admin/simple/ConfigViews.tsx`)

7. Ku dar preset cusub liiska USSD Codes:
   - id: `flow_101`, label: `*101* Flow (Menu → Xirmo → Lambarka → PIN) — Somtel`, template: `*101#`.
8. `isMenuFlow()` ku dar `isFlow101()` si lamaanaha menu1/menu2 loo muujiyo marka la doorto *101*.

## Tijaabo (kadib APK build)
- Dalab Somtel oo loo sameeyo xirmo *101* leh: device-ku wuxuu garaacayaa `*101#`, dooranayaa menu, dooranayaa xirmada, qorayaa lambarka helaha, kadib PIN `8826`.
- Hubi in *870* iyo *866* aanu waxba isbeddelin (regression test).

## Tignoolajiyad (faahfaahin)
- Files: `android-app/app/src/main/kotlin/com/riyokaab/delivery/service/Ussd870Flow.kt`, `UssdDialerService.kt`, test cusub `Ussd101FlowTest.kt`, `src/components/admin/simple/ConfigViews.tsx`.
- Database isbeddel lama baahna — `ussd_code` text ah ayaa horey u jira; admin-ku wuxuu xirmooyinka Somtel u qori karaa `*101#` + menu1/menu2.
- APK build cusub ayaa loo dirayaa GitHub Actions (workflow-kii hore waa jira).
