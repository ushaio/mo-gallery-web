'use client'

import { Loader2 } from 'lucide-react'

interface AdminLoadingProps {
  text?: string
  className?: string
}

export function AdminLoading({ text, className = '' }: AdminLoadingProps) {
  return (
    <div className={`flex-1 flex flex-col items-center justify-center gap-4 ${className}`}>
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
      {text && (
        <span className="text-xs font-mono uppercase tracking-widest text-muted-foreground animate-pulse">
          {text}
        </span>
      )}
    </div>
  )
}