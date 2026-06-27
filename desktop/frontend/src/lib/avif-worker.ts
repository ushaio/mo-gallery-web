/// <reference lib="webworker" />

import { encode } from '@jsquash/avif'

self.onmessage = async (e: MessageEvent) => {
  const { id, imageDataBuffer, width, height, quality, speed } = e.data as {
    id: number
    imageDataBuffer: ArrayBuffer
    width: number
    height: number
    quality: number
    speed: number
  }

  try {
    const imageData = new ImageData(
      new Uint8ClampedArray(imageDataBuffer),
      width,
      height,
    )
    const result = await encode(imageData, {
      quality,
      speed,
      subsample: 1,
    })
    self.postMessage({ id, result }, [result])
  } catch (err) {
    self.postMessage({
      id,
      error: err instanceof Error ? err.message : 'AVIF encoding failed',
    })
  }
}
