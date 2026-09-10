import { getDesignServerUrl } from './design-canvas/remote'

export type OfficialAiSkill = { id: string; slug: string; name: string; description: string; instructions: string; coverImage: string; linkUrl?: string | null; platform?: { id: string; name: string; website?: string; iconUrl?: string } | null; author?: { id: string; username: string } | null; authorName?: string | null; referencePhotos: Array<{ id: string; title: string; imageUrl: string; thumbnailUrl: string }> }

export async function fetchOfficialAiCatalog(): Promise<{ skills: OfficialAiSkill[] }> {
  const response = await fetch(`${getDesignServerUrl()}/api/ai/catalog`)
  if (!response.ok) throw new Error(`官方 AI 目录加载失败（${response.status}）`)
  const body = await response.json() as { success?: boolean; data?: { skills?: OfficialAiSkill[] } }
  return { skills: Array.isArray(body.data?.skills) ? body.data.skills : [] }
}
