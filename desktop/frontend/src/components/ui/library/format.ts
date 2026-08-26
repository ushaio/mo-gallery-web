/**
 * 资源库（云端 / 本地）共用的展示格式化。
 * 两端此前各自维护了同一份 formatBytes/formatDate 实现，导致同一个字段在两个
 * 资源库里可能出现不同的精度或占位符；这里作为唯一实现供两端复用。
 */

/** 缺失值占位符：两端信息栏、对话框统一使用。 */
export const LIBRARY_EMPTY_VALUE = '—'

/**
 * 文件大小：< 1KB 用整数字节，其余保留 1 位小数（GB 保留 2 位）。
 * 保持与两端原有实现完全一致的取整规则，避免既有截图/文案对不上。
 */
export function formatFileSize(value: number) {
  if (!Number.isFinite(value) || value < 0) return LIBRARY_EMPTY_VALUE
  if (value < 1024) return `${value} B`
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`
  return `${(value / 1024 ** 3).toFixed(2)} GB`
}

/**
 * 日期时间：云端传 ISO 字符串，本地 SQLite 传纳秒时间戳（number），
 * 两者统一按「年-月-日 时:分」展示，非法值回落到占位符。
 */
export function formatDateTime(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') return LIBRARY_EMPTY_VALUE
  const date = typeof value === 'number' ? new Date(value / 1e6) : new Date(value)
  if (Number.isNaN(date.getTime())) return LIBRARY_EMPTY_VALUE
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
