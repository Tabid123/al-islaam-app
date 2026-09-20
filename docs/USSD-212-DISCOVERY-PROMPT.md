# PROMPT: Build the *212* package-discovery system (Riyokaab spec)

> Hordhac (Somali): Faylkani waa prompt buuxa. U dir AI-ga mashruuca kale sidiisa oo kale.
> Wuxuu ku qeexayaa: sida xirmooyinka looga baaro shirkadda (*212*), sida qiimaha Riyokaab
> loogu dhejiyo, xirmooyinka aan keydsanayn sida loo soo saaro, UI/UX-ga, iyo **xalka
> cilada "wax xirmo ah lama soo bandhigo"** (Qeybta 10).

You are implementing a USSD **package discovery** system for a Somali mobile-data reseller
app (React + Supabase + a companion Android delivery app). Implement it exactly as
specified. Do not simplify. Somali UI copy must be kept verbatim.

---

## 1. Concept

Hormuud's `*212*<phone>#` short code shows a **per-subscriber** bundle menu: every phone
number gets a different list, and the list changes between dials. So packages cannot be
stored statically — they must be **discovered live** by an Android device that dials the
code, scrapes the dialog, and uploads the rows. The app then attaches **our own selling
prices** (from a price catalog) to the scraped labels and shows them in normal package
cards.

```text
User: Hormuud → category "XIRMO ADIGA KUU GAAR AH" (*212*)
   → PAYMENT PAGE first: choose payment provider + sender phone + receiver phone
   → button "Baar xirmooyinka"
   → request_package_discovery()            → row 'pending' (queue)
   → Android device (provider match) → claim_next_discovery()
   → dials *212*<phone>#  → picks menu1 by NAME  → scrapes bundle menu
   → complete_discovery(raw_menu, items, hold=true)      [SESSION KEPT OPEN]
   → get_package_discovery()  → attach Riyokaab prices   → show cards
   → user taps IIBSO → pays
   → enqueue_discovery_delivery(): session open?  → select row in the SAME session
                                   session lost?  → re-dial fallback
   → complete_discovery_selection() → order delivered / failed
```

---

## 2. Category and the three discovery roots

Create (Hormuud provider):

- Category: **XIRMO ADIGA KUU GAAR AH** ("Maamuus"), `display_order = 0`, active.
- Three rows in `data_packages_config` under that category with
  `is_discovery_root = true` (no `ussd_code`, no menu1/menu2, price 0):
  1. **Data**
  2. **Kuhadal**
  3. **Data iyo Kuhadal**

These names are matched **by text** against the carrier's first menu
(`1.Data 2.Kuhadal 3.Data iyo Kuhadal`), so the row order can change safely.

---

## 3. Seed the price catalog (`ussd_price_catalog`)

These are the packages currently stored in Riyokaab. **Insert all of them.** Prices in USD.

### Root: Data
| label | cost | sell |
|---|---|---|
| Internet aan xadidnayn, 1 Saac | 0.10 | 0.11 |
| Internet aan xadidnayn, 3 Saac | 0.15 | 0.17 |
| Internet aan xadidnayn, 8 Saac | 0.25 | 0.25 |
| Internet aan xadidnayn, 20 Saac | 0.50 | 0.50 |
| Internet aan xadidnayn, 24 Saac | 0.60 | 0.60 |
| 12GB,30 Maalin | 5.00 | 5.00 |
| Internet aan xadidnayn, 15 Maalin | 9.00 | 9.00 |
| Internet aan xadidnayn, 30 Maalin | 18.00 | 18.00 |

### Root: Kuhadal
| label | cost | sell |
|---|---|---|
| kuhadal aan xadidnayn, 3 saac | 0.10 | 0.11 |
| kuhadal aan xadidneyn, 6saac | 0.15 | 0.16 |
| kuhadal aan xadidneyn, 15 saac | 0.25 | 0.27 |
| kuhadal aan xadidneyn, 36 saac | 0.50 | 0.55 |
| kuhadal aan xadidneyn,7 maalin | 2.50 | 2.70 |
| Kuhadal aan xadidneyn, 30 Maalin | 8.00 | 8.50 |

