/**
 * @mo-gallery/public-site — 个人访客站点共享组件包。
 *
 * 架构约束：数据、路由、媒体 URL 全部由宿主注入（adapters.ts），组件内部
 * 不出现宿主路径字面量、不内嵌数据获取（评论区提交/刷新是唯一例外，其
 * 鉴权仍完全由宿主适配器实现承担）。访客富文本渲染走共享净化管线：
 * milkdown → @mo-gallery/milkdown 的只读 Markdown 渲染器；tiptap →
 * TiptapJsonView 结构化 JSON 渲染，两者均不执行 HTML 字符串注入。
 *
 * 视觉主题：web 访客侧观感（Gallery Wall / Midnight Vernissage 令牌、
 * 语义字号/胶片滤镜/story 排版工具类）在 src/styles/web-theme.css，
 * 全部 scope 在 `.psw` 根类下；纯 CSS 资产经 package.json 的
 * `./theme.css` 导出，消费方以 `@import "@mo-gallery/public-site/theme.css"`
 * 引入并在访客子树包一层 `<div class="psw">`（详见 README）。
 */
export type {
  LinkAdapter,
  MediaUrlResolver,
  VisitorCommentInput,
  VisitorContentProvider,
} from './adapters'
export { resolveLabels, DEFAULT_PUBLIC_SITE_LABELS } from './labels'
export type { PublicSiteLabels } from './labels'

export { PhotoGrid } from './components/PhotoGrid'
export type { PhotoGridViewMode } from './components/PhotoGrid'
export { GridView, MasonryView, TimelineView } from './components/PhotoGrid'
export { PhotoCard } from './components/PhotoCard'
export { Lightbox } from './components/Lightbox'
export { SiteHeader } from './components/SiteHeader'
export { SiteFooter } from './components/SiteFooter'
export { AlbumList, AlbumDetail } from './components/AlbumView'
export { FilmRollList, FilmRollDetail } from './components/FilmRollView'
export { ArticleList } from './components/ArticleList'
export { ArticleView } from './components/ArticleView'
export { ArticleBody } from './components/ArticleBody'
export type { ArticleBodyProps } from './components/ArticleBody'
export { TiptapJsonView } from './components/TiptapJsonView'
export type { TiptapJsonViewProps } from './components/TiptapJsonView'
export { CommentsSection } from './components/CommentsSection'
