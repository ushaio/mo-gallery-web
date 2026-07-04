import { calculateSpreadCanvasScale } from './SpreadCanvas'

const scale = calculateSpreadCanvasScale({
  availableWidth: 1200,
  availableHeight: 520,
  spreadWidthMm: 296,
  spreadHeightMm: 210,
})

const renderedHeight = 210 * scale

if (renderedHeight > 520 - 24) {
  throw new Error(`Expected canvas height to fit viewport, got ${renderedHeight}px`)
}

if (renderedHeight > 420) {
  throw new Error(`Expected canvas height to leave editor breathing room, got ${renderedHeight}px`)
}
