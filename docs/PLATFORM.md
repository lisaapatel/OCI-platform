# Platform source of truth

**Audience:** humans + Cursor on a new day. **Goal:** what exists, where it lives, hard limits so we don’t spec impossible changes.

---

## Stack

| Layer | Choice |
|--------|--------|
| App | Next.js (App Router), React 19, TypeScript, Tailwind v4 |
| Auth / DB | Supabase (client + service role for server routes) |
| Files | Google Drive (folder per application, uploads + compressed/fixed subfolders) |
| AI extraction | Anthropic Claude (`lib/claude.ts`); passport doc types get MRZ pre-pass via `mrz` + merge (`lib/mrz-parse.ts`) |
| Deploy | Vercel (typical); env in Vercel + local `.env.local` (gitignored) |

---

## Product model

- **Application** (`applications` table): one customer case. Fields include `service_type`, `status`, `is_minor`, optional nullable **`oci_intake_variant`** (OCI intake lane; `NULL` = legacy behavior), `archived_at`, billing/tracking fields, Drive folder ids/urls.
- **Document** (`documents`): one row per upload; `doc_type` is a **stable string key** aligned with checklists (not free-form).
- **Extracted fields** (`extracted_fields`): flat key/value rows keyed by `field_name`, tied to `source_doc_type`.

**Service types** (`Application.service_type`):

| Value | Product | Checklist source |
|--------|---------|------------------|
| `oci_new` | OCI new | `lib/oci-new-checklist.ts` → `OCI_NEW_CHECKLIST` |
| `oci_renewal` | OCI renewal | Same checklist as new |
| `passport_renewal` | Indian passport renewal (VFS USA) | `lib/passport-renewal-checklist.ts` |
| `passport_us_renewal_test` | Internal DS-82 PDF POC | `lib/application-checklist.ts` → `PASSPORT_US_RENEWAL_TEST_CHECKLIST` |

**Routing checklist in code:** `getChecklistForServiceType()` in `lib/application-checklist.ts`.

---

## App routing and shell

- **Root** [`app/layout.tsx`](../app/layout.tsx): global providers / HTML shell.
- **Authenticated product chrome:** routes under [`app/(main)/`](../app/(main)/) use [`app/(main)/layout.tsx`](../app/(main)/layout.tsx), which wraps children in [`components/app-shell.tsx`](../components/app-shell.tsx) (sidebar + main column).
- **Login** lives outside `(main)` at [`app/login/page.tsx`](../app/login/page.tsx) (no `AppShell`).
- **URL vs folders:** the `(main)` segment is a route group only; it does **not** appear in the path (e.g. dashboard is `/dashboard`, not `/main/dashboard`).

### Sidebar navigation (order matters)

Defined in `app-shell.tsx` `navItems`:

1. Dashboard → `/dashboard`
2. New Application → `/applications/new`
3. **Client Messaging** → `/client-messaging` (optional `MessageSquare` icon from `lucide-react`; other items are text-only links)
4. Archived apps → `/dashboard/archived`

Active styling: `/` is treated as dashboard; archived matches `/dashboard/archived` and subpaths; other routes match exact prefix.

---

## Client Messaging (static copy library)

**Purpose:** internal team tool for pre-written **email / WhatsApp** messages. **No database, no API** — all strings live in code.

| Item | Location |
|------|-----------|
| Page | [`app/(main)/client-messaging/page.tsx`](../app/(main)/client-messaging/page.tsx) |
| Data + composition | [`lib/client-messaging-templates.ts`](../lib/client-messaging-templates.ts) |

**Layout:** ~30% / 70% split — left column selects **service type** (buttons); right column lists **template cards**. Default service: **OCI - New Application** (`oci_new`).

**Service keys** (`ClientMessagingServiceId`): `oci_new`, `oci_renewal`, `passport_renewal` — three products only (there is **no** fourth “Minor Application” nav item in the messaging UI; minor handling is per-checklist below).

**Templates per service:** three messages for each — Welcome & document checklist, submitted, thank-you / gift card. **Message 2 (submitted)** and **Message 3 (gift card)** bodies are **shared constants** (`OCI_NEW_MESSAGE_2_BODY`, `OCI_NEW_MESSAGE_3_BODY`) so OCI renewal and passport renewal cannot drift from OCI new for those steps. Passport renewal message 2 has its **own** body (VFS copy differs).

**Template card UI:** title, grey tag `Email / WhatsApp`, read-only resizable textarea, **Copy** (clipboard via `navigator.clipboard.writeText`), **Copied ✓** for ~2s.

**Minor applicant toggle (messaging only — not `applications.is_minor`):** Message 1 for each service supports an optional **Minor applicant** switch. When on, `composeClientMessagingBody()` splices `CHECKLIST_MINOR_APPEND` into the stored `body`:

