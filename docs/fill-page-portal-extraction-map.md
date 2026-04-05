# Govt form fill — portal row → extraction mapping

**Purpose:** Evaluate whether each portal-facing row pulls the right **value**, **document**, and **field keys**, and how **fallback** works.

**Source of truth**

- Block definitions: [`OCI_FORM_FILL_BLOCKS`](../lib/form-fill-sections.ts)
- Source order: [`resolveFormFillSourceOrder`](../lib/form-fill-sections.ts) (plus **locked** / **priority** overrides below)
- Row resolution: [`findRowByKeysAndSources`](../lib/form-fill-sections.ts) — for each `source_doc_type` **in order**, find the first `extracted_fields` row whose `field_name` matches any **key alias** (synonyms in [`EXTRACTED_KEY_SYNONYMS`](../lib/form-fill-sections.ts))
- Plan / copy value: [`buildOciFormFillPlan`](../lib/oci-form-fill-build.ts), [`formatPortalDate`](../lib/oci-govt-fill-resolve.ts)

**Overrides (apply before `def.sourceDocTypes`)**

| Rule | Canonical key (from first def key) | Effective `source_doc_type` order |
|------|-------------------------------------|-------------------------------------|
| **Locked** (single source) | `full_name`, `place_of_birth`, `passport_*`, `nationality`, `current_nationality`, `first_name`, `middle_name`, `last_name` | `current_passport` only |
| **Priority** (two-step) | `date_of_birth`, `gender` | `current_passport` → `birth_certificate` |

Parent/spouse rows **not** in the table above use the **`sourceDocTypes`** on the field definition (see “Fallback / source order” column).

---

## How to read the table

