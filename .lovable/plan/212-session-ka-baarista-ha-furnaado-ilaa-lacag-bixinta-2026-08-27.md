# *212* — Session-ka baarista ha furnaado ilaa lacag-bixinta

## Dhibaatada
Baarista (*212*) waxay soo bandhigtaa xirmooyin gaar ah, kadibna session-ka waa la xiraa. Marka user-ku lacagta bixiyo, taleefanku dib buu u garaacaa *212*, shirkadduna waxay soo bandhigtaa **liis kale**. Sidaas darteed xirmadii la doortay lama helo, dialog-guna wuu istaagaa.

## Xalka
Session-ka USSD ha la xirin marka baaristu dhammaato. Isla session-kaas oo furan ayaa la sugayaa ilaa user-ku lacagta bixiyo, kadibna isla safkii uu doortay ayaa lagu gelinayaa isla session-ka — sidaas menu-gu weligiis isma beddelayo.

```text
Dial *212*  ->  Menu la akhriyo  ->  SESSION FURAN (hold)
                      |                     |
              xirmooyin app-ka          keep-alive
                      |                     |
              user + lacag bixin  ->  lambarka safka + Send  ->  Natiijo
```

## Tallaabooyinka

### 1. Android — session hold
- `Ussd870Flow`: ku dar xaalad cusub `SESSION_HELD` oo lagu kaydiyo menu-gii la helay, tirada safafka, iyo waqtiga la hayo.
- `UssdAccessibilityService`: marka discovery-gu menu-ga qabsado, **ha taabanin Cancel/Back** — dialog-ga ha sii furnaado, oo la sug amar cusub.
- Ku dar `holdWatcher` (poller) oo:
  - hubinaya in dialog-gu weli furan yahay,
  - haddii dialog-gu naftiisa xiro (timeout shirkadeed), calaamadeeya `session_lost`.
- Amar cusub `SELECT_ROW <index>`: gelinta lambarka + Send isla dialog-ga furan (isticmaal isla `verifyInputAcrossWindows` / keyboard fallback ee hadda jira).

### 2. Server — heerarka baarista
- `ussd_package_discoveries`: ku dar `session_state` (`open` | `consumed` | `lost`), `session_device_id`, `session_expires_at`, iyo `selected_index`.
- Marka menu la keydiyo (`complete_discovery`), status-ka noqdo `menu_ready` + `session_state='open'` halkii uu isla markiiba u dhammaan lahaa.
- RPC cusub `select_discovery_row(p_discovery_id, p_label)`: markuu lacag-bixintu dhammaato, wuxuu kaydiyaa index-ka, oo shaqada u dirayaa **isla device-kii** hayay session-ka.
- `claim_next_delivery`: dalabka discovery-ga wuxuu u tagayaa oo kaliya device-ka session-ka haya, oo wuxuu keenayaa `mode='continue_session'` + `selected_index`.

### 3. Ma la joojin karaa timeout-ka shirkadda?
Maya — waqtiga session-ka USSD waxaa gebi ahaanba maamula shirkadda (caadi ahaan 60–180 ilbiriqsi), lamana kordhin karo app-ka. Waxa kaliya ee suurtogal ah:

- **Keep-alive tijaabo ah**: app-ku dialog-ga furan ayuu firfircoon ku hayaa (focus/refresh) — waa caawinaysaa qaar, laakiin lama xaqiijin karo.
- **Waqti kooban**: user-ka waxaa la siinayaa daqiiqad kooban (tusaale 90s) countdown ah oo uu lacagta ku bixinayo isla session-kaas.

### 4. Haddii session-ku dhaco kadib lacag-bixinta (khatarta ugu weyn)
Lacagtu waa la bixiyay, menu cusubna wuu ka duwan yahay. Habka lagu badbaadinayo:

1. Dib u garaac *212*, akhri menu-ga cusub.
2. **Label match** — haddii isla magaca la helo → dir.
3. **Price-tier match** — haddii magacu maqan yahay, dooro safka **isla qiimaha shirkadda** (tusaale `$0.5`) leh, maadaama qiimuhu uu yahay waxa user-ku bixiyay. Kaydi in "label bedelay" si admin-ku u arko.
4. Haddii xitaa qiimaha la waayo → order-ka `failed` + `refund_required`, admin-ka digniin degdeg ah, user-kana fariin cad. Lacagtu marnaba lama lumin — waxay noqonaysaa dalab dib loo celiyay ama gacan lagu diray.


### 5. Frontend
- `DiscoverPackages.tsx`: countdown cad "Session furan — bixi lacagta gudaha 90s".
- Marka session-ku dhaco ka hor lacag-bixin: hal gujis oo dib loo baaro (khasaare ma jiro).
- Kadib lacag-bixin: tus "Waa la dirayaa…" oo natiijada la sugo.


## Faahfaahin farsamo
Files: `Ussd870Flow.kt`, `UssdAccessibilityService.kt`, `UssdDialerService.kt`, `DeliveryApiClient.kt`, migration cusub (`ussd_package_discoveries` columns + `select_discovery_row` RPC + `claim_next_delivery` update), `src/pages/DiscoverPackages.tsx`, `src/pages/PaymentProviders.tsx`.
