import { useEffect, useRef, useState } from 'react'

export interface TransferSpeedSource {
  id: string
  bytes: number
  active: boolean
}

const MIN_SAMPLE_MS = 100
const SMOOTHING = 0.6

// Computes the aggregate transfer speed (bytes per second) across the active
// sources by sampling byte deltas between renders. The baseline time is only
// advanced when bytes actually change, so a stalled transfer does not inflate
// the next measurement. The result is exponentially smoothed.
export function useTransferSpeed(sources: TransferSpeedSource[], isActive: boolean): number {
  const [speed, setSpeed] = useState(0)
  const lastRef = useRef<{ bytes: number; time: number } | null>(null)

  useEffect(() => {
    if (!isActive) {
      lastRef.current = null
      setSpeed(0)
      return
    }
    const now = performance.now()
    const totalBytes = sources.reduce((sum, s) => sum + (s.active ? s.bytes : 0), 0)
    const last = lastRef.current
    if (!last) {
      lastRef.current = { bytes: totalBytes, time: now }
      return
    }
    const deltaBytes = totalBytes - last.bytes
    const deltaTime = now - last.time
    if (deltaBytes > 0 && deltaTime >= MIN_SAMPLE_MS) {
      const instantaneous = (deltaBytes * 1000) / deltaTime
      setSpeed(prev => (prev <= 0 ? instantaneous : prev * SMOOTHING + instantaneous * (1 - SMOOTHING)))
      lastRef.current = { bytes: totalBytes, time: now }
    } else {
      lastRef.current = { bytes: totalBytes, time: last.time }
    }
  }, [sources, isActive])

  return speed
}

export function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond <= 0) return ''
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s']
  let value = bytesPerSecond
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index++
  }
  return value.toFixed(1) + ' ' + units[index]
}
