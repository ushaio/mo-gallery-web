'use client'

import React, { useRef, useEffect } from 'react'
import { Crepe } from '@milkdown/crepe'
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react'
import '@milkdown/crepe/theme/common/style.css'
import '@milkdown/crepe/theme/frame.css'

interface MilkdownViewerProps {
  content: string
  className?: string
}

// Inner viewer component that uses the useEditor hook
const CrepeViewerInner: React.FC<{
  content: string
}> = ({ content }) => {
  const crepeRef = useRef<Crepe | null>(null)

  useEditor((root) => {
    const crepe = new Crepe({
      root,
      defaultValue: content || '',
      // Disable all editing features for read-only mode
      features: {
        [Crepe.Feature.BlockEdit]: false,
        [Crepe.Feature.Toolbar]: false,
        [Crepe.Feature.LinkTooltip]: false,
        [Crepe.Feature.ImageBlock]: true, // Keep image rendering
        [Crepe.Feature.ListItem]: true, // Keep list rendering
        [Crepe.Feature.Table]: true, // Keep table rendering
        [Crepe.Feature.CodeMirror]: true, // Keep code highlighting
        [Crepe.Feature.Cursor]: false,
        [Crepe.Feature.Placeholder]: false,
      },
    })

    crepeRef.current = crepe

    // Create the editor and then make it read-only
    crepe.create().then(() => {
      // Make the editor read-only by setting contenteditable to false
      const editorElement = root.querySelector('.ProseMirror')
      if (editorElement) {
        editorElement.setAttribute('contenteditable', 'false')
      }
    })

    return crepe
  }, [content])

  return <Milkdown />
}

export const MilkdownViewer: React.FC<MilkdownViewerProps> = ({ content, className }) => {
  return (
    <div className={`milkdown-viewer ${className || ''}`}>
      <MilkdownProvider>
        <CrepeViewerInner content={content} />
      </MilkdownProvider>
    </div>
  )
}

export default MilkdownViewer