### Root: Data iyo Kuhadal
| label | cost | sell |
|---|---|---|
| internet iyo kuhadal aan xadidneyn,24 saac | 0.60 | 0.60 |
| internet+kuhadal aan xadidnayn,40 saac | 1.00 | 1.00 |
| Unlimit data iyo voice,2 maalin | 1.60 | 1.65 |
| internet iyo kuhadal aan xadidnayn,7 maalin | 4.20 | 4.20 |
| internet iyo kuhadal aan xadidnayn, 15 maalin | 9.00 | 9.00 |
| internet iyo kuhadal aan xadidneyn,30 maalin | 18.00 | 18.00 |

Note the intentionally inconsistent carrier spelling: `xadidnayn` vs `xadidneyn`,
`internet+kuhadal`, `6saac` with no space. Normalisation (Section 5) must collapse all of
these; never store duplicates.

---

## 4. Schema

```sql
-- discovery requests / live sessions
ussd_package_discoveries(
  id uuid pk, root_package_id uuid -> data_packages_config, phone_number text,
  status text,                 -- pending | processing | done | failed
  device_id text, raw_menu text, items jsonb default '[]',   -- [{index,label}]
  error text, queued_at, claimed_at, completed_at, expires_at,
  session_state text default 'closed',  -- open|selected|delivering|consumed|lost|closed
  session_device_id text, session_expires_at timestamptz,
  selected_label text, selected_index text, selected_order_id uuid, session_note text,
  created_at, updated_at)

-- our prices, per root
ussd_price_catalog(
  id uuid pk, root_package_id uuid, label text,
  normalized_label text,                -- UNIQUE (root_package_id, normalized_label)
  cost_price numeric, selling_price numeric,
  info_line1 text, info_line2 text, is_active bool default true, created_at, updated_at)

-- labels the carrier showed that we have no price for
discovery_unmatched_labels(
  id uuid pk, root_package_id uuid, raw_label text, normalized_label text,
  hits int default 1, last_seen_at, created_at, updated_at,
  UNIQUE(root_package_id, normalized_label))

-- extra columns
data_packages_config: is_discovery_root bool default false, is_ussd_only bool default false
orders:               discovery_menu_label text, discovery_root_id uuid
delivery_queue:       discovery_menu_label text
pending_online_payments: discovery_menu_label text, discovery_menu_index text
```

All tables: `GRANT` to `authenticated`/`service_role` (+ `anon` only where a policy allows),
enable RLS, and expose reads through `SECURITY DEFINER` RPCs — the app calls RPCs, not tables.

---

## 5. Label normalisation (this is the heart of the system)

```sql
create or replace function public.ussd_strip_price_prefix(p_label text)
returns text language sql immutable as $$
  select btrim(regexp_replace(coalesce(p_label,''), '^\s*[^=]{0,20}=\s*', ''));
$$;   -- "$0.15=Internet aan xadidnayn, 3 Saac" -> "Internet aan xadidnayn, 3 Saac"

create or replace function public.ussd_normalize_label(p_label text)
returns text language sql immutable as $$
  select btrim(regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(lower(coalesce(p_label,'')), '[^a-z0-9]+', ' ', 'g'),
          '\m(xadidneyn|xadidnaan|xaddidnayn|xadidneen|xadidnayn)\M', 'xadidnayn', 'g'),
        '\m(ku hadal|kuhadall|kuhadal|kuhdal)\M', 'kuhadal', 'g'),
      '\m(saacadood|saacado|saacad|saacc|saac|hours|hour|hrs|hr)\M', 'saac', 'g'),
    '\m(maalmood|maalmo|maalin|days|day)\M', 'maalin', 'g'));
$$;

create or replace function public.ussd_duration_key(p_label text)
returns text language sql immutable as $$
  select case when m is null then null else m[1] || ' ' || m[2] end
  from (select regexp_match(
          public.ussd_normalize_label(public.ussd_strip_price_prefix(p_label)),
          '([0-9]+) (saac|maalin)') as m) s;
$$;   -- "…, 8 Saac" -> "8 saac"
```

Keep `normalized_label` in sync with a BEFORE INSERT/UPDATE trigger on
`ussd_price_catalog` (`new.normalized_label := ussd_normalize_label(ussd_strip_price_prefix(new.label))`).

---

## 6. RPCs

- `request_package_discovery(p_root_package_id uuid, p_phone text) -> jsonb`
  Normalises the phone to 9 digits, inserts a `pending` row, returns `{success, id}`.
