import { useEffect, useState } from 'react'

import { loadZineBrowserFont, loadZineFontStack } from './font-resources'

export { DEFAULT_ZINE_FONT_FAMILY } from './font-resources'

export interface ZinePreviewFont {
  fontFamily: string | undefined
  loading: boolean
  error: string | null
}

export function useZinePreviewFont(fontFamily?: string, content = ''): ZinePreviewFont {
  const [resolved, setResolved] = useState<{ requested: string; content: string; state: ZinePreviewFont } | null>(null)
  useEffect(() => {
    if (!fontFamily) return
    let active = true
    void loadZineFontStack(fontFamily, content)
      .then(async (fonts) => {
        await Promise.all(fonts.map(loadZineBrowserFont))
        if (active) {
          setResolved({
            requested: fontFamily,
            content,
            state: { fontFamily: fonts.map((font) => `"${font.fontFamily}"`).join(', '), loading: false, error: null },
          })
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setResolved({ requested: fontFamily, content, state: { fontFamily, loading: false, error: error instanceof Error ? error.message : String(error) } })
        }
      })
    return () => { active = false }
  }, [fontFamily, content])

  if (!fontFamily) return { fontFamily: undefined, loading: false, error: null }
  if (resolved?.requested === fontFamily && resolved.content === content) return resolved.state
  return { fontFamily: resolved?.requested === fontFamily ? resolved.state.fontFamily : fontFamily, loading: true, error: null }
}
