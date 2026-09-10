import type { DesignTool } from './catalog'

function PhotoBlock({ className }: { className: string }) {
  return <span className={className} aria-hidden="true" />
}

export function ToolPreview({ variant }: { variant: DesignTool['preview'] }) {
  if (variant === 'poster') {
    return (
      <div className="flex h-full items-center justify-center bg-[#d9e5df]">
        <div className="relative h-[78%] w-[46%] border border-black/15 bg-[#f7f5ee] p-2">
          <PhotoBlock className="block h-[62%] bg-[#1f3934]" />
          <span className="mt-2 block h-1 w-3/4 bg-black/80" />
          <span className="mt-1 block h-1 w-1/2 bg-black/25" />
        </div>
      </div>
    )
  }

  if (variant === 'collage') {
    return (
      <div className="grid h-full grid-cols-3 grid-rows-2 gap-1 bg-[#eee9e2] p-4">
        <PhotoBlock className="col-span-2 bg-[#a6b5b3]" />
        <PhotoBlock className="bg-[#1e2930]" />
        <PhotoBlock className="bg-[#d1a178]" />
        <PhotoBlock className="col-span-2 bg-[#64706d]" />
      </div>
    )
  }

  if (variant === 'contact-sheet') {
    return (
      <div className="grid h-full grid-cols-4 gap-1 bg-[#ebe7df] p-4">
        {Array.from({ length: 12 }, (_, index) => (
          <PhotoBlock key={index} className={index % 3 === 0 ? 'bg-[#2f3c40]' : index % 3 === 1 ? 'bg-[#a8aaa2]' : 'bg-[#c8a783]'} />
        ))}
      </div>
    )
  }

  return (
    <div className="flex h-full items-center justify-center gap-1.5 bg-[#e9e5dc] p-5">
      <div className="flex h-[82%] w-[38%] flex-col bg-[#f9f7f1] p-2 shadow-sm">
        <PhotoBlock className="block flex-1 bg-[#6f7d78]" />
        <span className="mt-2 block h-1 w-3/4 bg-black/70" />
      </div>
      <div className="grid h-[82%] w-[38%] grid-rows-2 gap-1.5 bg-[#f9f7f1] p-2 shadow-sm">
        <PhotoBlock className="bg-[#b89f7e]" />
        <PhotoBlock className="bg-[#303b40]" />
      </div>
    </div>
  )
}
