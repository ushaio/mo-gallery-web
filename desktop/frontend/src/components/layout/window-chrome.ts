import { createContext, useContext } from 'react'

interface WindowChromeContextValue {
  integrated: boolean
  styleReady: boolean
}

export const WindowChromeContext = createContext<WindowChromeContextValue>({
  integrated: false,
  styleReady: false,
})

export function useWindowChrome() {
  return useContext(WindowChromeContext)
}
