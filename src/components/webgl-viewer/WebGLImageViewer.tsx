import * as React from 'react'
import { useRef } from 'react'
import type { WebGLImageViewerProps, WebGLImageViewerRef } from './types/interface'

// WebGL 功能暂时禁用，使用简单实现
class WebGLImageViewerEngine {
  constructor() {
    // 空构造函数
  }
}

export const WebGLImageViewer = ({
  ref,
  src,
  className = '',
  onZoomChange,
  onImageCopied,
  onLoadingStateChange,
  debug = false,
  ...divProps
}: WebGLImageViewerProps &
  Omit<React.HTMLAttributes<HTMLDivElement>, 'className'> & {
    ref?: React.RefObject<WebGLImageViewerRef | null>
  }) => {
  const viewerRef = useRef<WebGLImageViewerEngine | null>(null)

  // WebGL 功能已禁用，返回空组件
  return (
    <div
      className={`flex items-center justify-center bg-muted ${className}`}
      {...divProps}
    >
      <div className="text-muted-foreground text-sm">
        WebGL viewer temporarily disabled
      </div>
    </div>
  )
}

export type { WebGLImageViewerProps, WebGLImageViewerRef } from './types/interface'