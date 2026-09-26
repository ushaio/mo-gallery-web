/**
 * TipTap 编辑器 JSON 文档的最小类型投影（与 api-client `TiptapJsonContent`
 * 同构；此处独立定义以保持 content-core 不依赖 api-client）。
 *
 * 访客渲染必须消费 JSON 结构（@mo-gallery/public-site 的安全 React 渲染器），
 * 而不是 `dangerouslySetInnerHTML` HTML 字符串——多用户托管场景下 JSON 结构化
 * 渲染天然不执行任何宿主文档之外的标记。
 */
export interface TiptapJsonNode {
  type?: string
  attrs?: Record<string, unknown>
  content?: TiptapJsonNode[]
  marks?: Array<{
    type: string
    attrs?: Record<string, unknown>
  }>
  text?: string
  [key: string]: unknown
}
