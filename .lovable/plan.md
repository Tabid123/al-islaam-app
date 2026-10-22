# Maamuus *212* — 2 ikhtiyaar + akhrinta natiijada ugu dambeysa

## 1. Laba ikhtiyaar
- **Xirmooyin diyaarsan**: xirmo leh qiimo + badhan "IIBSO". Dalabku wuxuu baxayaa `*212*{receiver}#|menu1,menu2` (sida *870*/*101*). Android: Menu 1 (magac-match, tus. "Data") → Menu 2 (magaca xirmada ama lambar) → PIN.
- **Baaris toos ah**: xirmooyinka `is_discovery_root` way sii shaqaynayaan sida hadda (garaac `*212*{receiver}#`, soo akhri liiska, macmiilku dooro).

## 2. Bogga macmiilka (category Maamuus)
- Qaybta sare: "Baar xirmooyinka lambarkaaga" — discovery roots.
- Qaybta hoose: "Xirmooyin diyaarsan" — kaararka caadiga ah ee qiimaha iyo IIBSO leh.
- Haddii mid ka mid ah qaybaha uu madhan yahay, lama tuso cinwaankiisa.

## 3. Admin
- Packages: xirmo cusub oo Maamuus ah lagu dari karo (sell + cost price), iyo dooro "Baaris toos ah" ama "Diyaarsan".
- Codes: preset "Maamuus *212*" wuxuu u baahan yahay xirmo gaar ah + Menu 1 + Menu 2; waxaa la diidayaa in lagu xiro discovery root.
- Kala sarraynta code-ka: Package > Category > Provider (la hubiyo/la saxo meesha code-ka loo xalliyo, web iyo database). Discovery roots weligood ma qaataan code caadi ah.

## 4. Android — natiijada ugu dambeysa
- `looksLikeTerminalResult` cusub (Ussd870Flow): wuxuu garanayaa farriinta xiritaanka (ma laha lambaro menu, ma laha input, ama leh erayada guul/fashil).
- `UssdAccessibilityService`: isla marka terminal la arko, qoraalka oo dhan `saveFinalUssdResult` ku kaydi KA HOR inta badhan la taabin ama dialog la xirin — xitaa haddii Samsung STK EditText ku hadho.
- Erayada guusha la daro: "ku guulaysatay", "laguu furay", "waa laguu", "la furay", "la siiyay" → Delivered.
- Erayada fashilka: "pin-ka aad galisay waa qalad", "haraagaagu kuma filna", "guuldarro", "lama furi karo" → Failed. Fashilka ayaa la hubinayaa marka hore (si "haraagaagu" uusan u noqon guul).
- `UssdFinalResultReceiver` + `UssdDialerService`: qoraalka natiijada wuxuu galayaa `provider_response` / `delivery_notes` ee dalabka.
- Haddii magaca xirmada menu-ga laga waayo: wax lama doorto, session-ka waa la baajinayaa, dalabkuna wuxuu noqonayaa Failed oo leh sabab cad.

## Tijaabooyin
- Kotlin unit tests: menu1/menu2 diyaarsan, terminal detection, erayada guul/fashil, magac la waayay → baajin.
- Web: bogga Maamuus wuxuu muujinayaa labada qaybood (Playwright).
- APK-ga cusub waxaa lagu dhisayaa GitHub Actions (sandbox-ku ma dhisi karo Android).
