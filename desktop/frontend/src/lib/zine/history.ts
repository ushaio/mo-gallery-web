import type { Spread } from './types'

export function cloneSpreads(spreads: Spread[]): Spread[] {
  return structuredClone(spreads)
}
