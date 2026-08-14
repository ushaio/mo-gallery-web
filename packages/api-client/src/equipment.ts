import { apiRequestData } from './core'
import type { CameraDto, LensDto } from './types'

/**
 * 获取所有相机列表
 */
export async function getCameras(): Promise<CameraDto[]> {
  return apiRequestData<CameraDto[]>('/api/cameras')
}

/**
 * 获取所有镜头列表
 */
export async function getLenses(): Promise<LensDto[]> {
  return apiRequestData<LensDto[]>('/api/lenses')
}