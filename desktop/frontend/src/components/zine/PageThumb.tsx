import { useEffect, useState } from 'react'
import { ImageOff } from 'lucide-react'

import { getProjectSpreadSize } from '@/lib/zine/page-sizes'
import { getZineAssetImageSource } from '@/lib/zine/slot-render'
import type { Spread, ZineProject } from '@/lib/zine/types'

interface PageThumbProps {
  project: ZineProject
  spread: Spread
  width?: number
}

function PageThumbImage({ src }: { src: string }) {
  const [failed, setFailed] = useState(false)

  useEffect(() => setFailed(false), [src])

  if (failed) {
    return (
      <span className="flex h-full w-full items-center justify-center bg-zinc-200 text-zinc-400" aria-hidden>
        <ImageOff size={12} strokeWidth={1.5} />
      </span>
    )
  }

  return <img src={src} alt="" className="h-full w-full object-cover" draggable={false} loading="lazy" onError={() => setFailed(true)} />
}

export function PageThumb({ project, spread, width = 128 }: PageThumbProps) {
  const { pageW, spreadW, spreadH } = getProjectSpreadSize(project)
  const scale = width / spreadW

  return (
    <div className="relative overflow-hidden bg-white shadow-sm ring-1 ring-black/10" style={{ width, height: spreadH * scale }}>
      <div className="absolute inset-y-0 z-10 w-px bg-zinc-300/80" style={{ left: pageW * scale }} />
      {spread.slots.map((slot) => {
        const style = {
          left: slot.x * scale,
          top: slot.y * scale,
          width: slot.w * scale,
          height: slot.h * scale,
          transform: `rotate(${slot.rotation}deg)`,
        }

        if (slot.kind === 'text') {
          return (
            <div
              key={slot.id}
              className="absolute"
              style={{
                ...style,
                backgroundImage: 'repeating-linear-gradient(to bottom, rgba(17,17,17,0.28) 0 1px, transparent 1px 4px)',
                backgroundSize: '85% 100%',
                backgroundRepeat: 'no-repeat',
              }}
            />
          )
        }

        const src = getZineAssetImageSource(project.assets.find((asset) => asset.id === slot.assetId), 'preview')

        return (
          <div key={slot.id} className="absolute overflow-hidden bg-zinc-200" style={style}>
            {src ? <PageThumbImage src={src} /> : null}
          </div>
        )
      })}
    </div>
  )
}
