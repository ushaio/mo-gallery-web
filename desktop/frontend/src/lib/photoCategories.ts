export function normalizePhotoCategories(categories: string[] | null | undefined): string[] {
  return Array.from(new Set(
    (categories ?? [])
      .map(category => category.trim())
      .filter(category => category && category !== '全部' && category.toLocaleLowerCase() !== 'all'),
  ))
}
