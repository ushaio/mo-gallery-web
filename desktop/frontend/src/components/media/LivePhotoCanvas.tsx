import { useEffect, useRef } from 'react'

interface Props {
  src: string
  active: boolean
  className?: string
  onEnded?: () => void
}

type FrameCallback = (now: DOMHighResTimeStamp) => void

/** 位图按 显示尺寸×DPR 绘制，DPR 封顶 2，避免高 DPI 屏幕上画布过大 */
const MAX_DPR = 2
/** 单次 drawImage 的缩放比超过该值时，先做渐进式减半（Photoshop/Sharp 缩略图做法） */
const MAX_STEP_RATIO = 2.5

export function LivePhotoCanvas({ src, active, className, onEnded }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const frameHandleRef = useRef<number | null>(null)
  const stagesRef = useRef<[HTMLCanvasElement, HTMLCanvasElement] | null>(null)

  const stopFrameLoop = () => {
    const video = videoRef.current
    const handle = frameHandleRef.current
    if (handle === null) return
    if (video?.cancelVideoFrameCallback) video.cancelVideoFrameCallback(handle)
    else cancelAnimationFrame(handle)
    frameHandleRef.current = null
  }

  const drawFrame = () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return
    const videoWidth = video.videoWidth
    const videoHeight = video.videoHeight
    if (!videoWidth || !videoHeight || !canvas.width || !canvas.height) return

    const context = canvas.getContext('2d')
    if (!context) return
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'

    // cover 裁切：canvas 没有 object-fit，按显示比例取源帧的居中区域
    const coverScale = Math.max(canvas.width / videoWidth, canvas.height / videoHeight)
    const srcWidth = Math.min(videoWidth, canvas.width / coverScale)
    const srcHeight = Math.min(videoHeight, canvas.height / coverScale)

    // 源到目标的缩放比过大时，先 ping-pong 逐级减半，让每一步
    // 缩放都落在双线性采样的可靠区间（≤2.5 倍），压掉高频锯齿
    let steps = 0
    for (let ratio = srcWidth / canvas.width; ratio > MAX_STEP_RATIO; ratio /= 2) {
      steps += 1
    }
    let source: CanvasImageSource = video
    let sourceWidth = videoWidth
    let sourceHeight = videoHeight
    if (steps > 0) {
      if (!stagesRef.current) {
        stagesRef.current = [document.createElement('canvas'), document.createElement('canvas')]
      }
      const stages = stagesRef.current
      let input: CanvasImageSource = video
      let inputWidth = videoWidth
      let inputHeight = videoHeight
      for (let index = 0; index < steps; index += 1) {
        const output = stages[index % 2]
        const outputWidth = Math.max(1, Math.floor(inputWidth / 2))
        const outputHeight = Math.max(1, Math.floor(inputHeight / 2))
        if (output.width !== outputWidth || output.height !== outputHeight) {
          output.width = outputWidth
          output.height = outputHeight
        }
        const outputContext = output.getContext('2d')
        if (!outputContext) return
        outputContext.imageSmoothingEnabled = true
        outputContext.imageSmoothingQuality = 'high'
        outputContext.drawImage(input, 0, 0, inputWidth, inputHeight, 0, 0, outputWidth, outputHeight)
        input = output
        inputWidth = outputWidth
        inputHeight = outputHeight
      }
      source = input
      sourceWidth = inputWidth
      sourceHeight = inputHeight
    }

    // 减半后源帧坐标与原始坐标相差 shrink 倍，cover 区域按比例换算（保持居中）
    const shrink = videoWidth / sourceWidth
    const finalSrcWidth = srcWidth / shrink
    const finalSrcHeight = srcHeight / shrink
    const sx = (sourceWidth - finalSrcWidth) / 2
    const sy = (sourceHeight - finalSrcHeight) / 2
    context.drawImage(source, sx, sy, finalSrcWidth, finalSrcHeight, 0, 0, canvas.width, canvas.height)
  }

  const startFrameLoop = () => {
    const video = videoRef.current
    if (!video || frameHandleRef.current !== null) return
    const tick: FrameCallback = () => {
      drawFrame()
      if (video.requestVideoFrameCallback) {
        frameHandleRef.current = video.requestVideoFrameCallback(tick)
      } else {
        frameHandleRef.current = requestAnimationFrame(tick)
      }
    }
    // 只在解码出新帧时绘制（视频约 30fps），替代 60fps 的 rAF 空转
    if (video.requestVideoFrameCallback) {
      frameHandleRef.current = video.requestVideoFrameCallback(tick)
    } else {
      frameHandleRef.current = requestAnimationFrame(tick)
    }
  }

  // 位图尺寸跟随瓦片显示尺寸（缩放滑块、窗口变化经 ResizeObserver 自动适配）
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const syncCanvasSize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
      const width = Math.max(1, Math.round(canvas.clientWidth * dpr))
      const height = Math.max(1, Math.round(canvas.clientHeight * dpr))
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }
      drawFrame()
    }
    syncCanvasSize()
    const observer = new ResizeObserver(syncCanvasSize)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [])

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
    startFrameLoop()

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
