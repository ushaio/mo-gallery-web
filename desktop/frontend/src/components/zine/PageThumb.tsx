import { getSpreadSize } from '@/lib/zine/page-sizes'
import type { Spread, ZineProject } from '@/lib/zine/types'

interface PageThumbProps {
  project: ZineProject
  spread: Spread
}

const THUMB_WIDTH = 128

export function PageThumb({ project, spread }: PageThumbProps) {
  const { pageW, spreadW, spreadH } = getSpreadSize(project.pageSize, project.pageOrientation)
  const scale = THUMB_WIDTH / spreadW

  return (
    <div className="relative overflow-hidden rounded-sm bg-white shadow-sm" style={{ width: THUMB_WIDTH, height: spreadH * scale }}>
      <div className="absolute inset-y-0 w-px bg-zinc-300" style={{ left: pageW * scale }} />
      {spread.slots.map((slot) => (
        <div
          key={slot.id}
          className={slot.kind === 'image' ? 'absolute bg-zinc-200' : 'absolute bg-zinc-300'}
          style={{
            left: (slot.page === 'right' ? pageW + slot.x : slot.x) * scale,
            top: slot.y * scale,
            width: slot.w * scale,
            height: slot.h * scale,
            transform: `rotate(${slot.rotation}deg)`,
          }}
        />
      ))}
    </div>
  )
}
