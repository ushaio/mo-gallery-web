'use client'

import { useRef } from 'react'
import { useServerInsertedHTML } from 'next/navigation'

/**
 * Pre-hydration theme bootstrap.
 *
 * The script has to be an inline classic script inside `<head>` so it runs
 * before the first paint (no light/dark flash). Rendering it as a plain
 * `<script>` element in the tree makes React log
 * "Encountered a script tag while rendering React component" whenever the shell
 * is re-rendered on the client (e.g. after a server render error), because
 * scripts created by React on the client never execute.
 *
 * `useServerInsertedHTML` flushes it into the server-rendered document as raw
 * HTML instead, so the React tree never contains a script element. The callback
 * runs once per document: Next.js re-invokes registered callbacks on every
 * stream flush, and only the first flush is the `<head>` one.
 */
const THEME_INIT_SCRIPT = `
      (function() {
        try {
          var theme = localStorage.getItem('theme') || 'dark';
          var supportDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches === true;
          if (theme === 'dark' || (theme === 'system' && supportDarkMode)) {
            document.documentElement.classList.add('dark');
          } else {
            document.documentElement.classList.remove('dark');
          }
        } catch (e) {}
      })();
    `

export default function ThemeInitScript() {
  const inserted = useRef(false)

  useServerInsertedHTML(() => {
    if (inserted.current) return null
    inserted.current = true
    return (
      <script
        id="theme-init"
        dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
      />
    )
  })

  return null
}
