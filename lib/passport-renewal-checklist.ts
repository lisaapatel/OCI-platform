import { getPassportRenewalChecklist } from "@/lib/passport-renewal-document-catalog";

/** Indian passport renewal (VFS Global USA) default checklist (adult, no optional bundles toggled on). */
export const PASSPORT_RENEWAL_CHECKLIST = getPassportRenewalChecklist({
  isMinor: false,
});
