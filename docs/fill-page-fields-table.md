# Govt form fill page — full field inventory

Route: `/applications/[id]/fill` (OCI flows). Source of truth: [`OCI_FORM_FILL_BLOCKS`](../lib/form-fill-sections.ts).

**Portal ↔ extraction matrix (keys, document order, fallbacks):** [`fill-page-portal-extraction-map.md`](./fill-page-portal-extraction-map.md).

Supporting checklist uploads that do **not** feed fill-page rows are intentionally excluded from this table (for example: `employment_letter`, `us_status_proof`, `parental_authorization`, `marriage_affidavit`). These are supporting documents: non-blocking checklist slots with extraction skipped.

**How to read “Kind”**

| Kind | Meaning |
|------|---------|
| **Keep** | Distinct portal concept; keep on the fill page. |
| **Portal pair** | Same *idea* as another row (usually present vs permanent). Govt site often has two slots — treat as **needed**, not a mistake. |
| **Split OK** | Same person, different portal sections (e.g. name in Personal vs number in Passport) — **not** redundant config. |
| **Key overlap** | Resolver uses keys shared with another block; wrong `source_doc_type` can show the wrong value — **QA / extraction**, not “delete row”. |
| **Reference** | Grey reference line only; not a primary copy-to-portal row. |
| **Conditional** | Shown only when rule applies (married, former passport, parent uploads, etc.). |

---

## SECTION 1 — Place of submission

| Portal label | Kind | Notes |
|--------------|------|--------|
| *(Consulate / jurisdiction reminder only)* | Keep | No extracted rows; manual on govt site. |

---

## SECTION 2 — Personal details (`personal`)

| Portal label | Kind | Notes |
|--------------|------|--------|
| Full name | Split OK | Identity; passport full-name resolution may apply. |
| Date of birth | Split OK | Also appears on passport; portal asks in biodata. |
| Place of birth | Split OK | Tagged “current passport only” for source order. |
| Gender | Split OK | |
| Marital status | Conditional | Controls spouse rows in family block. |
| Visible identification mark | Split OK | |
| Educational qualification | Split OK | |
| Present occupation | Split OK | Select where applicable. |

---

## SECTION 3 — Current passport / foreign (`foreign_passport`)

| Portal label | Kind | Notes |
|--------------|------|--------|
| Passport number | Split OK | **Key overlap** with former-Indian row if extraction mis-maps. |
| Passport issue date | Split OK | |
| Passport expiry date | Split OK | |
| Passport issue place | Split OK | |
| Passport issue country | Split OK | Feeds “detected profile” style hints elsewhere. |

---

## SECTION 4 — Former Indian passport (`former_indian`)

| Portal label | Kind | Notes |
|--------------|------|--------|
| Former Indian passport number | Key overlap | Keys include `passport_number` / `passport_no` **and** `former_*` — verify value is from former-Indian doc. |
| Former Indian passport issue date | Keep | Optional / collapsible section. |
| Former Indian passport issue place | Keep | Optional / collapsible section. |

---

## SECTION 5 — Present address (`present_address`)

| Portal label | Kind | Notes |
|--------------|------|--------|
| Address line 1 | Portal pair | **Pair** with permanent “Address line 1” (permanent falls back to same keys when unchecked). |
| Address line 2 | Portal pair | Same. |
| City | Portal pair | Same. |
| State / Province | Portal pair | Same. |
| Country | Portal pair | Same. |
| Postal code | Portal pair | Same. |
| Phone | Portal pair | Uses local/app phone fallback when empty; also mirrored in permanent block. |
| Email | Portal pair | Uses local/app email fallback when empty; also mirrored in permanent block. |

---

## SECTION 6 — Permanent address (`permanent_address`)

When **Same as present address** is checked, these eight rows collapse to one summary row on the fill page.

| Portal label | Kind | Notes |
|--------------|------|--------|
| Address line 1 | Portal pair | Keys: `permanent_*` then fallback `address_line_1`. |
| Address line 2 | Portal pair | |
| City | Portal pair | |
| State / Province | Portal pair | |
| Country | Portal pair | |
| Postal code | Portal pair | |
| Phone | Portal pair | Overlapping keys with present **phone** — portal often wants both blocks filled. |
| Email | Portal pair | Overlapping keys with present **email**. |

---

## SECTION 7 — Parent / spouse (`family`)

| Portal label | Kind | Notes |
|--------------|------|--------|
| Father's name | Keep | |
| Father's date of birth | Keep | |
| Father's place of birth | Keep | |
| Father's nationality | Keep | |
| Father — document type (reference) | Reference | Grey line; helps staff, not a portal paste field. |
| Father's Indian passport number | Key overlap | Broad keys include generic `passport_number` — must match parent passport source. |
| Father's OCI number | Conditional | Relevant when parent OCI uploaded / inferred. |
| Mother's name | Keep | |
| Mother's date of birth | Keep | |
| Mother's place of birth | Keep | |
| Mother's nationality | Keep | |
| Mother — document type (reference) | Reference | Grey line. |
| Mother's Indian passport number | Key overlap | Same caution as father. |
| Mother's OCI number | Conditional | |
| Spouse name | Conditional | **If married** (marital status). |
| Spouse nationality | Conditional | If married. |
| Spouse date of birth | Conditional | If married. |

---

## Quick “repeated vs needed” summary

| Situation | Repeated on page? | Usually needed on govt portal? |
|-----------|-------------------|----------------------------------|
| Present vs permanent address rows (8 + 8) | Yes — parallel labels | **Yes** — two sections on portal. |
| Phone / email in present **and** permanent | Yes | **Yes** — same as above. |
| Name / DOB / POB in Personal **and** details on foreign passport | Partially overlapping *concepts* | **Yes** — different portal sections. |
| Former Indian passport **number** vs current **passport number** | Different labels, **shared key risk** | Former only if applicable; **QA** to avoid wrong number. |
| Parent passport **number** rows vs applicant passport | Different labels, **shared key risk** | **Yes** for parents; **QA** on sources. |
| Reference-only father/mother doc type | Small extra rows | **Nice-to-have** for staff; optional future UI collapse. |

---

## Row count note

Progress text (“X of Y fields”) counts **persistable** rows (excludes `referenceOnly` grey lines). If **Same as present address** is on, the eight permanent rows are replaced by **one** synthetic row, so **Y** drops by 7.

For programmatic lists see `FORM_FILL_ALL_FIELDS` in [`form-fill-sections.ts`](../lib/form-fill-sections.ts).
