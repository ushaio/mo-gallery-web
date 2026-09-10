import type { ZineStarterTemplate } from './templates'

export function ZineStarterPreview({ variant }: { variant: ZineStarterTemplate['preview'] }) {
  const formatClass = variant === 'landscape'
    ? 'aspect-[1.42/1] w-[76%]'
    : variant === 'square'
      ? 'aspect-square w-[56%]'
      : 'aspect-[0.7/1] w-[46%]'

  return (
    <div className="flex h-full items-center justify-center bg-[#e7e4dc] p-4">
      <div className={`relative bg-[#faf9f4] shadow-sm ${formatClass}`}>
        {variant === 'custom' ? (
          <>
            <span className="absolute inset-3 border border-dashed border-black/25" />
            <span className="absolute left-1/2 top-1/2 h-px w-7 -translate-x-1/2 bg-black/35" />
            <span className="absolute left-1/2 top-1/2 h-7 w-px -translate-y-1/2 bg-black/35" />
          </>
        ) : (
          <>
            <span className="absolute inset-x-[9%] top-[8%] h-[58%] bg-[#34433f]" />
            <span className="absolute bottom-[22%] left-[9%] h-1 w-[56%] bg-black/75" />
            <span className="absolute bottom-[14%] left-[9%] h-1 w-[34%] bg-black/20" />
            <span className="absolute bottom-[7%] right-[9%] text-[7px] text-black/35">01</span>
          </>
        )}
      </div>
    </div>
  )
}