- **OCI new** (`minorInsert: "please_send"`): insert before the substring `\n\nPlease send all documents`.
- **OCI renewal + passport renewal** (`minorInsert: "once_receive"`): insert before `\n\nOnce we receive your documents`.

If the needle is missing, the append is concatenated at the end (fallback). **OCI new message 1 `body`** is stored **without** the minor block; toggling on reconstructs the same wording as the original spec.

**Copy / typography note:** UI labels and template **titles** use a **plain hyphen** (e.g. `OCI - New Application`, `Message 1 - Welcome…`). Message **bodies** may still use **en dashes in numeric ranges** (e.g. `8–12 weeks`, `70–80%`) — do not confuse with em dash removal in titles.

**Changing copy:** edit `client-messaging-templates.ts` only; if you change paragraph boundaries, verify `NEEDLE_PLEASE_SEND` / `NEEDLE_ONCE_RECEIVE` still match or update `minorInsert` logic.

---

## Minor applicants (`is_minor`)

- DB column `applications.is_minor` (boolean, default false).
- When true: **append** `PARENT_DOCUMENT_CHECKLIST_ITEMS` from `lib/parent-documents.ts` after the base checklist on the application detail UI (not inside `oci-new-checklist.ts`).
- **Ready to submit:** minors must satisfy `minorParentDocumentsMet` (≥1 of father/mother passport + `parent_address_proof`) for **all** service types; non-minor OCI still uses legacy `ociParentRequirementMet` (parent passport / OCI / legacy bucket).
- Portal readiness (`lib/portal-readiness-server.ts`) uses the same logic so “green” matches PATCH rules.

---

## Images & PDFs (hard specs)

**Single numeric source for OCI portal-style limits:** `lib/portal-constants.ts`

| Constant | Value | Used for |
|----------|--------|-----------|
| `PORTAL_IMAGE_MAX_KB` / `_BYTES` | 500 KB / 512000 | OCI-style **JPEG** photo & signature |
| `PORTAL_DOC_MAX_KB` / `_BYTES` | 1000 KB / 1024000 | **PDFs** on portal (supporting docs) |
| `PORTAL_PDF_COMPRESS_TARGET_KB` | 950 | Compression target headroom |

### OCI + DS-82 test photo / signature (govt-style)

- **Specs object:** `GOVT_PHOTO_SPECS` / signature in `lib/govt-photo-signature.ts` (imports portal byte cap).
- **Photo:** JPEG, **200×200–1500×1500** px, max **500KB**; validated server + client paths; crop editor targets square.
- **Signature:** JPEG, **wide ~3:1**, width **200–1500** px, height **67–500** px, max **500KB**; crop/export often **600×200**.

### Indian passport renewal (`passport_renewal`) photo only

- **Specs:** `PASSPORT_RENEWAL_PHOTO_SPECS` in `lib/passport-photo-specs.ts` (separate from OCI — **not** 500KB).
- JPEG, **square 1:1**, **350–1000** px per side, **20–100 KB** file size; export default **600×600** (`PASSPORT_RENEWAL_EXPORT_PX`).
- **White background** is **not** auto-detected; UI uses a manual confirmation pattern. Auto checks: `allPassportRenewalPhotoAutoChecksPass()`.

### PDFs

- Checklist PDFs are validated against **1000KB** portal limit (compress APIs / portal-prep). Photo slots are JPEG, not this cap.

---

## AI extraction nuances

- **Skipped doc types** (no Claude JSON extraction): `applicant_photo`, `applicant_signature`, `photo` — `shouldSkipAiExtraction()` in `lib/oci-new-checklist.ts`.
- **Passport MRZ path** (`lib/claude.ts` + `lib/extraction-profiles.ts`): same doc types as before — `indian_passport_core` vs `foreign_passport_core` (routing from `doc_type` plus application `service_type` / `oci_intake_variant` where needed); verbatim transcription → `extractMRZ()` → vision JSON; MRZ wins on overlapping identity fields.
- **Passport MRZ merge** (`lib/passport-mrz-merge.ts`): MRZ overlays vision for identity fields; when MRZ has both `first_name` and `last_name`, vision applicant-name fields are cleared before merge (avoids Indian passport family-page names in applicant slots); `date_of_birth` more than one calendar year in the future is nulled as likely expiry confusion.
- **Form fill address sources:** present and permanent address blocks use `SRC_ADDRESS_PROOF_ORDER`: `address_proof`, `us_address_proof`, `indian_address_proof` — not `current_passport`.
- **Field naming:** snake_case; canonical hints in `CLAUDE_EXTRACTION_KEY_INSTRUCTIONS` (`lib/form-fill-sections.ts`). Form fill / review map synonyms there.
- **Reconciliation API:** This codebase does not ship `POST /api/reconcile/rerun-all`. To bulk-clear stale review flags after deploy, use the review UI or a one-off script/Supabase update unless a future route is added.