- `claim_next_discovery(p_device_id text) -> jsonb`
  Only picks requests whose root's provider matches the device
  (`primary_for_provider`, `sim1_provider`, `sim2_provider`); re-queues rows stuck in
  `processing` > 2 min; fails `processing` older than 90 s with `timeout`; fails `pending`
  older than 5 min with `no_device_available`. Uses `FOR UPDATE SKIP LOCKED`.
  Returns `{id, phone_number, menu1_label, ussd_code:'*212*<phone>#'}`.
- `complete_discovery(p_id, p_raw_menu, p_items jsonb, p_error, p_hold bool) -> jsonb`
  Sets `done`/`failed`, `expires_at = now()+30 min`, and when `p_hold` →
  `session_state='open'`, `session_expires_at = now()+8 min`.
- `get_package_discovery(p_id) -> jsonb` — Section 7.
- `get_discovery_queue_status(p_id) -> jsonb` — `{found,status,error,ahead,position,active_sessions,queued_at,claimed_at}`.
- `claim_discovery_selection(p_device_id)` / `complete_discovery_selection(p_id,p_success,p_response)`
- `discovery_session_lost(p_id)` (no-op when state is `selected`/`delivering`),
  `release_discovery_session(p_id)`, `discovery_delivery_fallback(p_discovery_id)`.
- Trigger `broadcast_discovery_change` → `realtime.send()` on `discovery:<id>` and `discovery_queue`.

---

## 7. `get_package_discovery` — attaching our prices (three-tier match)

For each scraped row, strip the carrier price prefix, then LEFT JOIN the catalog:

1. exact `normalized_label` match, else
2. `ussd_duration_key` match (e.g. `8 saac`, `30 maalin`), else
3. no match → return the row with `price_missing = true` (**never drop the row**).

Return per row: `{index, label (our label, else carrier label), carrier_label,
selling_price, info_line1, info_line2, price_missing}` plus
`{status, session_state, session_seconds_left}`.

In the same call, upsert every unmatched label into `discovery_unmatched_labels`
(`ON CONFLICT (root_package_id, normalized_label) DO UPDATE SET hits = hits + 1,
last_seen_at = now(), raw_label = excluded.raw_label`).

**Never return `cost_price` to the client.**

---

## 8. Android delivery app (companion)

- Poll loop claims work; one job per device at a time.
- SIM choice: map subscription id / ICCID → `PhoneAccountHandle`, honouring
  `primary_for_provider`.
- Discovery: dial `*212*<phone>#`, pick menu1 by **name match** against `menu1_label`
  (normalised keyword scoring; never blind-select row 1), read the bundle dialog, upload
  rows as `[{index,label}]` with `hold=true`, and **keep the dialog open**
  (`holdSessionUntilSelection` + keep-alive re-read). Only call `discovery_session_lost`
  when the dialog truly disappears. Preempt the hold when a new discovery request is
  waiting and no selection has arrived.
- Selection: `claim_discovery_selection` → type the row index into the still-open dialog,
  verify the input across windows before pressing Send, then
  `complete_discovery_selection`.
- Delivery template rule: anything after `|` is a menu path and is **never dialled**.

---

## 9. UI / UX (keep the Somali copy)

**Route order:** category *212* → payment page (provider + sender + receiver) →
"Baar xirmooyinka" → discovery page → pick a package → back to payment with `autoConfirm`.

**Discovery page has three phases.**

- `input`: card "Lambarka la siinayo", numeric 9-digit input, error
  "Fadlan gali lambarka oo dhan (9 lambar)", button "Soo baar xirmooyinka".
  Auto-starts when the receiver number was already provided.
- `searching`: spinner and one of two states —
  - queued: "Waxaad ku jirtaa safka" + "adigu waxaad tahay #N (M qof hor kaaga jira)" +
    "Lacag weli lama bixin — waad joojin kartaa markasta." + **Jooji** button;
  - running: "Waa la baarayaa… Fadlan sug 10–40 ilbiriqsi" + a seconds counter that starts
    at `claimed_at`, not at queue time.
  - Updates arrive over Supabase broadcast (`discovery:<id>`, `discovery_queue`) with a
    2.5 s poll as fallback; hard stop after 5 minutes.
  - `no_device_available` → "Hadda dhammaan xiriirada shirkadda way mashquul yihiin.
    Fadlan daqiiqad kadib isku day."
- `results`: a banner counting down from `session_seconds_left` —
  "Xiriirka shirkadda waa furan yahay — bixi lacagta gudaha **Xs**"; at 0 it turns
  destructive ("Waqtigii xiriirku wuu dhamaaday") and shows **Dib u baar**.

