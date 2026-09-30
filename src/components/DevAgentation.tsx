'use client'

import dynamic from 'next/dynamic'

/**
 * Agentation：开发期的可视化反馈工具（点选/框选页面元素 → 自动记录选择器、CSS 类、
 * 位置与备注，导出 markdown 给 AI 编码 agent 定位代码）。
 *
 * 仅在 dev 环境挂载：生产构建里 NODE_ENV 已被替换为 'production'，组件直接返回 null，
 * 动态 import 的分包也不会被请求。工具条出现在页面右下角，点一下即进入反馈模式。
 */
const Agentation = dynamic(
  () => import('agentation').then((module) => module.Agentation),
  { ssr: false },
)

export default function DevAgentation() {
  if (process.env.NODE_ENV !== 'development') {
    return null
  }

  return <Agentation />
}