---

## Main UI surfaces

| Area | Path / component |
|------|-------------------|
| Shell + nav | `components/app-shell.tsx` |
| Dashboard / archived | `app/(main)/dashboard/page.tsx`, `.../archived/page.tsx` |
| New application | `app/(main)/applications/new/page.tsx` |
| Client Messaging (static) | `app/(main)/client-messaging/page.tsx` |
| Application detail | `app/(main)/applications/[id]/application-detail-client.tsx` |
| Review | `.../review/review-page-client.tsx` |
| Form fill (govt) | `.../fill/form-fill-page-client.tsx` |
| Login | `app/login/page.tsx` |

---

## Data and integrations (not built-in)

All **application** state lives in **Supabase**; the UI reads/writes via Next **route handlers** under `app/api/`. There is **no** built-in export to Google Sheets or scheduled email.

**Feasible add-ons (high level):**

- **Google Sheets:** server job or integration that queries the same tables the API uses, then writes rows via the Sheets API (or CSV export + manual import).
- **Weekly digest:** cron (e.g. Vercel Cron) + protected API route or Edge Function querying Postgres for the last 7 days, then email (Resend, SendGrid, etc.) or a webhook.

Anything that needs secrets should run **server-side** with the service role or appropriate RLS, never from the browser for bulk exports.

---

## External constraints (don’t assume)

- **Government / VFS portals** change copy and sometimes limits; our numbers are **encoded** — updating them means touching `portal-constants`, govt/passport spec files, and any duplicated copy.
- **Logo / login banner:** see **Brand / logo** below (`mix-blend-screen` on login variant; asset swap for true transparency).
- **ESM `mrz` package:** bundled for Next server; Jest doesn’t import it without extra config (tests mock `extract` at API boundary where needed).

---

## Changing behavior safely

- New **doc_type**: add to the right checklist file, `drive-file-naming.ts` if you want a pretty Drive prefix, `application-checklist.ts` `resolveDocTypeChecklistLabel`, extraction prompts if AI should read it, portal-readiness if it’s PDF-on-portal.
- New **service type**: extend `Application.service_type`, POST/PATCH validation, `getChecklistForServiceType`, dashboard badges, any status gates.
- **Stricter photos:** update the spec constant + validator + crop editor props together; **cross-check** portal docs before promising users.
- **Client Messaging:** add or edit entries in `CLIENT_MESSAGING_SERVICES` / `CLIENT_MESSAGING_TEMPLATES`; for a new **Message 1**-style template with minor splice, set `minorAppend` + `minorInsert` and ensure the `body` contains the exact needle string expected by `composeClientMessagingBody`.
- **Nav:** reorder or add links only in `app-shell.tsx` `navItems`; optional per-item `icon: LucideIcon`.

---

## Brand / logo

- **Component:** `components/brand-logo.tsx` — `variant="sidebar"` vs login/marketing variants.
- **Login:** raster banner PNG; **CSS `mix-blend-screen`** on the login variant helps the mark sit on brand blue without a heavy box — a **new transparent asset** is still the cleanest fix if the box remains visible.
- **Sidebar:** logo sits on `bg-brand` in `app-shell.tsx`; styling is separate from login.

---

## OCI phase 1: intake variant, doc types, questionnaire

**Status:** `oci_intake_variant` is on `applications` (nullable `text` + `CHECK`). **`service_type`** stays `oci_new` / `oci_renewal`. **`NULL` variant** = legacy / unspecified — same meaning as application detail copy `OCI_INTAKE_VARIANT_LEGACY_DISPLAY` in `lib/oci-intake-ui.ts`: base OCI checklist only (no variant-specific document slots).

