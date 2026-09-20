# Baarista xirmooyinka (*212*) — 3 cilad, 3 xal

## Waxa xogtu xaqiijisay

**1) Qeyb ka mid ah menu-ga ayaa la qarinayaa — sababtu waa higgaadda.**
Baarista 13:54 shirkaddu waxay soo bandhigtay:
`Internet iyo kuhadal aan xadidnayn,24 Saac`, `...15 Maalin`, `...30 Maalin`,
halka catalog-ga aad gelisay uu leeyahay `internet iyo kuhadal aan **xadidneyn**,24 saac`.
`get_package_discovery` wuxuu isticmaalaa **JOIN saxda saxda ah** (`normalized_label =`),
markaa `xadidnayn` vs `xadidneyn` (iyo `internet+kuhadal` vs `internet kuhadal`) waa
la waayaa → 0 saf ayaa soo baxa oo user-ku wuxuu arkaa "xirmo lama helin", inkastoo
aad qiimayaasha wada gelisay. Sidoo kale `Internet aan xadidnayn, 30 Maalin`
catalog-ga wuxuu ku yaal `is_active = false`, markaa lama tuso.

**2 & 3) %90 baaris ma dhacdo — taleefanku wuu xanniban yahay.**
Diiwaanka: baaris kasta oo guulaysata (`device_id ca22b1…`) waxaa ku xiga
2–4 codsi oo `claimed_at = NULL`, `error = timeout`. Sababta:
`holdSessionUntilSelection` wuxuu **hakiyaa isla loop-ka baarista** ilaa
**5–8 daqiiqo** inta lacag-bixin la sugayo. Inta ay taasi socoto taleefanku
shaqo cusub ma qabsan karo, `claim_next_discovery`-na 60s kadib wuxuu codsiga
u dhigaa `timeout`. Haddii user-ku ka laabto (lacag ma bixin), hold-ku wuxuu
sii socdaa ilaa 5 daqiiqo — sidaas darteed macaamiishii xigtay baaris ma helaan.

## Xalka

### A. Match-ka xirmooyinka ha noqdo mid dulqaad leh (server)
- `ussd_normalize_label` la cusboonaysiiyo: `+` → space, `xadidneyn/xadidnaan` → `xadidnayn`,
  `kuhadal/ku hadal` mid la dhigo, punctuation/space badan la nadiifiyo,
  `saacad→saac`, `maalmood→maalin`.
- `get_package_discovery` JOIN-ka ha noqdo LEFT JOIN oo saddex heer leh:
  1. normalized_label saxda ah,
  2. haddii la waayo → **nooc + mudo** (tirada + halbeegga: `24 saac`, `30 maalin`),
  3. haddii weli la waayo → safka waa la muujinayaa `price_missing = true`
     (bottom-ka IIBSO waa demman) halkii gebi ahaan la qarin lahaa.
- Catalog-ga `is_active=false` (tusaale `30 Maalin`) — waa laga tagayaa sidii hore,
  laakiin admin-ka ayaa arki doona inuu maqan yahay (fiiri D).

### B. Hold-ku yaanu xannibin baarista xigta (Android)
- `holdSessionUntilSelection` waxaa lagu darayaa **preemption**: 1.5s tick kasta
  waxaa la hubinayaa in codsi cusub oo baaris ah uu sugayo; haddii **xulasho
  weli lama helin**, hold-ka waa la jarayaa, session-ka waa la xirayaa,
  taleefankuna wuxuu qabsanayaa shaqada cusub.
- Soft timeout: 300s → **90s** haddii user-ku aanu bilaabin lacag-bixin
  (`session_state` weli `open`). Marka lacag-bixintu bilaabato (`selected`)
  ayaa hold-ku dheeraanayaa.
- Loop-ka baarista: hold-ku wuxuu u guurayaa coroutine gaar ah, laakiin lock
  ah `dialogBusy` ayaa hubinaya in hal dialog kaliya uu jiro — sidaas poll-ku
  wuu sii wadaa oo shaqooyinka cusub isla markiiba wuu arkaa.

### C. Marka user-ku ka baxo bogga — session xor
- RPC cusub `release_discovery_session(p_id)`; `DiscoverPackages.tsx` wuxuu u
  yeeraa marka la unmount-gareeyo / dib loo noqdo iyadoon xulasho la samayn
  (`navigator.sendBeacon`-style cleanup). Taleefanku isla markiiba wuu xoroobaa.

### D. Muuqaal admin ah oo labels maqan
- Baaris kasta, labels-ka aan catalog-ga lagu helin waxaa lagu kaydinayaa
  `discovery_unmatched_labels` (label, root, tirada, markii ugu dambeysay).
- `DiscoveryCatalogView` waxaa lagu darayaa qeyb "Labels aan qiimo lahayn"
  oo hal gujis ku samaynaysa catalog row cusub — sidaas mar dambe wax lama
  qarinayo.

## Faahfaahin farsamo
- Migration: `ussd_normalize_label`, `get_package_discovery` (LEFT JOIN + tier match +
  `price_missing`), `release_discovery_session`, `discovery_unmatched_labels` (+GRANTs/RLS),
  `claim_next_discovery` (codsiga `pending` timeout-kiisa 60s → 90s).
- Android: `UssdDialerService.kt` (preemption + soft timeout + dialogBusy lock).
- Frontend: `src/pages/DiscoverPackages.tsx` (release-on-leave, `price_missing` badge),
  `src/components/admin/simple/DiscoveryCatalogView.tsx` (unmatched labels).

Xaqiijinta ugu dambeysa waxay u baahan tahay APK cusub + logcat cusub.
