import { useEffect, useRef } from 'react'

interface Props {
  src: string
  active: boolean
  className?: string
  onEnded?: () => void
}

export function LivePhotoCanvas({ src, active, className, onEnded }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const frameRef = useRef<number | null>(null)

  const stopFrameLoop = () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    frameRef.current = null
  }

  const drawFrame = () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return

    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
    }
    if (canvas.width > 0 && canvas.height > 0) {
      const context = canvas.getContext('2d')
      if (!context) return
      context.imageSmoothingEnabled = true
      context.imageSmoothingQuality = 'high'
      context.drawImage(video, 0, 0, canvas.width, canvas.height)
    }
  }

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    if (!active) {
      video.pause()
      video.currentTime = 0
      stopFrameLoop()
      return
    }

    void video.play().catch(() => {})
    const draw = () => {
      drawFrame()
      frameRef.current = requestAnimationFrame(draw)
    }
    draw()

    return () => {
      stopFrameLoop()
    }
  }, [active, src])

  useEffect(() => () => {
    stopFrameLoop()
    videoRef.current?.pause()
  }, [])

  const handleEnded = () => {
    const video = videoRef.current
    if (video) {
      video.pause()
      video.currentTime = 0
    }
    stopFrameLoop()
    onEnded?.()
  }

  return (
    <>
      <video
        ref={videoRef}
        src={src}
        muted
        playsInline
        preload="auto"
        onEnded={handleEnded}
        onLoadedData={() => {
          if (active) {
            drawFrame()
            void videoRef.current?.play().catch(() => {})
          }
        }}
        className="pointer-events-none absolute -left-[9999px] h-px w-px opacity-0"
        aria-hidden="true"
      />
      <canvas ref={canvasRef} className={className} aria-hidden="true" />
    </>
  )
}
