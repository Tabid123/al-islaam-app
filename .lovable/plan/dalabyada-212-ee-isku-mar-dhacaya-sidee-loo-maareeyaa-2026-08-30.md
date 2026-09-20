# Dalabyada *212* ee isku mar dhacaya — sidee loo maareeyaa

## Sida ay hadda u shaqeyso (la xaqiijiyay)

- Device kasta oo firfircoon wuxuu ka codsadaa `claim_next_discovery`. Shaqadaas **ma filtarayso shirkadda** — sidaas darteed dalab *212* (Hormuud) wuxuu ku dhici karaa device Somtel/Somnet ah oo aan waxba ka bixin karin.
- Device-ku marka uu baaris/dalab wado wuxuu dejiyaa `isProcessingOrder = true`, markaa **hal shaqo ayuu isku mar qaban karaa** — session-ka macmiil kale ma qabsan karo. Taasi waa wanaagsan.
- Hadda waxaa jira **2 device oo Hormuud ah** (`SM-A065F`, `SM-A336E`). Marka labaduba hayaan session, codsiga saddexaad wuu sugaa; `claim_next_discovery` wuxuu u calaamadeeyaa **`failed = 'timeout'` 90 ilbiriqsi** kadib, bogguna wuxuu tusaa khalad — user-ka lama sheegayo inuu safka ku jiro.
- Xulashada kadib lacag-bixinta (`claim_discovery_selection`) waxay si sax ah ugu xirantahay isla device-kii hayay session-ka, markaa isku-qasid macaamiil dhexdood ma dhacayso.

**Jawaabta kooban:** dalabyada isku mar ah waa la kala saarayaa (device kasta hal session), laakiin waxaa maqan **saf cad iyo filtar shirkadeed**, sidaas darteed macmiilka labaad/saddexaad wuxuu arkaa "timeout" halkii uu arki lahaa "waa safka".

## Waxa la beddelayo

### 1. Filtar shirkadeed marka la qabsanayo baarista
`claim_next_discovery(p_device_id)` ha qaato oo kaliya baarisyada ay shirkaddoodu la mid tahay SIM-ka device-ka (`sim1_provider`/`sim2_provider`/`primary_for_provider`). Device Somtel ah marnaba ma qabsan karo *212*.

### 2. Saf dhab ah (queue) oo aan degdeg u dhicin
- `ussd_package_discoveries`: ku dar `queue_position` (la xisaabiyo) iyo `queued_at`.
- Timeout-ka 90s ha noqdo **90s laga bilaabo markii device qabsado** (`claimed_at`), ee ha noqon markii la abuuray — sugitaanka safka lagama xisaabinayo.
- Ku dar xad guud (tusaale 5 daqiiqo) oo kaliya kadib ayuu noqonayaa `failed = 'no_device_available'`.

### 3. Wax uu user-ku arko
`DiscoverPackages.tsx`:
- Marka aan device banaanayn: "Waxaa hadda socda baaritaanno kale — adigu waxaad tahay #2 safka. Fadlan sug…" oo leh booskiisa safka.
- Countdown-ku ha bilaabmo marka baaristu dhab ahaan bilaabato, ee ma aha inta uu safka sugayo.
- Haddii saf-sugniintu dheeraato: badhan "Dib u isku day" oo aan khasaare lahayn (lacag weli lama bixin).

### 4. Muuqaal admin
`DiscoveryCatalogView`/`UssdView`: shaxda tusaysa device kasta iyo session-ka uu hadda hayo (phone, xaalad, waqti dhiman), si admin-ku u arko marka safku buux dhaafo — taasina waa calaamad in device Hormuud ah oo dheeraad ah loo baahan yahay.

## Talo hufan
Hal session USSD = hal device. Haddii dalabyada *212* ee isku mar ahi ay ka badnaadaan 2, xalka kaliya ee dhabta ah waa **device/SIM Hormuud ah oo dheeraad ah**. Isbeddellada kore waxay ka dhigayaan safka mid cadaalad ah oo aan khalad ahaan u fashilmin — laakiin awoodda isku-mar waxay ku xiran tahay tirada device-yada.

## Faahfaahin farsamo
Migration cusub: `claim_next_discovery` (provider filter + timeout laga bilaabo `claimed_at` + `no_device_available`), columns `queued_at`/xisaabinta booska safka, iyo RPC yar `get_discovery_queue_status(p_id)`.
Files: `src/pages/DiscoverPackages.tsx` (safka + countdown), `src/components/admin/simple/UssdView.tsx` (muuqaalka session-ada). Dhinaca Android wax isbeddel ah looma baahna.
