import { calculateSpreadCanvasScale, toScreenPx } from './SpreadCanvas'

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

const renderedWidth = 296 * scale

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

if (renderedWidth > 1200 - 48) {
  throw new Error(`Expected screen canvas width to use px sizing and fit viewport, got ${renderedWidth}px`)
}

if (toScreenPx(296, scale) !== renderedWidth) {
  throw new Error('Expected screen px helper to map mm through the canvas scale only')
}
