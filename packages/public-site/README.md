# @mo-gallery/public-site

个人访客站点的共享组件包。唯一可编辑源头在 `mo-gallery-shared`，消费方（mo-gallery-web / mo-gallery-offical / emulsion-desktop）通过 `pnpm sync` 获得镜像。

## 架构约束

- **数据**：组件不内嵌数据获取。宿主实现 `VisitorContentProvider`（可选成员按能力实现：胶卷/评论/友链/器材）注入；领域契约见 `@mo-gallery/content-core` 的 `VisitorSiteReader`。唯一例外是 `CommentsSection`（提交/翻页需要组件内状态），其鉴权与作者身份解析仍完全由宿主适配器承担。
- **路由**：组件不出现宿主路径字面量，站内链接一律走 `LinkAdapter`（`home/gallery/album/article` 为冻结成员；`albumIndex/articleIndex/articleByKind/filmIndex/filmRoll/friends/gear` 为可选成员，缺席时对应导航项/链接自动隐藏或回落）。
- **媒体 URL**：私有/公开地址区分由 `MediaUrlResolver` 承担（Official 为 HMAC 签名 URL，Web 为静态/存储地址）。组件内部使用原生 `<img>`，不绑定宿主图片优化组件。
- **富文本净化**：多用户托管场景禁止 `dangerouslySetInnerHTML`。milkdown 正文走 `@mo-gallery/milkdown` 的只读 Markdown 渲染器（ReactMarkdown 管线）；tiptap 正文走 `TiptapJsonView` 结构化 JSON 渲染（未知节点/标记降级，`javascript:` 等协议拒绝）。宿主必须为 tiptap 文章提供 `tiptapContentJson`。
- **样式**：Tailwind 工具类 + 两侧消费方共有的语义 token（`background/muted/muted-foreground/border/primary`）；文案经 `PublicSiteLabels` 注入（`resolveLabels` 浅合并，默认中文）。
- **主题层**：`src/styles/web-theme.css`（见下节「web 主题层」）提供 web 访客侧（Gallery Wall / Midnight Vernissage）的视觉令牌与工具类，全部 scope 在 `.psw` 根类下。

## web 主题层（web-theme.css）

组件结构/行为与视觉解耦：不引入主题 CSS 时组件按宿主自身 token 渲染（默认观感）；要达到 **mo-gallery-web 访客侧观感**，消费方需两步：

1. **引入主题 CSS**（纯 CSS 资产，无法经 JS 入口导出）——在宿主全局样式里：

   ```css
   @import "@mo-gallery/public-site/theme.css";
   /* 或相对路径：@import "../../mo-gallery-shared/packages/public-site/src/styles/web-theme.css"; */
   ```

2. **scope 包裹**：在访客子树最外层包一层 `<div class="psw">`。主题层在该子树内重定义 web 的语义 token（亮色 Gallery Wall / 暗色 Midnight Vernissage，`.dark .psw` 或 `.psw.dark` 生效）、语义字号工具类（`text-ui-*` 等）、胶片滤镜（`film-grain-overlay`/`film-scanlines`/`film-vignette`）、滚动条工具类、`prose` 正文层与 `story-rich-content` 排版、以及入场 stagger 动画类 `psw-enter`——类名与 mo-gallery-web `globals.css` / `story-rich-content.css` 保持一致。

字体说明：web 经 next/font 注入 Cormorant Garamond（serif）与 Montserrat（sans）；主题层提供同名 font-family 栈，宿主需自行加载这两个字体以获得精确观感。

## 组件

| 组件 | 说明 |
| --- | --- |
| `SiteHeader` / `SiteFooter` | 站点导航壳（fixed + 毛玻璃 + 大写字距导航 + 下滚自动隐藏，可传 `fixed={false}` 退回文档流）/ 页脚（品牌区 + 链接分栏 + 版权条） |
| `PhotoGrid` | 照片网格，`viewMode: 'grid' \| 'masonry' \| 'timeline'`（masonry 为 CSS columns 实现，零运行时依赖；列数/gutter 对齐 web 规格） |
| `Lightbox` | 全屏灯箱（Esc/←/→ 键盘导航、EXIF 摘要、底部缩略图条 `thumbnails={false}` 可关、body 滚动锁 + 滚动条宽度补偿） |
| `AlbumList` / `AlbumDetail` | 相册列表（web AlbumCard 规格：hover 上浮 + 毛玻璃计数胶囊）/ 相册详情（内建灯箱） |
| `FilmRollList` / `FilmRollDetail` | 胶卷列表 / 单卷成帧视图（film 扫线 + 暗角质感） |
| `ArticleList` / `ArticleView` | 博客/故事列表（分页、入场 stagger） / 详情（净化正文渲染；可选 `coverUrl` 全屏封面 header、`sidebar` 12 栏 8+4 布局） |
| `CommentsSection` | 照片评论区（匿名只读；提交需宿主登录态，决策 D2；软圆角面板视觉） |

## 宿主接入（M2）

1. 实现 `VisitorContentProvider`（Official 侧对应 `/api/public/sites/:username` 的 `VisitorSiteReader` 实现，Web 侧对应自部署公开查询）；
2. 实现 `MediaUrlResolver` 与 `LinkAdapter`；
3. 页面层取数后传入组件；`Photos/Albums/FilmRolls` 的分页与灯箱开关状态由页面持有。
