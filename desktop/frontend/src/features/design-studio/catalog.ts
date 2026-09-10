import { BookOpen, Grid2X2, ImagePlus, Rows3, type LucideIcon } from 'lucide-react'

export type DesignKind = 'zine' | 'poster' | 'collage' | 'contact-sheet'

export interface DesignTool {
  id: DesignKind
  icon: LucideIcon
  titleKey: string
  descriptionKey: string
  available: boolean
  path?: string
  preview: 'editorial' | 'poster' | 'collage' | 'contact-sheet'
}

export const DESIGN_TOOLS: DesignTool[] = [
  {
    id: 'zine',
    icon: BookOpen,
    titleKey: 'admin.zine',
    descriptionKey: 'admin.design_tool_zine_description',
    available: true,
    path: '/design/zine',
    preview: 'editorial',
  },
  {
    id: 'poster',
    icon: ImagePlus,
    titleKey: 'admin.design_tool_poster',
    descriptionKey: 'admin.design_tool_poster_description',
    available: false,
    preview: 'poster',
  },
  {
    id: 'collage',
    icon: Grid2X2,
    titleKey: 'admin.design_tool_collage',
    descriptionKey: 'admin.design_tool_collage_description',
    available: true,
    path: '/design/canvas',
    preview: 'collage',
  },
  {
    id: 'contact-sheet',
    icon: Rows3,
    titleKey: 'admin.design_tool_contact_sheet',
    descriptionKey: 'admin.design_tool_contact_sheet_description',
    available: false,
    preview: 'contact-sheet',
  },
]
