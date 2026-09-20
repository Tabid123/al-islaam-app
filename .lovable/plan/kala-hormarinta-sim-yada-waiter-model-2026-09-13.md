# Kala hormarinta SIM-yada (Waiter Model)

Kaliya nidaamka qaybinta dalabyada ee SIM-yada ayaa la beddelayaa. Waxba kale lama taabanayo.

## 1. Xogta device-yada

SIM kasta (SIM 1 iyo SIM 2) wuxuu helayaa:

- Shirkad (Hormuud, Somtel, Somnet, Amtel, Somlink...)
- Lambar safka / Priority (1–5, default 1)
- Fur/Xidh (enabled, default fur)

Xidigta "primary" ee hadda jirta iyo xeerka gaarka ah ee Hormuud waa la saarayaa — priority-ga ayaa mar walba go'aaminaya.

## 2. Sida dalabku u socdo

Marka dalab soo galo:

1. SIM-yada xidhan, kuwa aan 3 daqiiqo gudahood ping soo dirin, iyo device-yada shaqada ka baxay lagama dooranayo.
2. Dalabka shirkad leh wuxuu kaliya u tagayaa SIM-ka isla shirkaddaas loo calaamadeeyay.
3. SIM-ka priority-ga ugu sareeya (1) ayaa horta la siinayaa. SIM priority 2 dalab ma qaadi karo haddii SIM priority 1 oo isla shirkad ah uu diyaar yahay oo aan mashquul ahayn.
4. Haddii SIM priority 1 uu offline yahay, damsan yahay, ama mashquul yahay (dalab `processing` ku jira), dalabka wuxuu u gudbayaa priority-ga xiga — sug ma jiro.
5. Marka la qaato, nidaamku wuxuu soo celinayaa SIM slot-ka saxda ah (1 ama 2) si app-ka Android uu USSD-ga SIM-kaas uga diro.

## 3. Bogga maamulka Device-yada

Kaarka device-ka iyo daaqadda tafatirka:

- Dropdown shirkadeed SIM 1 iyo SIM 2 kasta
- Goob lambar ah oo priority (1–5) SIM kasta
- Toggle fur/xidh SIM 1 iyo SIM 2 gaar gaar ah
- Kaarka wuxuu tusayaa: shirkadda, priority-ga, iyo xaaladda SIM kasta

## Faahfaahin farsamo

- Migration: `android_devices` ku dar `sim1_priority`, `sim2_priority` (int, default 1),
  `sim1_enabled`, `sim2_enabled` (bool, default true); `sim1_provider`/`sim2_provider` way jiraan.
  Values-ka hore: `send_enabled=false` → labada SIM `enabled=false`;
  `primary_for_provider` la jaanqaadi doona priority 1 ee shirkaddaas, kuwa kale priority 2.
- `claim_next_delivery(p_device_id, p_providers)` dib loo qorayo:
  - Ka dhis jadwal `(device_id, sim_slot, provider, priority, enabled, last_ping_at)` `android_devices`.
  - Iska saar rows: `enabled=false`, `archived_at not null`, `last_ping_at < now() - interval '3 minutes'`.
  - Hel SIM-yada device-kan ee shaqeynaya; dalab kasta oo pending ah shirkaddiisa la barbardhig.
  - Dalab lama siinayo SIM-kan haddii ay jirto SIM kale, isla shirkad, priority ka yar,
    oo firfircoon (ping dhow, enabled) oo aan `delivery_queue.status='processing'` ku lahayn.
  - Soo celi row-ga `delivery_queue` iyo `sim_slot` la doortay (update-ka `sim_slot`).
  - Single-flight guard iyo stale `processing` reset sidii hore ha ahaato.
  - Xeerka `is_primary_hormuud_sim` / `primary_for_provider` ka saar shaandhaynta (column-ka ha sii jiro laakiin lama isticmaalayo).
- `claim_next_bulk_sms` iyo `claim_next_discovery`: adeegso isla shaandhaynta `simN_enabled` halkii `send_enabled`.
- UI: `EditDeviceDialog.tsx`, `AddDeviceDialog.tsx`, `DeviceCard.tsx` — provider dropdown,
  priority number input, enable toggle SIM kasta; `CustomerViews.tsx` qaybta SIM-yada la cusboonaysiiyo.
- Koodhka Android wax isbeddel ah ma jiro — `sim_slot` horeyba wuu u adeegsan jiray.