| Column | Meaning |
|--------|---------|
| **Portal label** | Label on the fill page (minor present-address rows get a “Parent's address…” prefix — not repeated here). |
| **Value / copy** | What is shown for copy-to-portal; date fields use `dd/MMM/YYYY` when `formatPortalDate` succeeds. |
| **Winning document** | The `source_doc_type` on the **extracted row** that supplied the value (first hit in fallback order with a matching key and non-empty value in UI state). |
| **Extraction keys** | `def.keys` tried in order (aliases expand via synonym groups). |
| **Fallback / source order** | Ordered list: try doc type 1 across all keys, then doc type 2, … (`findRowByKeysAndSources`). |

**Special:** **Full name** does **not** use `findRowByKeysAndSources`; it uses [`resolvePassportFullName`](../lib/form-fill-sections.ts) (current passport only; composed name logic).

---

## Place of submission

*(Not in `OCI_FORM_FILL_BLOCKS` — manual on the government site.)*

---

## Personal details (`personal`)

| Portal label | Value / copy | Winning document | Extraction keys | Fallback / source order |
|--------------|--------------|------------------|-----------------|-------------------------|
| Full name | Passport full-name rules (composed or whole-name fields) | `current_passport` | `full_name`, `complete_name`, `name_in_full` | **Locked:** `current_passport` only. Resolver: `resolvePassportFullName` (not key-by-key source walk). |
| Date of birth | Raw / portal-formatted date | First of passport or BC with a hit | `date_of_birth`, `dob`, `birth_date` | **Priority:** `current_passport` → `birth_certificate` |
| Place of birth | As extracted | `current_passport` | `place_of_birth`, `birth_place`, `pob`, `birthplace`, `city_of_birth`, `birth_city` | **Locked:** `current_passport` only |
| Gender | As extracted | First of passport or BC | `gender`, `sex` | **Priority:** `current_passport` → `birth_certificate` |
| Marital status | As extracted | First of passport or BC | `marital_status`, `marital` | `current_passport` → `birth_certificate` |
| Visible identification mark | As extracted | First of passport or BC | `visible_identification_mark`, `visible_mark` | `current_passport` → `birth_certificate` |
| Educational qualification | As extracted | First of passport or BC | `educational_qualification`, `education`, `qualification` | `current_passport` → `birth_certificate` |
| Present occupation | As extracted | First of passport or BC | `present_occupation`, `occupation`, `profession` | `current_passport` → `birth_certificate` |

---

## Current passport — foreign (`foreign_passport`)

| Portal label | Value / copy | Winning document | Extraction keys | Fallback / source order |
|--------------|--------------|------------------|-----------------|-------------------------|
| Passport number | As extracted | `current_passport` | `passport_number`, `passport_no` | **Locked:** `current_passport` |
| Passport issue date | Portal date format when possible | `current_passport` | `passport_issue_date`, `date_of_issue`, `issue_date` | **Locked:** `current_passport` |
| Passport expiry date | Portal date format when possible | `current_passport` | `passport_expiry_date`, `date_of_expiry`, `expiry_date` | **Locked:** `current_passport` |
| Passport issue place | As extracted | `current_passport` | `passport_issue_place`, `place_of_issue`, `issuing_authority`, `issuing_office`, `issuing_city`, `issue_city` | **Locked:** `current_passport` |
| Passport issue country | As extracted | `current_passport` | `passport_issue_country`, `country_of_issue`, `issuing_country` | **Locked:** `current_passport` |

---

## Former Indian passport (`former_indian`)

Optional / collapsible. Same resolution pattern for all three:

| Portal label | Value / copy | Winning document | Extraction keys | Fallback / source order |
|--------------|--------------|------------------|-----------------|-------------------------|
| Former Indian passport number | As extracted | First match in former-Indian docs | `former_indian_passport_number`, `former_passport_number`, `passport_number`, `passport_no` | `former_indian_passport` → `old_passport` |
| Former Indian passport issue date | Portal date when possible | Same | `former_indian_passport_issue_date`, `former_passport_issue_date` | `former_indian_passport` → `old_passport` |
| Former Indian passport issue place | As extracted | Same | `former_indian_passport_issue_place`, `former_passport_issue_place` | `former_indian_passport` → `old_passport` |

---

## Present address (`present_address`)

Address rows share one fallback chain. **Phone** and **Email** also fall back to **application** `localPhone` / `localEmail` when extraction is empty (not a second document).

| Portal label | Value / copy | Winning document | Extraction keys | Fallback / source order |
|--------------|--------------|------------------|-----------------|-------------------------|
| Address line 1 | As extracted | First address-proof hit | `address_line_1`, `address_line1`, `street`, `street_address` | `address_proof` → `us_address_proof` → `indian_address_proof` |
| Address line 2 | As extracted | Same | `address_line_2`, `address_line2` | Same |
| City | As extracted | Same | `city`, `town` | Same |
| State / Province | As extracted | Same | `state_province`, `state`, `province` | Same |
| Country | As extracted | Same | `country`, `country_name` | Same |
| Postal code | As extracted | Same | `postal_code`, `zip`, `pin_code` | Same |
| Phone | Extracted **or** app local phone | Address proof **or** n/a | `phone`, `mobile`, `mobile_no` | Same chain; **then** UI state if still empty |
| Email | Extracted **or** app local email | Address proof **or** n/a | `email`, `e_mail` | Same chain; **then** UI state if still empty |

---

## Permanent address (`permanent_address`)

When **Same as present address** is ON, the UI shows one summary row (“Same as present address” + short summary built from **present** line 1 + city using **present-address** source order).

When OFF, each row uses **permanent_* keys** with the same **address_proof** order as present:

| Portal label | Value / copy | Winning document | Extraction keys | Fallback / source order |
|--------------|--------------|------------------|-----------------|-------------------------|
| Address line 1 | As extracted | First address-proof hit | `permanent_address_line_1`, `permanent_address_line1`, `address_line_1` | `address_proof` → `us_address_proof` → `indian_address_proof` |
| Address line 2 | As extracted | Same | `permanent_address_line_2`, `permanent_address_line2`, `address_line_2` | Same |
| City | As extracted | Same | `permanent_city`, `city` | Same |
| State / Province | As extracted | Same | `permanent_state`, `state_province`, `state` | Same |
| Country | As extracted | Same | `permanent_country`, `country` | Same |
| Postal code | As extracted | Same | `permanent_postal_code`, `postal_code`, `pin_code` | Same |
| Phone | As extracted | Same | `phone`, `mobile` | Same |
| Email | As extracted | Same | `email` | Same |

---

## Parent / spouse (`family`)

**Parent passport# / OCI#** rows are **hidden** until the corresponding parent passport or OCI upload exists (`buildOciFormFillPlan`).

**Spouse** rows are hidden when **not married**.

| Portal label | Value / copy | Winning document | Extraction keys | Fallback / source order |
|--------------|--------------|------------------|-----------------|-------------------------|
| Father's name | As extracted | First parent-source hit | `father_full_name`, `father_name`, `father` | `parent_passport_father` → `parent_passport` → `parent_indian_doc` → `parent_oci_father` → `parent_oci` |
| Father's date of birth | Portal date when possible | Same | `father_date_of_birth`, `father_dob` | Same |
| Father's place of birth | As extracted | Same | `father_place_of_birth`, `father_pob` | Same |
| Father's nationality | As extracted | Same | `father_nationality` | Same |
| Father — document type *(reference note only)* | Grey ℹ line, not a copy row | Same | `father_document_type` | Same *(referenceOnly; shows extracted value or upload hint)* |
| Father's Indian passport number | As extracted | Father-slot passport doc | `father_indian_passport_number`, `father_passport_number`, `passport_number`, `passport_no`, `document_number`, `passport_id` | `parent_passport_father` → `parent_passport` → `parent_indian_doc` → `parent_passport_mother` |
| Father's OCI number | As extracted | Father-slot OCI doc | `father_oci_number`, `father_oci_card_number` | `parent_oci_father` → `parent_oci` → `parent_oci_mother` |
| Mother's name | As extracted | First parent-source hit | `mother_full_name`, `mother_name`, `mother` | `parent_passport_mother` → `parent_passport` → `parent_indian_doc` → `parent_oci_mother` → `parent_oci` |
| Mother's date of birth | Portal date when possible | Same | `mother_date_of_birth`, `mother_dob` | Same |
| Mother's place of birth | As extracted | Same | `mother_place_of_birth`, `mother_pob` | Same |
| Mother's nationality | As extracted | Same | `mother_nationality` | Same |
| Mother — document type *(reference note only)* | Grey ℹ line | Same | `mother_document_type` | Same |
| Mother's Indian passport number | As extracted | Mother-slot passport doc | `mother_indian_passport_number`, `mother_passport_number`, `passport_number`, `passport_no`, `document_number`, `passport_id` | `parent_passport_mother` → `parent_passport` → `parent_indian_doc` → `parent_passport_father` |
| Mother's OCI number | As extracted | Mother-slot OCI doc | `mother_oci_number`, `mother_oci_card_number` | `parent_oci_mother` → `parent_oci` → `parent_oci_father` |
| Spouse name | As extracted | First of passport or BC | `spouse_name`, `spouse_full_name`, `husband_name`, `wife_name` | `current_passport` → `birth_certificate` |
| Spouse nationality | As extracted | Same | `spouse_nationality` | Same |
| Spouse date of birth | Portal date when possible | Same | `spouse_date_of_birth`, `spouse_dob` | Same |

---

## Quick reference — `source_doc_type` tokens

| Token | Typical UI tag |
|-------|----------------|
| `current_passport` | Current Passport |
| `birth_certificate` | Birth Certificate |
| `address_proof` | Address Proof (or Parent variant on minor present address) |
| `us_address_proof` | US Address Proof |
| `indian_address_proof` | Indian Address Proof |
| `former_indian_passport` | Former Indian Passport |
| `old_passport` | old passport (fallback) |
| `parent_passport_father` / `parent_passport_mother` / `parent_passport` | Parent Passport |
| `parent_indian_doc` | Parent Passport |
| `parent_oci` / `parent_oci_father` / `parent_oci_mother` | Parent OCI |

---

## If you spot a wrong row

Note **portal label**, what you **expected** (document + field), and what the UI **showed** (source tag + value). That maps directly to: wrong extraction key on document, wrong `source_doc_type` on the row, or an override (locked / priority / full-name composer) behaving differently than policy.
