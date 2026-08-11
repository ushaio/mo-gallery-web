export interface ZineViewOptions {
  showBleed: boolean
  showGuides: boolean
  snapToGuides: boolean
  showImageOutlines: boolean
}

export type ZineViewOptionKey = keyof ZineViewOptions

export const DEFAULT_ZINE_VIEW_OPTIONS: ZineViewOptions = {
  showBleed: true,
  showGuides: true,
  snapToGuides: true,
  showImageOutlines: false,
}
