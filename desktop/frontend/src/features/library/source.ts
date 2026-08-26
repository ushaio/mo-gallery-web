export const SOURCE_STORAGE_KEY = "mo-gallery:resource-library-source";

export type LibrarySource = "cloud" | "local";

export function isLibrarySource(value: string | null): value is LibrarySource {
  return value === "cloud" || value === "local";
}
