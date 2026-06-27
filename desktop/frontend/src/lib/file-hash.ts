/**
 * Calculate SHA-256 hash of a file
 * This should be called on the ORIGINAL file before any compression or processing
 * to ensure consistent duplicate detection
 */
export async function calculateFileHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Calculate hashes for multiple files in parallel
 * Returns a Map of file id to hash
 */
export async function calculateFileHashes(
  files: { id: string; file: File }[]
): Promise<Map<string, string>> {
  const hashMap = new Map<string, string>()
  
  // Process in batches to avoid memory issues with large files
  const BATCH_SIZE = 5
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE)
    const results = await Promise.all(
      batch.map(async (item) => {
        const hash = await calculateFileHash(item.file)
        return { id: item.id, hash }
      })
    )
    results.forEach(({ id, hash }) => hashMap.set(id, hash))
  }
  
  return hashMap
}