import { calculateSpreadCanvasScale } from './SpreadCanvas'

const scale = calculateSpreadCanvasScale({
  availableWidth: 1200,
  availableHeight: 520,
  spreadWidthMm: 296,
  spreadHeightMm: 210,
  zoom: 1,
})

const zoomedScale = calculateSpreadCanvasScale({
  availableWidth: 1200,
  availableHeight: 520,
  spreadWidthMm: 296,
  spreadHeightMm: 210,
  zoom: 0.5,
})

const renderedHeight = 210 * scale

if (renderedHeight > 520 - 24) {
  throw new Error(`Expected canvas height to fit viewport, got ${renderedHeight}px`)
}

if (renderedHeight > 420) {
  throw new Error(`Expected canvas height to leave editor breathing room, got ${renderedHeight}px`)
}

if (Math.round(zoomedScale * 1000) !== Math.round(scale * 0.5 * 1000)) {
  throw new Error('Expected user zoom to scale the fitted canvas proportionally')
}