**Package card:** our label on the left, `$X.XX` large in the primary colour on the right,
a primary rule, then `info_line1` (Smartphone icon) and `info_line2` (Clock icon), and a
full-width **IIBSO** button. When `price_missing`: price shows `—` and the button reads
"Qiimo lama helin" and is disabled. All buttons disable when the countdown hits 0.

**Rules:** never show the carrier price or our cost; call `release_discovery_session` on
unmount when nothing was purchased; wrap the page in an error boundary; use semantic
colour tokens only.

**Admin:** a "Discovery Catalog" screen with catalog CRUD (label, cost, sell, info lines,
active) plus an "Labels aan qiimo lahayn" section listing `discovery_unmatched_labels`
(label, hits, last seen) with one-click "add to catalog".

---

## 10. TROUBLESHOOTING — "wax xirmo ah lama soo bandhigo" (no packages appear)

This is the single most common failure. The scrape usually worked; the **price join**
dropped every row. Diagnose in this order:

1. **Did the scrape return rows?**
   ```sql
   select id, status, error, jsonb_array_length(items) n, raw_menu
   from ussd_package_discoveries order by created_at desc limit 5;
   ```
   `n = 0` → the Android side is the problem (wrong menu1 match, dialog closed too early).
   `n > 0` but the UI is empty → it is the join. Continue.

2. **The join must never hide rows.** A hard `INNER JOIN` / `normalized_label =` filter is
   the bug: any spelling drift (`xadidneyn` vs `xadidnayn`, `internet+kuhadal`, `6saac`)
   deletes the row. Use the three-tier LEFT JOIN of Section 7 and return
   `price_missing = true` instead of dropping.

3. **Carrier price prefixes.** Rows arrive as `$0.15=Internet aan xadidnayn, 3 Saac`.
   Both sides of the comparison must pass through
   `ussd_normalize_label(ussd_strip_price_prefix(...))`.

4. **`is_active = false` catalog rows** are excluded by design — check them; an inactive row
   looks exactly like a missing price.

5. **Wrong root.** The catalog is scoped by `root_package_id`. Prices entered under "Data"
   never match a discovery started from "Data iyo Kuhadal".

6. **Verify with SQL** (replace the id):
   ```sql
   select item->>'index' idx,
          ussd_strip_price_prefix(item->>'label') raw,
          ussd_normalize_label(ussd_strip_price_prefix(item->>'label')) norm,
          (select selling_price from ussd_price_catalog c
            where c.root_package_id = d.root_package_id and c.is_active
              and (c.normalized_label = ussd_normalize_label(ussd_strip_price_prefix(item->>'label'))
                   or ussd_duration_key(c.label) = ussd_duration_key(item->>'label'))
            limit 1) price
   from ussd_package_discoveries d, jsonb_array_elements(d.items) item
   where d.id = '<discovery-id>';
   ```
   Every `price is null` row is exactly what the user is missing — and it must already be
   sitting in `discovery_unmatched_labels` for the admin to price.

7. **Empty catalog.** A fresh project with no `ussd_price_catalog` rows shows nothing
   priced. Seed Section 3 first — that alone fixes most "no packages" reports.

8. **Client filter.** Make sure the UI is not filtering out `price_missing` rows silently;
   render them disabled so the problem is visible instead of looking like "no packages".

**The rule:** the carrier menu is the source of truth for *what exists*; our catalog is the
source of truth for *the price*. A missing price must degrade to a visible, disabled row
and an admin task — never to an empty screen.

---

## 11. Invariants

- Never select a wrong menu row: exact label → price-tier → fail the order (with an admin
  alert). Never fall back to row 1.
- Never close the discovery dialog before a selection or a real timeout.
- One device, one active session; provider filtering on every claim.
- Never dial anything after `|`.
- Never show the carrier price or our cost to the customer.
- Treat an MMI/connection error as a failure, never as success.

## 12. Acceptance tests

1. Discovery on a real number returns rows and shows priced cards.
2. A label absent from the catalog appears as a disabled card **and** creates a
   `discovery_unmatched_labels` row with `hits`.
3. Pricing that label in admin makes the next discovery show it priced.
4. Losing the session after payment triggers the re-dial fallback and still delivers the
   same package (or fails loudly — never a wrong package).
5. Two simultaneous customers queue correctly (`position`/`ahead` shown, no cross-talk).
