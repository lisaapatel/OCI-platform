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

- **Application** (`applications` table): one customer case. Fields include `service_type`, `status`, `is_minor`, `archived_at`, billing/tracking fields, Drive folder ids/urls.
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
- **Passport MRZ path** (`lib/claude.ts`): for `current_passport`, `old_passport`, `former_indian_passport`, `parent_passport_father`, `parent_passport_mother` — verbatim transcription call → `extractMRZ()` → full vision JSON; MRZ wins on overlapping identity fields; extra passport fields via prompt (address, spouse, etc.).
- **Field naming:** snake_case; canonical hints in `CLAUDE_EXTRACTION_KEY_INSTRUCTIONS` (`lib/form-fill-sections.ts`). Form fill / review map synonyms there.

---

## Main UI surfaces

| Area | Path / component |
|------|-------------------|
| Shell + nav | `components/app-shell.tsx` |
| Dashboard / archived | `app/(main)/dashboard/page.tsx`, `.../archived/page.tsx` |
| New application | `app/(main)/applications/new/page.tsx` |
| Application detail | `app/(main)/applications/[id]/application-detail-client.tsx` |
| Review | `.../review/review-page-client.tsx` |
| Form fill (govt) | `.../fill/form-fill-page-client.tsx` |
| Login | `app/login/page.tsx` |

---

## External constraints (don’t assume)

- **Government / VFS portals** change copy and sometimes limits; our numbers are **encoded** — updating them means touching `portal-constants`, govt/passport spec files, and any duplicated copy.
- **Logo** on login uses raster banner PNG; “seamless” blue merge is **CSS `mix-blend-screen`** on login variant only — perfect transparency needs a **new asset**.
- **ESM `mrz` package:** bundled for Next server; Jest doesn’t import it without extra config (tests mock `extract` at API boundary where needed).

---

## Changing behavior safely

- New **doc_type**: add to the right checklist file, `drive-file-naming.ts` if you want a pretty Drive prefix, `application-checklist.ts` `resolveDocTypeChecklistLabel`, extraction prompts if AI should read it, portal-readiness if it’s PDF-on-portal.
- New **service type**: extend `Application.service_type`, POST/PATCH validation, `getChecklistForServiceType`, dashboard badges, any status gates.
- **Stricter photos:** update the spec constant + validator + crop editor props together; **cross-check** portal docs before promising users.

---

*Last aligned with repo structure as of internal development; if this drifts, update this file in the same PR as the code change.*
