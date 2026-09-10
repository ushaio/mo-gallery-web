import type { CanvasProject } from '@/lib/design-canvas/types'

export function CanvasProjectPreview({ project }: { project: CanvasProject }) {
  return (
    <div className="flex h-full items-center justify-center p-5" style={{ backgroundColor: 'color-mix(in srgb, var(--muted) 60%, var(--background))' }}>
      <div className="relative max-h-full max-w-full overflow-hidden border shadow-sm" style={{ aspectRatio: `${project.width} / ${project.height}`, width: project.width >= project.height ? '86%' : '56%', backgroundColor: project.background, borderColor: 'var(--border)' }}>
        {project.elements.map((element, index) => (
          <span
            key={element.id}
            className="absolute border"
            style={{
              left: `${element.x / project.width * 100}%`, top: `${element.y / project.height * 100}%`,
              width: `${element.width / project.width * 100}%`, height: `${element.height / project.height * 100}%`,
              transform: `rotate(${element.rotation}deg)`,
              borderColor: 'color-mix(in srgb, var(--foreground) 20%, transparent)',
              backgroundColor: element.type === 'shape' ? element.fill : index % 2 ? '#A8AAA8' : '#C0C1BE',
              borderRadius: element.type === 'image' ? `${element.radius / 30}px` : 0,
            }}
          />
        ))}
      </div>
    </div>
  )
}
