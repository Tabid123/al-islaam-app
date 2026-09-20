# USSD *212* — Xirmooyin si toos ah looga baaro shirkadda, qiimaha admin-ka

## Safarka user-ka

```text
Hormuud  →  Category "Maamuus"
              │
              ▼
   3 xulasho:  Data   |   Kuhadal   |   Data iyo Kuhadal
              │
              ▼
   Bogga lacag bixinta: qaabka lacag bixinta
     + lambarka lacagta laga dirayo
     + lambarka helaya internet-ka
              │
              ▼
   System:  *212*{receiver}#  →  raadi safka magaciisu la mid yahay
            xulashada (Data / Kuhadal / …)  →  akhri menu-ga xirmooyinka
              │
              ▼
   Xirmooyinka waxaa lagu soo bandhigayaa design-keenna caadiga ah,
     QIIMAHA WAA KAAGA (kii shirkadda lama tusayo user-ka)
              │
              ▼
   Dooro xirmo  →  bixi lacagta  →  si otomaatig ah ayaa loo dirayaa
```

## Admin lambaro menu ma galinayo

Admin-ku ma qorayo `menu1`/`menu2` lambaro ah. Wuxuu kaliya abuurayaa 3-da xulasho **magacyadooda** (Data, Kuhadal, Data iyo Kuhadal). System-ku menu-ga *212* ee soo baxa ayuu **magaca ku raadinayaa** (isla `findNumberForKeywords` keyword-matching-ka hadda jira), kadibna lambarka safka saxda ah ayuu galinayaa. Haddii shirkaddu kala horreyntooda bedesho, wax dhibaato ah ma jirto.

Sidoo kale menu-ga xirmooyinka: safaf kasta si otomaatig ah ayaa loo akhrinayaa — magac, qiimaha shirkadda, iyo lambarka safka.

## Qiimaha — liis admin horay u galiyo

- Admin-ku wuxuu horay u diyaarinayaa liis xirmooyin ah. Xirmo kasta:
  - **Magaca** sida uu ugu qoran yahay menu-ga *212* (tusaale `Unlimited Internet`, `Unlimited 12 Saac`).
  - **Qiimaha shirkadda** (cost) — waxa shirkaddu ka gado.
  - **Sell price** — qiimaha aan user-ka ka qaadayno.
- Marka baaristu dhacdo, system-ku wuxuu magacyada menu-ga ka soo baxay la barbardhigayaa liiskaas, kadibna **sell price-ka admin-ka** ayuu user-ka tusayaa.
- Isbarbardhigga waa magac la caadiyeeyay (lowercase, punctuation la saaray, token-match) — sidaas ayay lambar kasta isla xirmadu isla qiime u yeelanaysaa.
- Xirmo menu-ga ka soo baxday oo aan liiska ku jirin: user-ka lama tusayo, laakiin admin-ka ayaa loo tusayaa "Xirmo cusub — qiime u deji" si uu liiska ugu daro.
- User-ku qiimaha shirkadda ma arko — kaliya sell price-ka. Admin-ka ayaa arka cost, sell, iyo faa'iidada.


## Baarista (discovery)

- Codsi baaris ayaa la abuurayaa marka lambarka helaya la galiyo.
- Telefoonka Android ee delivery-ga: `*212*{receiver}#` → dooro safka xulashada (magac-match) → akhri menu-ga xirmooyinka → jooji session-ka (waxba lama iibsanayo) → qoraalka soo dir.
- Server-ku wuxuu qoraalka u kala saarayaa `{index, label, operator_price}`, kadibna wuxuu ku dhejinayaa qiimaha admin-ka.
- Cache: 30 daqiiqo lambar + xulasho kasta (setting la bedeli karo).
- UI progress: "Waxaa la baarayaa xirmooyinka lambarkan…" (10–40 ilbiriqsi). Haddii device Android ah oo online ah aan la helin ama ay fashilanto: fariin cad + "Dib u baar".

## Iibka & gaarsiinta

- Marka xirmo la doorto, lacag bixinta ayaa la dhammaystirayaa (nidaamka jira).
- Kadib xaqiijinta lacagta: `*212*{receiver}#` → xulashada (magac-match) → xirmada (label-match) → PIN. Label-ka ayaa la kaydinayaa, ma aha lambar go'an, si safku haddii uu is-bedelo dalabku sax u ahaado.

## Faahfaahin farsamo

**Android**
- `Ussd870Flow.MENU_FLOW_PREFIXES` → `"*212*"`.
- Discovery mode: kadib menu1, qoraalka dialog-ka soo dir, kadibna xir session-ka.
- `UssdDialerService` / `UssdPollingWorker` → claim `claim_next_discovery`.

**Database**
- `data_packages_config`: `is_discovery_root boolean default false` (3-da xulasho).
- `ussd_price_catalog`: `root_package_id`, `label` (magaca menu-ga), `normalized_label` (unique per root), `cost_price`, `selling_price`, `is_active`, timestamps. Admin ayaa horay u buuxinaya. GRANTs + RLS: admin manage; akhriska user-ka wuxuu maraya RPC oo `cost_price` aan soo celin.
- `ussd_package_discoveries`: `root_package_id`, `phone_number`, `status`, `raw_menu`, `items jsonb`, `error`, `expires_at`, timestamps.
- RPCs (SECURITY DEFINER): `request_package_discovery`, `get_package_discovery` (waxay soo celinaysaa oo kaliya xirmooyinka liiska qiimaha ku jira; `cost_price` lagama soo celinayo), `claim_next_discovery`, `complete_discovery`.
- `orders`: `discovery_menu_label`, `discovery_root_id`.

**Server**
- `src/lib/ussd-discovery.server.ts` — parser (label + qiime + index), normalize-ka magaca, isku xirka qiimaha admin-ka.
- `src/lib/ussd-discovery.functions.ts` — `requestDiscovery`, `pollDiscovery`.

**Frontend**
- `src/pages/DataPackages.tsx` — `is_discovery_root` → u gudub bogga lambarada halkii xirmooyin la tusi lahaa.
- `src/pages/PaymentProviders.tsx` — kadib lambarada, bilow baarista + progress.
- Xaalad cusub oo tusa xirmooyinka la helay (isla card design-ka), kadibna lacag bixin.

**Admin**
- Tab "USSD Discovery" → laba qeybood:
  1. **Liiska qiimaha** (CRUD): magaca xirmada sida menu-ga *212* ku qoran, cost price, sell price, firfircoon/xir. Halkan ayuu admin-ku horay u buuxinayaa.
  2. **Xirmooyin cusub oo la arkay** — kuwa menu-ga ka soo baxay ee aan liiska ku jirin; hal taabasho ayaa liiska lagu darayaa (magaca hore loo buuxiyay).
- Faa'iidada (sell − cost) ayaa admin-ka loo tusayaa saf kasta.
- Preset dropdown: `*212* Flow (Baaris otomaatig ah)` — menu field ma jiraan.

## Waxyaabaha la ogaanayo
- Xirmo aan liiska qiimaha ku jirin user-ka lama tusayo (si aan qiime khaldan loo iibin).
- Baaristu waxay u baahan tahay hal device oo Android ah oo online ah.
- Lambarka waxaa la galinayaa ka hor xirmada doorashada.
