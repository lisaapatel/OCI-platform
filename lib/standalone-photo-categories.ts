/** Standalone Photo Editing tool — Drive subfolder under `Photos/`. */
export const STANDALONE_PHOTO_CATEGORY_IDS = ["oci", "indian_passport"] as const;
export type StandalonePhotoCategoryId =
  (typeof STANDALONE_PHOTO_CATEGORY_IDS)[number];

export function isStandalonePhotoCategoryId(
  v: string
): v is StandalonePhotoCategoryId {
  return (STANDALONE_PHOTO_CATEGORY_IDS as readonly string[]).includes(v);
}

export function standalonePhotoCategoryDriveFolder(
  id: StandalonePhotoCategoryId
): string {
  return id === "oci" ? "OCI" : "Indian Passport";
}

/** Optional client row + preview callback for standalone crop modals. */
export type StandaloneCropClientToolbar = {
  clientLabel: string;
  onClientLabelChange: (value: string) => void;
  onPreview: (imageBase64: string) => void | Promise<void>;
};
