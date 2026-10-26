# AMTEL API delivery — staging checklist

This branch does **not** enable live AMTEL delivery automatically.

## Implementation
- `20261026130500_amtel_api_staging.sql` creates 20 offerings transcribed from the user's AMTEL Zone 1 price sheet, a disabled-by-default mapping table, and an idempotent delivery job table.
- WaafiPay and eDahab checkout create API jobs only when a package is explicitly mapped and `enabled=true`. Unmapped packages use their existing USSD path.
- `/api/public/hooks/amtel-dispatch` claims jobs atomically and invokes the SOAP bundle purchase service. It **never retries** an unknown request automatically.
- Purchase client: `src/lib/amtel.server.ts`.

## Before enabling any mapping
1. Rotate API credentials from the vendor-shared example files and place credentials **only** in runtime secret storage.
2. Deploy and verify the database migration, web route, and updated Supabase functions together.
3. Set the following secrets on the **web server**: `AMTEL_INITIATOR`, `AMTEL_RECEIVER_PARTY`, `AMTEL_THIRD_PARTY_ID`, `AMTEL_API_PASSWORD`, `AMTEL_SECURITY_CREDENTIAL`, `AMTEL_SHORT_CODE` (optional), `AMTEL_DISPATCH_SECRET`. The purchase API is not called by a Supabase function.
4. Confirm with AMTEL whether `Password`/`SecurityCredential` are supplied precomputed or must be derived dynamically; confirm `ReceiverParty`, production endpoint IP allowlist, SOAP headers, and request response semantics.
5. Match existing `data_packages_config.id` values to AMTEL Offering IDs manually, checking the exact **cost_price** and category. Insert into `amtel_package_mapping` with `enabled=false`. Never infer mapping based solely on price.
6. Schedule authenticated POST `/api/public/hooks/amtel-dispatch` with `Authorization: Bearer <AMTEL_DISPATCH_SECRET>` only after controlled testing and network connectivity confirmation.
7. First run an authorized controlled transaction with an explicitly configured test package and test MSISDN; confirm actual inventory decrement, destination bundle and order state before enabling production packages.
8. Enable only approved mappings. Unmapped AMTEL packages continue their existing device path.

## Operational precautions
- SOAP `ResultCode=0` indicates provider acceptance per sample, but verify whether it represents final fulfillment with AMTEL.
- A timeout, unreadable SOAP, HTTP failure, or crash after claim leaves a job in `unknown`/`processing`. **Do not requeue automatically**. Contact AMTEL with OriginatorConversationID and reconcile before manual retry.
- Disabled mappings do not alter the current flow.
- API jobs are in `amtel_delivery_jobs`, not `delivery_queue`. Other provider devices cannot claim them.
- Confirm existing admin reporting and recovery paths can display API jobs before going live.

## Catalog
Bulaal VIP: 30051, 30024, 30025, 30026, 30009, 30027.
Tanaad: 30001, 30002, 30004, 30005, 30011, 30039, 30013.
Wadaag: 30014, 30015, 30016.
Intifaac: 30028, 30029, 30030, 30031.
