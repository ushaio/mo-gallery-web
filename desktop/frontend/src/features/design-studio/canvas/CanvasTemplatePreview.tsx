import type { CanvasTemplateDocument } from './templates'

export function CanvasTemplatePreview({ template }: { template: CanvasTemplateDocument }) {
  const { canvas } = template
  return (
    <div className="flex h-full items-center justify-center p-5" style={{ backgroundColor: 'color-mix(in srgb, var(--muted) 65%, var(--background))' }}>
      <div
        className="relative max-h-full max-w-full overflow-hidden border shadow-sm"
        style={{
          aspectRatio: `${canvas.width} / ${canvas.height}`,
          width: canvas.width >= canvas.height ? '88%' : '58%',
          backgroundColor: canvas.background,
          borderColor: 'color-mix(in srgb, var(--foreground) 16%, transparent)',
        }}
      >
        {template.elements.map((element, index) => (
          <span
            key={element.id}
            className="absolute overflow-hidden border"
            style={{
              left: `${element.x / canvas.width * 100}%`,
              top: `${element.y / canvas.height * 100}%`,
              width: `${element.width / canvas.width * 100}%`,
              height: `${element.height / canvas.height * 100}%`,
              borderColor: canvas.background === '#101010' ? '#454545' : '#B9B7B0',
              backgroundColor: element.type === 'shape' ? element.fill : canvas.background === '#101010' ? '#292929' : index % 2 === 0 ? '#CAC8C1' : '#B8B6AF',
              borderRadius: element.type === 'image' ? `${Math.min(element.radius / canvas.width * 100, 1)}rem` : 0,
              transform: `rotate(${element.rotation}deg)`,
            }}
          >
            <span className="absolute inset-x-2 top-1/2 h-px opacity-30" style={{ backgroundColor: '#686868', transform: `rotate(${index % 2 === 0 ? -28 : 28}deg)` }} />
          </span>
        ))}
      </div>
    </div>
  )
}
