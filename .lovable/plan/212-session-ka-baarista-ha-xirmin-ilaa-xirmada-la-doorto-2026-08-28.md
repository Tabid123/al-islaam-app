# *212* — Session-ka baarista ha xirmin ilaa xirmada la doorto

## Waxa dhabta ah ee dhacay (la xaqiijiyay)

Logcat-ka 11:29 iyo diiwaanka `ussd_package_discoveries`:

- Baaritaanka 11:26 wuxuu helay menu leh `3 Saac / 8 Saac / ...` oo user-ku doortay `Internet aan xadidnayn, 3 Saac` (`selected_index=1`).
- Kadib, `session_state` wuxuu noqday **`lost`** (dhammaan 12-kii diiwaan ee ugu dambeeyay waa `lost` ama `closed` — mid `delivered` ah ma jiro).
- Sababtoo ah session-ku waa lumay, `discovery_delivery_fallback` wuxuu abuuray **dib-u-garaacis cusub** oo `*212*`.
- Garaaciskii cusub shirkaddu waxay soo bandhigtay menu **gebi ahaan kala duwan**: `1. $0.5=20 Saac, 2. $0.25=8 Saac, 3. $18=30 Maalin, 4. $9=15 Maalin` — `3 Saac` ma jirin.
- Sidaas darteed: `No exact package match for [Internet aan xadidnayn 3 Saac]; refusing to select a wrong row`, kadibna `Entering input: ''` (input madhan) oo flow-gu istaagay.

Marka: dhibaatadu waa in session-ka baarista la xiro/la lumo, kadibna dib loo garaaco — halka menu-gu garaac kasta is-beddelo.

## Waxa la beddelayo

### 1. Session-ka ha xirmin (Android)
- `UssdDialerService.holdSessionUntilSelection`: mudada hold-ka ha noqoto mid ka timaadda server-ka (`session_expires_at`), oo la cusboonaysiiyo, halkii 150s adag.
- Inta dialog-gu **muuqdo** (keep-alive wuxuu weli akhrinayo menu), **weligeed** ha loo yeerin `discovery_session_lost` — kaliya marka dialog-gu si dhab ah u baaba'o (X akhrin oo isku xigta oo madhan) ayaa loo yeerayaa.
- Ka saar wicitaannada `closeUssdSession()` ee dhaca kadib upload-ka menu-ga guulaystay; session-ka wuxuu xirmayaa **kaliya** kadib dirista xirmada ama marka runtii timeout dhaco.
- Ka hortag in job kale (baaris cusub ama delivery kale) uu dialog-ga qabsado inta hold-ku socdo (lock ah `holdActive`).

### 2. Xulashada waa lagu fuliyaa isla session-ka furan
- Marka `claim_discovery_selection` soo celiyo xulasho, isla markiiba safka la xaqiijiyay ayaa la gelinayaa dialog-ga furan (`resumeHeldSelection` + `resumeFlowNow`) — sidii hadda, laakiin hadda hubi in input-ku **aan madhnayn** ka hor Send: haddii `Entering input: ''` dhacdo, tallaabada waa la joojinayaa oo dib loo hubinayaa halkii Send la taaban lahaa.

### 3. Fallback marka runtii session-ku lumo
Haddii dib-u-garaacis lagama maarmaan noqdo, ha istaagin sida hadda:
1. Magac-match (sida hadda).
2. Haddii magacu maqan yahay → **qiime-match**: dooro safka leh isla qiimaha shirkadda (`$0.5`, `$0.25`…) ee uu user-ku bixiyay.
3. Haddii labaduba fashilmaan → order-ka `failed` + calaamad `refund_required` iyo digniin admin — **marnaba** saf khaldan lama dooranayo.

### 4. Server
- `discovery_session_lost` ha loo yeerin marka `session_state='selected'`/`'delivering'` (xulasho horeba u jirta) — halkaas fallback-ku wuxuu ku burburinayaa session hore u shaqaynayay.
- `session_expires_at` ka dhig 3 daqiiqo laga bilaabo **markii xulashadu timaaddo**, oo taleefanku heshiis la yeesho isla waqtigaas.
- Ku dar `session_note` (tusaale `label_missing_price_match`) si admin-ku u arko marka qiime-match la isticmaalo.

### 5. Frontend
- `DiscoverPackages.tsx`: countdown-ku ha noqdo mid ka imanaya `session_expires_at`-ka server-ka, oo si cad u tusa "Session furan — bixi lacagta gudaha X".
- Marka session-ku dhaco ka hor lacag-bixin: hal gujis oo dib-u-baaris ah.

## Faahfaahin farsamo
Files: `UssdDialerService.kt` (hold loop, timeout, session-lost guard), `UssdAccessibilityService.kt` (keep-alive miss-count, empty-input guard, hold lock), `Ussd870Flow.kt` (price-tier fallback), migration cusub (`discovery_session_lost` guard, `session_expires_at` refresh, `session_note`), `src/pages/DiscoverPackages.tsx`.

Xaqiijinta ugu dambeysa waxay u baahan tahay APK cusub + logcat cusub — sandbox-ku ma fulin karo dialog-yada shirkadda.
