# Govt form fill page — field repetition audit

This note supports deciding whether any rows on `/applications/[id]/fill` can be hidden or consolidated later. **No fields were removed** as part of the UI remap; this is analysis only.

**Full field-by-field table:** [fill-page-fields-table.md](./fill-page-fields-table.md) (every portal label, section, and whether it’s a portal pair, key-overlap risk, or reference-only).

## Intentional duplication (portal-driven)

### Present vs permanent address

In [`lib/form-fill-sections.ts`](../lib/form-fill-sections.ts), **permanent** address field definitions fall back to **present** keys (e.g. `permanent_city` resolves via `city`). The UI shows parallel blocks (line 1, city, state, country, postal code, phone, email).

**Verdict:** Often required because the government portal asks for both. Hiding “duplicate” values risks missing a second entry on the official site. Any future “dedupe” UX must be validated against real portal steps.

### Phone and email in both address sections

Both **Present Address** and **Permanent Address** include phone/email rows with overlapping key lists.

**Verdict:** Same as above — likely intentional for portal entry.

## Key overlap to watch (data / QA, not just UI)

### Former Indian passport block

The former-Indian passport **number** row includes keys such as `passport_number` / `passport_no` in addition to `former_*` keys. The **current foreign passport** block uses the same generic keys.

**Risk:** Weak extraction or wrong `source_doc_type` could show the **current** passport number in the former-Indian section.

**Verdict:** Fix via extraction rules and review, not by hiding the row without a product decision.

### Parent Indian passport / OCI number rows

Father’s and mother’s Indian passport number fields use broad key lists (`passport_number`, `document_number`, etc.).

**Risk:** Similar mis-association if sources are unclear.

**Verdict:** Review source tags and extraction before removing rows.

## Lower-noise content (future UX only)

### Reference-only lines

`referenceOnly` definitions (e.g. father/mother document type) render as grey reference lines (`FormFillReferenceNote`), not full portal copy rows.

**Verdict:** Useful for trained staff; adds vertical length. A later option is to tuck them under a small “Reference” disclosure inside the family section — out of scope for the initial readability pass.

## Not redundant in config

**Personal details** vs **Current passport (foreign)** split identity fields from passport metadata by design; they are not duplicate blocks in `OCI_FORM_FILL_BLOCKS`.

## Summary

| Area | Safe to hide without portal review? |
|------|-------------------------------------|
| Parallel present / permanent address rows | **No** — likely both needed on portal |
| Phone/email in both address blocks | **No** — same |
| Former Indian vs current passport key overlap | **Risk** — fix data, don’t hide blindly |
| Parent passport key breadth | **Risk** — fix data / QA |
| Reference-only grey lines | **Maybe** — optional future collapse |