**New Application (OCI only):** The create form asks three questions (see [Minimum intake questionnaire](#minimum-intake-questionnaire-maps-to-variant--is_minor) below). Answers map via `ociIntakeVariantFromAnswers` in [`lib/oci-intake-ui.ts`](../lib/oci-intake-ui.ts) and set `is_minor` for “under 18”. Passport and other services do not show OCI intake questions.

**Application detail:** Human-readable intake text uses `formatOciIntakeVariantLabel` in the same module. After the first document upload, the API **locks** `oci_intake_variant`; the UI shows a short note in Status & flags.

**Advisory docs:** Phase-1 variant-specific checklist rows (`indian_citizenship_relinquishment`, `applicant_oci_card`) are **not required** in code — they do **not** block Ready to Submit or portal readiness when missing.

### Variant values (phase 1)

| Value | Meaning |
|--------|---------|
| `new_prev_indian` | First-time OCI; applicant previously held Indian citizenship / Indian passport (renunciation/surrender path). |
| `new_foreign_birth` | First-time OCI; foreign national by birth. **Minor** = same variant + **`is_minor = true`**. |
| `misc_reissue` | Existing OCI card matter: reissue, correction, update, lost card, etc. |

### New `doc_type` values

**Phase 1 — add**

| `doc_type` | Variant(s) | Notes |
|------------|------------|--------|
| `indian_citizenship_relinquishment` | `new_prev_indian` | One required slot for **renunciation and/or surrender certificate** (whichever applies). Label text should state both are acceptable unless you split types later. |
| `applicant_oci_card` | `misc_reissue` | Applicant’s **existing OCI card** (front/back per ops). Distinct from `parent_oci`. |

**`new_foreign_birth`:** no new `doc_type` in phase 1 — base `OCI_NEW_CHECKLIST` + **`is_minor`** + parent checklist already cover the usual case. For this variant the optional `former_indian_passport` row keeps the **same `doc_type`** but uses **neutral checklist copy** (no India-only label; a former passport from another country may still apply — see `lib/oci-checklist-compose.ts`).

**Defer (examples):** separate `renunciation_certificate` / `surrender_certificate`, `oci_reissue_reason_letter`, `proof_custody_guardianship`, PIO/lost-card-specific types, unless a later phase requires them.

### Where to wire each new `doc_type`

| Area | Files / action |
|------|----------------|
| Checklist | `lib/oci-checklist-compose.ts` + `getChecklistForApplication` in `lib/application-checklist.ts` — variant extras are **optional** (`required: false`) in phase 1. |
| Labels | `lib/oci-new-checklist.ts` (`getOciChecklistLabel`) + `resolveDocTypeChecklistLabel` in `lib/application-checklist.ts`. |
| Drive prefixes | `lib/drive-file-naming.ts` — `DOC_TYPE_DRIVE_PREFIX`. |
| Intake UX | `app/(main)/applications/new/page.tsx` + `lib/oci-intake-ui.ts`. |
| Extraction | `lib/claude.ts` — add to `PASSPORT_MRZ_DOC_TYPES` **only** if the upload is passport biodata + MRZ; OCI card / renunciation PDFs use the generic vision path. |
| Skip AI | `lib/oci-new-checklist.ts` — `shouldSkipAiExtraction` only if the slot is image-only like photo/signature (usually not for these). |
| Readiness | `lib/portal-readiness-server.ts` uses composed checklist; variant-specific docs remain non-blocking in phase 1. |

### Editing `oci_intake_variant` after creation

**Recommendation:** editable **only while there are no rows in `documents`** for that application (or stricter: `docs_pending` + zero uploads). After uploads exist, **lock** the variant or require a deliberate admin override with a warning banner. Reason: changing variant changes required slots; existing uploads may no longer match the checklist.

Order of safety: **lock after uploads** > editable with warnings > locked forever at create.

### Minimum intake questionnaire (maps to variant + `is_minor`)

**Q1 — OCI situation**

- **A.** First-time OCI registration (no OCI card yet).
- **B.** Already have / had an OCI card — reissue, correction, lost card, name change, or other update.

**Mapping:** **B** → `oci_intake_variant = misc_reissue` → then **Q3**. **A** → **Q2**.

**Q2 — Prior Indian citizenship (only if A)**

- **Yes** — Previously held Indian citizenship or Indian passport.
- **No** — Foreign national by birth.

**Mapping:** **Yes** → `new_prev_indian`. **No** → `new_foreign_birth`.

**Q3 — Minor**

- Is the applicant under 18? **Yes / No** → sets existing **`is_minor`**.

| Q1 | Q2 | `oci_intake_variant` |
|----|----|----------------------|
| B | — | `misc_reissue` |
| A | Yes | `new_prev_indian` |
| A | No | `new_foreign_birth` |

**Phase 1 exclusions:** spouse OCI, PIO conversion, cancellation workflows, automated eligibility inference from uploads, heavy form-fill branching per variant — defer until checklists are stable.

### Architecture pointers (same PR as code)

- Prefer **one nullable `oci_intake_variant`** over many new `service_type` values (avoids repeated Postgres `CHECK` churn and dashboard `if` chains). Align with **Product model** and **`service_type` validation** described earlier in this doc.
- Branching rules should live in a **single checklist composer** consumed by application detail + portal readiness + (where relevant) `ready_to_submit` validation.

---

*Last aligned with repo structure as of internal development; if this drifts, update this file in the same PR as the code change.*
