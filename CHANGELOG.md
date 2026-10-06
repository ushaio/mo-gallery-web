# Changelog

本文件记录 **mo-gallery-web**（Web 画廊展示页 / Web 后台管理 / `/api/*` 后端）每个发布版本的更新日志；每个版本一个条目，包含 `feat`（新功能）与 `fix`（问题修复）两部分，条目使用有序列表。面向用户的版本说明见 `RELEASE.md`；桌面端安装包自 0.8.4 起改由 `ushaio/emulsion-desktop-v3` 仓库发布，移动端（`emulsion-app`）版本号由本仓库发版流水线逐步校验、必须与本文件顶部版本一致。

## 写法约定

1. 开发中的改动先写在文件顶部的 `[Unreleased]` 下；发布时把它改成 `## [0.8.4] - YYYY-MM-DD`，并在最上方新增一个空的 `## [Unreleased]`。
1. 条目按 Conventional Commits 归类：`feat:` 归 `feat`，`fix:` 归 `fix`；`refactor:` / `perf:` 等只有对用户可见时才归入对应部分。
2. 一条 = 一个用户可感知的变化；同一功能的多条提交合并成一条，不要直接照抄 commit message。
3. `feat` 与 `fix` 两部分始终保留；确实没有对应改动时写 `1. 暂无`。
4. 汇总一个发布窗口内的提交：`git log --no-merges --pretty='%s' <上一个版本 tag>..HEAD`。
5. 涉及 `/api/*` 或 `@mo-gallery/*` 共享包的改动，请标注对 Desktop / App 的影响。

> 本文件于 2026-09-18 启用，不回溯此前的历史。下面的 `[Unreleased]` 收录启用时仍在开发中（2026-09-15 起提交）的改动。

## [Unreleased]

### feat

1. 后台「照片叙事」列表按「今天 / 本周 / 本月 / 更早」分段展示（组头带名称、分隔线与条数），排序改为最近修改优先；素材库面板新增「全部 / 已使用 / 未使用」筛选，缩略图由两列改三列，封面 / 待传 / 失败 / 顺序改用胶囊角标，悬停操作改为右上角图标簇（不再铺满遮罩遮挡图片）
2. 后台「照片叙事」编辑页改为全出血版式：内容区去掉外壳内边距与列表栏间隙，编辑器与素材库左右无缝拼接；素材库标题栏高度（40px）与左侧编辑器工具栏严格对齐；编辑页顶栏（标题/操作栏）高度整体收紧（预览图与色卡行都不再画卡片底色 / 描边 / 圆角，直接落在信息栏背景上；仅前端展示层，对 Desktop / App 无影响）
3. 同步共享包镜像 `@mo-gallery/admin-console`：控制台外壳顶栏（页面标题栏）高度收紧（`--mgac-topbar-height` 52px → 44px、内边距 8px → 6px），平台后台（`offical /admin`）顶部标题栏随之降低（仅外壳样式，各面板数据与交互不变）
4. 后台 AI 对话页（`/admin/ai-assistant`）新增三项消息级能力：用户消息可「编辑」并重新发送（服务端在同一次 `generate` 请求里先把该条及其之后的全部消息删除，再用编辑后的内容重发，即回退到此处继续对话）；助手消息可「从此处分叉」——以该条为终点复制出一段新对话（继承来源的作用域与系统提示词，未完成的流式消息在分叉里落为「已停止」）并自动切换过去；消息操作行显示本轮 token 用量（用户行置于行首，助手行紧跟「从此处分叉」等按钮，不靠右：用户行「输入」，助手行「输出」+ 缓存命中百分比，鼠标悬浮给出输入 / 输出 / 缓存命中 / 推理 / 总计的精确值），流式过程中使用量到达即实时显示
5. 同步共享包镜像 `@mo-gallery/api-client`：`streamStoryAiGenerate` 真正接线 `usage` / `persisted` 两类 SSE 事件（此前 `StoryAiStreamHandlers` 声明了回调但实现从未触发，`onPersisted` 现在把落库后的 user / assistant 消息 id 直接交给调用方，替代「只有带图消息才回查」的兜底）；新增 `forkEditorAiConversation`，`EditorAiGenerateInput` / `EditorAiImageGenerateInput` 新增可选 `truncateFromMessageId`（桌面端编辑器 AI 走自有 Go 服务、不下发这两类事件与参数，行为不变）
6. 后台左侧菜单栏折叠时不再整块留白，改为在顶块中央显示站点名首字母（`MO GALLERY` → `M`，中文站名取首字），与底栏账号头像同口径；完整标题仍保留在 DOM 里（折叠时淡出），窄屏抽屉仍显示完整站点名（仅前端展示层，对 Desktop / App 无影响）
7. 后台素材库照片浏览区新增数字快捷键「6」切换精选：无多选时作用于右侧信息栏当前照片（直接取反），多选时按「全部已精选 ⇒ 取消，否则全部精选」批量切换——精选暂无批量端点，按小块并发调用单张更新接口（与桌面端云库策略一致）。照片模型没有星级字段，1–5 打星不适用于云端/后台（仅本地资源库支持）（仅前端展示层，对 Desktop / App 无影响）

8. 后台资源库右侧信息栏与照片详情面板的色卡改为紧贴预览图展示：资源库侧栏把色卡行紧贴预览图下方（原先在信息区末尾、「拍摄信息」之后），后台照片详情面板把色卡移到预览图带正下方、不再随信息区滚动（原先埋在详情列表末尾，且空色卡时也保留重新分析入口），前台照片详情弹窗的色卡同时提到信息列最前（原在文件信息之后）。资源库侧栏的色卡改为等分矩形色条：去掉色号文本、无圆角、铺满整行（不再左对齐，高度增至 32px）；每块色块可点击复制色值（复用信息栏既有的复制反馈）、鼠标悬浮时以浮标显示该色值（复制后短暂显示「已复制」）；三处都保留「点击色块复制色值」；「重新分析」入口暂时隐藏（服务端能力保留，前端开关 `SHOW_REANALYZE_COLORS` 置 true 即恢复）（仅前端展示层，对 Desktop / App 无影响）

9. 后台「照片叙事」素材库支持点击缩略图看大图：单击素材即全屏预览，可在当前筛选出的素材间左右翻页（← / → 键或按钮），保留原图 / 适配切换与 25%–500% 缩放；预览顶栏新增删除按钮（也可按 Del 键），删除即把该素材从本文素材列表移除并自动切到相邻素材；已在正文使用的素材仍先提示「请先从正文中移除」、不直接删除（仅前端展示层，对 Desktop / App 无影响）

10. 新增微信公众号绑定接口 `GET/POST/DELETE /api/wechat/binding`（仅站点管理员可用，普通用户一律拒绝）：提交公众号 AppID / AppSecret 后由服务端调用微信 `stable_token` 校验凭据，校验失败区分为「AppID 或 AppSecret 不正确」与「调用来源 IP 未加入公众号 IP 白名单」（后者把服务端当前出口 IP 一并回传，供用户复制进公众平台白名单）；**校验通过才落库**，绑定记录以 AES-256-GCM `enc:v1:` 密文写入 `Setting` 表 `wechat_binding`（AppSecret 永不回显、不写日志），同时尽力读取公众号名称与头像（未认证订阅号等无该接口权限时降级为「仅绑定」）；支持解绑。**出口 IP 以微信实际看到的为准**：微信在 40164（来源 IP 未加白）里会回带真实来源 IP，服务端把它连同观测时间记进 `Setting` 表内部键 `wechat_egress_observed`，GET 接口返回的绑定视图随之新增 `egressIpObserved` / `egressIpObservedAt` 并优先展示这一实测值；`WECHAT_EGRESS_IP` 降级为「还没被微信拒过一次时的自检兜底值」，未配置时查 ipify 并缓存 1 小时（失败缓存 5 分钟），页面上明确标注「仅供参考」。`wechat_binding` / `wechat_egress_observed` 两个内部键都不会经由通用设置接口透出。配套：后台「系统设置 → 账号」新增公众号绑定卡片（录入 / 展示 / 解绑 + 出口 IP 复制与白名单提示），桌面端「系统设置 → 账户」只展示绑定状态并可解绑（需 Desktop 重新生成 bindings 后可用），对 App 无影响。

11. 公众号绑定支持手动填写显示名称：新增 `PATCH /api/wechat/binding`（仅站点管理员可用），把管理员填写的名称写进 `wechat_binding` 同一条加密记录（不新增表 / 字段，传空串即清除手填名称）。原因是**个人主体**的公众号无法开通微信认证，微信 `cgi-bin/account/getaccountbasicinfo` 恒返回 48001，名称与头像在服务端永远取不到；后台卡片的名称随之改为可编辑，未填写名称时以脱敏 AppID 兜底显示为「公众号（wxab****cd12）」（桌面端展示层同步采用该兜底，无接口变更、不需要重新生成 bindings），对 App 无影响。

12. 新增微信公众号素材管理接口（仅站点管理员可用，全部由服务端代理，桌面端不再直连微信）：`GET /api/wechat/materials`（永久/临时素材列表，永久素材走 `batchget_material` 并支持 image / voice / video 分页）、`POST /api/wechat/materials`（multipart 上传，按类型校验扩展名与体积：图片 10MB、语音 2MB、视频 10MB）、`GET /api/wechat/materials/content`（取素材字节，以字节流回传并带 `Content-Disposition`，供预览与下载）、`DELETE /api/wechat/materials/:mediaId`（永久素材调 `del_material`）与 `GET /api/wechat/materials/capability`（调用 `get_materialcount` 做能力自检）。**临时素材没有列表接口**（官方文档在「获取永久素材列表」中明确临时素材取不到），且只有 3 天寿命，因此临时素材列表由服务端自建上传索引（`Setting` 表内部键 `wechat_temporary_materials`，过期后保留 7 天用于展示「已过期」），上传临时素材即入索引、删除仅移除索引记录（微信侧无法删除）；索引与绑定密文一样不经通用设置接口透出。能力自检不会因微信明确拒绝（如未认证订阅号常见的 48001）而报错，而是把 errcode 原样交给界面，便于区分「没有权限」与「网络不通」。对 App 无影响；桌面端资源库「公众号」来源由后续改动接入。
13. 公众号图文（草稿箱 / 发表记录）能力已就位，但**暂不启用**：后台「文章创作」的公众号页签暂未挂载，`GET /api/wechat/articles` 也默认关闭（`WECHAT_ARTICLES_ENABLED=1` 才开放），等有可联调的认证公众号再一起恢复；公众号素材管理不受影响，照旧可用。能力本身：草稿走 `cgi-bin/draft/batchget`、已发布走 `cgi-bin/freepublish/batchget`（单页上限 20 条、最多 3 页、`no_content=1`），拉回来的条目**下载进云端数据库**（新表 `WeChatArticle`，迁移 `20261005120000_wechat_articles`，按 `(appId, kind, itemId, position)` 唯一，一篇图文的多条 news_item 各占一行）。列表读这张表，只有首次进入、点同步或双击页签才访问微信；同步按行 upsert，只在这一轮确实取全时（含微信侧总数）才清理已不存在的条目（否则「没看到」只代表「还没翻到」），失败保留旧行不清空；分键带公众号 AppID，换绑后不串数据；缺少接口权限（未认证公众号常见的 48001）返回可照做的文案。界面组件（`WeChatArticleTab`，含「草稿 / 已发布」下拉筛选，与相邻子页签同一套写法）与客户端（`src/lib/wechat-articles.ts`）都保留在仓库里、标注了「暂未挂载」。**恢复步骤**：把门控 + 页签按钮 + 内容区加回 `/admin/logs/page.tsx`（改动形态即本条最初的实现），并在环境变量里设 `WECHAT_ARTICLES_ENABLED=1`；表与迁移无需改动。对 App 无影响。

### fix

1. 安全修复：访客故事/博客旧 HTML 回退渲染增加严格 allowlist 净化，阻断持久化 XSS；登录限速、评论与媒体来源 IP 统一仅信任配置的反向代理 Header；远程图片读取统一阻断内网目标、DNS rebinding 和不受限重定向；升级 Next.js/Hono/Sharp 及 Prisma 相关传递依赖（仅 Web/API 行为增强，对 Desktop / App 接口契约无破坏性变更）
2. 首页装饰图标由通用的星芒（Sparkles）换为影像主题图标——Hero 用光圈（Aperture）、「关于画廊」区块用相机（Camera），与画廊定位一致（仅前端展示层，对 Desktop / App 无影响）
3. 页脚社交链接的图标槽位固定为 16px，`SOCIAL_LINKS` 里写错或写了 Iconify 不存在的图标名时不再让该行文字左移错位（原先抖音项因 `ri:douyin-fill` 不存在而渲染成 0 宽空白，文字比其他行左移 16px）；`.env.example` 的抖音示例改为有效的 `ri:tiktok-fill` 并补充图标名校验说明
4. 修复服务端渲染出错（如首页数据库查询失败）时控制台刷出的 `Encountered a script tag while rendering React component` 警告：防闪烁的主题预置脚本改为通过 `useServerInsertedHTML` 以原始 HTML 注入 `<head>`，不再作为 React 元素参与客户端渲染（首屏主题判定与切换行为不变，仅前端展示层，对 Desktop / App 无影响）
5. 后台 `/admin` 外壳（左栏 / 顶栏 / 内容区）整体对齐官网 `/console` 的个人画廊后台（`/console` 用的就是 web 迁移共享外壳前的侧栏 / 顶栏形态）：左栏栏宽 248px → 256px、折叠宽 76px → 80px，栏内去掉内边距，导航区 `p-4` + 导航项 `px-4 py-3` 直角块，标签 13px 大写粗体 + `tracking-widest` 且行高与字号成对（项高 41.33px）、未选中灰字 / 悬停浅底 / 选中实心主色（图标跟随文字色），折叠态导航项左对齐、底栏缩进与按钮宽度（主题 / 语言 / 退出）逐项一致，底栏纯文字标签折叠时收宽保留行高（底栏总高不再少 15px）；顶部站点标题块与顶栏统一到 56px（`--mgac-topbar-height` 宿主覆盖，共享默认 44px 只作用于平台后台）且分隔线严格齐平，顶栏左右内边距 24px、去掉共享外壳新增的用户胶囊（原 web 顶栏只有页面标题 + 查看站点），折叠入口换回左栏右缘垂直居中的浮动胶囊（随折叠态在 256px / 80px 间移动）；外壳画布改实白（`--mgac-bg`）、基准字号 16px、内容区留白 32px（原 `p-8`）、正文 / 边框 / 次级文字色改走 web 自己的 `--foreground` / `--border` / `--muted-foreground` —— 这几项共享外壳的默认值都是平台后台档位（灰玻璃画布、22px、14px、#1d1d1f、rgba 边框），与 web 原后台（= 官网 `/console`）不同。仅前端外壳展示层，各面板数据与交互不变，对 Desktop / App 无影响

6. 修复后台外壳（左栏 / 顶栏 / 面板）中文字形比前台页面偏细：共享外壳把根字族写成 `var(--font-sans)`，而 web 的 `--font-sans`（next/font 变量）只有 `Montserrat, "Montserrat Fallback"`、缺通用兜底，中文因此掉到浏览器「最后兜底」字体；现外壳字族末尾一律补 `ui-sans-serif, system-ui, sans-serif`，与 body / 前台页面 / 官网 `/console` 同口径（同一段文字的墨迹覆盖率由 28.2% 回到 33.9%，与 `/console` 逐像素一致；仅字形回落修正，字号 / 字重 / 行距 / 排版不变，对 Desktop / App 无影响）

7. 后台上传页（`/admin/upload`）改为全出血工作区，页头「数字影像 / 胶卷」Tab 条对齐文章创作页（`/admin/logs`）的子标签栏：`AdminButton adminVariant="tab"`（`px-6 py-4`、`text-xs font-bold uppercase tracking-[0.2em]`，选中态走 data-state）、贴顶栏、满宽分隔线；下方内容区改为独立滚动并保留 `px-8 pb-8 pt-6` 留白（仅外壳 / 页头展示层，面板数据与交互不变，对 Desktop / App 无影响）

8. 后台上传页（`/admin/upload`）的「胶卷」参数归入「胶卷」Tab：数码影像 Tab 下不再显示一块禁用状态的胶卷选择框（原先显示灰字「请先选择胶片类型」），胶卷选择只在切到胶卷 Tab 后出现，与 Desktop 上传页「Film Roll - only in film mode」同口径（仅左侧参数面板的显隐，上传行为不变，对 Desktop / App 无影响）

9. 后台 AI 对话页（`/admin/ai-assistant`）整体回到产品自己的「编辑部工作台」语言，不再是一套游离在 `DESIGN.md` 之外的聊天气泡皮肤：
   - 去掉琥珀色 AI 强调色、渐变、光晕与外阴影，强调色统一走 `--primary`（浅色=墨黑、深色=夜间金），边线走 `--border` 发丝线，容器改直角（`--radius: 0`），与外壳 / 其余后台面板同一套纸墨令牌
   - 对话区改为「手稿页栏」版式：AI 回复不再包在气泡里，而是贴着一条纵向发丝线成正文栏（栏顶是 `AI` 条目名）；用户发言改为右侧的旁注块（2px 主色左边线 + 浅底），是页面唯一的重音，不再与 AI 回复左右对称
   - 空状态去掉光晕图章与 01/02/03 装饰序号（这三条建议并非时序，编号属装饰），改为衬线标题 + ≤46ch 引导语 + 发丝线分隔的三行建议；对话列表去掉序号，选中态改左侧主色竖条，日期 / 来源徽标一并提到可读字号
   - 全面抬高被压到 10px / 20% 透明度的微文字（标签、时间、提示、输入区工具条与模型选择器统一到 11–13px 且不低于 `muted-foreground`），满足设计系统对目录式标签的可读下限；发送 / 停止 / 保存等按钮改实心主色或发丝线描边
   - 去掉每条消息的逐一淡入与错峰入场（仅保留面板展开、流式光标与滚动跟随），遵守 `prefers-reduced-motion`
   - 页面改为全出血工作区（与图库 / 存储整理 / 日志同口径）：内容区去掉外壳 32px 内边距，对话栏与输入区直接贴左栏与顶栏、满宽分隔线，不再有包住整页的边框与圆角（仅前端展示层，各接口调用与数据不变，对 Desktop / App 无影响）
   - 「系统提示词」由页头下方推开的窄条面板（3 行输入框，长提示词看不全）改为从工作区右缘滑出的抽屉：416px 通高、衬线标题 + ✕，点击遮罩或按 Esc 关闭，编辑器满高展示完整提示词并在底部提供「恢复默认 / 保存」；打开时输入框直接载入当前生效的提示词（未自定义时为共享包 `@mo-gallery/ai-agent` 的内置默认文案，与真正发给模型的文案同源），可直接在其上二次修改，清空后保存则恢复默认（与内置默认逐字相同的文本按未自定义处理，页头不会点亮无意义的自定义标记）；页头入口保留自定义提示词的圆点指示（仅前端展示层，保存 / 重置接口不变，对 Desktop / App 无影响）；抽屉的遮罩与面板各自补上 `AnimatePresence` 所需的 key（此前两个子节点都没有 key，React 会以空 key 判为重复并在控制台报 `Encountered two children with the same key`）

9. 后台上传页（`/admin/upload`）左侧参数面板的顶部间距改为与右栏拖放区齐平（同为 Tab 栏下方 24px）：面板原先被「网格 `pt-6` + 吸顶 `top-6`」双重下沉而低 24px，且面板较矮的数码影像 Tab 多出这 24px、面板较高（多一个胶卷字段）的胶卷 Tab 却没有，同一页两个 Tab 的顶部间距不一致（实测 48px vs 24px）；现将吸顶偏移归零，两个 Tab 的面板顶端一致、与右栏齐平，滚动时仍吸附在同一位置（与 Desktop 上传页 `sticky top-0` + 网格 `p-6` 同口径；仅前端展示层，对 Desktop / App 无影响）

10. 后台上传页（`/admin/upload`）与文章创作页（`/admin/logs`）的子标签栏去掉与下方内容区之间的满宽分隔线（`border-b border-border`）：Tab 条与内容区连成一体，仅保留选中 Tab 自身的主色下划线；官网 `/console/upload`、`/console/logs` 同步（仅外壳展示层，面板数据与交互不变，对 Desktop / App 无影响）

11. 后台上传页（`/admin/upload`）左侧参数面板删掉「上传参数」小标题行（齿轮图标 + 灰字）：面板现在直接从「照片标题」开始，第一行与右栏拖放区顶端齐平（同为 Tab 栏下方 24px），数码影像 / 胶卷两个 Tab 一致（仅前端展示层，对 Desktop / App 无影响）

12. 文章创作页（`/admin/logs`）「照片叙事」列表的搜索 / 筛选工具栏去掉与下方列表之间的满宽分隔线（`border-b border-border`）：工具栏与列表连成一体，与子标签栏同一口径；官网 `/console/logs` 的同一列表同步（仅展示层，列表数据与交互不变，对 Desktop / App 无影响）

13. 后台「友链管理」页（`/admin/friends`）去掉页面头部重复的标题块（`Users` 图标 + 「友链管理」标题 + 「N items」计数，页面标题已由顶栏渲染），并去掉头部与下方列表之间的满宽分隔线（`border-b border-border`），「添加友链」按钮仍靠右；官网对应管理页「评论管理」（`/console/comments`）同步删除重复的「评论管理」标题与同一条分隔线（状态筛选与刷新按钮保留）（仅展示层，列表数据与交互不变，对 Desktop / App 无影响）
14. 后台资源库照片信息侧栏（`/admin/library` 选中照片后）的标题改为独占一行：原先「标题 + 类型章 + 精选/可见按钮」同处一条 `flex justify-between`，长文件名（如纯数字命名）会被右侧图标簇挤压；现标题单独一行占满宽度，「类型章 + 标签 + 胶卷」与「精选 / 可见」图标移到下一行（标签靠左、图标靠右）。官网 `/console/library` 的照片信息侧栏同步（仅展示层，数据与交互不变，对 Desktop / App 无影响）

15. 文章创作页（`/admin/logs`）列表与搜索 / 筛选行之间的间距统一为 24px，与子标签栏到内容区的间距（`pt-6`）一致：「照片叙事」工具栏已无分隔线却仍留 `pb-4`，与 32px 间距叠加后搜索框到列表实测 50px（标签栏到内容区仅 26px），现去掉该底内边距、间距改 `gap-6`；「博客」列表的工具栏保留 `border-b` + `pb-4`（分隔线之上需要留白），间隔由 32px 收到 24px，与「草稿」页同一口径；官网 `/console/logs` 同步（仅展示层，列表数据与交互不变，对 Desktop / App 无影响）

16. 修正 `AI_MODEL_CONTEXT_WINDOWS` 的写法说明：该值是 JSON 对象且**必须写在同一行**，`.env` / `.env.example` 原先把 `{` 与 `}` 换行写会被 dotenv 只解析成 `{"`，导致 `JSON.parse` 失败并抛 `AI_MODEL_CONTEXT_WINDOWS must be a valid JSON object`（后果是 AI 编辑器整体不可用）；`.env.example` 改为单行默认值 `{}` 并补上键名需与 `${AI_BASE_URL}/models` 返回的 id 完全一致、未命中回退 8192 的说明，README 环境变量表同步（仅配置示例与文档，运行时代码不变，对 Desktop / App 无影响）
17. 后台 AI 对话页（`/admin/ai-assistant`）的引导页（「我是你的叙事写作助手…」+「试试这样开头」三条起手式）原先只在**未选中任何对话**时才出现，新建对话后进入的空白对话反而是一片空区：现在改为跟随「当前对话没有消息」判定（与桌面端同页的口径一致），点「新对话」、或对既有对话执行「清空对话」后都会回到引导页；同时页头的「系统提示词」入口改为**常驻**（初始进入页面、还没选中对话时也能直接打开），在这种无会话状态下点击会先自动建一个会话作为提示词的归属（等同点一次「新对话」，随后可在抽屉里「恢复默认 / 保存」），「清空对话」仍只在对话有内容时出现（仅前端展示与入口条件，接口与数据不变，对 Desktop / App 无影响）

18. 后台 `/admin` 左栏底栏折叠态的最后三处偏差对齐官网 `/console`（含「语言切换」与「退出」两个按钮）：
   - 「退出」按钮折叠后不再是一片空白 —— 折叠态的 `px-0` 与同一元素上的 `px-4` / `px-6`（`size="lg"`）同权重，胜负只看 Tailwind 的生成顺序，实测 `px-0` 压不过，于是 55px 宽的折叠栏里按钮仍留 24px 横向内边距、内容区只剩 6px，16px 的退出图标被 flex 压成 0 宽（实测 `svg` 宽 0，现为 16px）；
   - 「语言切换」按钮折叠后不再变成空框：标签由 `.mgac-rail-foot-text`（折叠即收宽透明）改回裸文本，与 `/console` 一致（折叠态显示 EN / ZH）；
   - 账号行折叠时去掉 `gap-3` 与 `px-2`，头像回到 32×32 正方形（原先被挤成 27.43×32 的长方形）；
   - 折叠态类名统一改回 `md:` 变体（`md:w-full md:justify-center md:px-0` / `md:flex-col`），与 `/console`、与迁移共享外壳前的自建 `AdminSidebar` 逐字同款；退出按钮补上折叠态的 `title` 提示（原先只有 `aria-label`，鼠标悬浮无提示）；顺带删掉折叠态下永远被 `space-y-3` 压过的 `space-y-2`。仅前端外壳展示层，折叠 / 展开与展开态的底栏观感不变，对 Desktop / App 无影响

19. 后台资源库（`/admin/library`）左栏的「标签」筛选由「一条标签独占一行」改为桌面端同款的密集胶囊云：原先每条标签都是整行项（`px-2.5 py-2` + 15px 标签图标，约 330px / 10 条），标签一多就占满 238px 左栏的高度、要看下方「相册」分组必须先滚动；现改为 `flex-wrap` 自动换行的圆角胶囊（`rounded-full` + `px-2 py-0.5` + 11px 字号，去掉条目标图标），选中项为主色淡底 + 主色描边 + 主色文字，未选中项为浅底细描边并在悬停时提亮，长标签仍省略号截断（`title` 悬浮看全名，`aria-pressed` 保留给读屏），同样 10 条标签现在只占三行左右（仅前端展示层，标签数据与筛选交互不变）。官网 `/console/library` 同步（仅展示层，对 Desktop / App 无影响）

20. 同步共享包镜像 `@mo-gallery/milkdown`：正文（叙事 / 博客的编辑器与只读渲染）里的图片卡宽度改为贴住图片自身 —— 窄图 / 竖图不再被拉满整栏、在两侧留出一块空的卡片容器，小图也不再被放大，拼图列宽与 4:3 裁切、链接 / 文件 / 播放器卡、带显式 `width` 属性的图片一律不变；选中节点不再由 Crepe 主题给整栏铺一层选中底色，选中反馈只留卡片本体那圈描边（由 mo-gallery-shared `pnpm sync` 生成，接口与数据不变，对 Desktop / App 无影响）。

21. 修正微信公众号绑定在「调用来源 IP 未加白」（微信 40164）时的报错文案：此前回显的是本服务端自检得到的出口 IP（`WECHAT_EGRESS_IP` 或 ipify 查询结果），一旦服务端存在国内外分流 / 代理 / 多出口 NAT，自检 IP 与微信实际看到的来源 IP 不一致，用户照文案把错的 IP 加进白名单后会反复失败而看不出原因；现改为解析微信 `errmsg` 中的 `invalid ip <IP>`（兼容 `invalid ip 1.2.3.4, not in whitelist` 与 `invalid ip 8.149.x.x ipv6 ::ffff:8.149.x.x, not in whitelist rid: …` 两种格式，会自动剥掉 IPv4-mapped 前缀）并**回显微信实际看到的 IP**，两者不一致时另加一句「以微信返回的 IP 为准，并核对 `WECHAT_EGRESS_IP` 是否配错」；同时把公众平台菜单路径更正为「设置与开发 → 基本配置 → IP白名单」，并在 `stable_token` 返回错误时把原始 errcode / errmsg 记入服务端日志便于排查（仅报错文案与日志，绑定流程、接口契约与数据不变，对 Desktop / App 无影响）

22. 修复微信公众号素材的图片缩略图取不出来：微信下载素材时可能**完全不返回 `Content-Type`**（实测永久图片 `material/get_material` 只回 `Content-Disposition` 与 `Content-Length`，字节本身是标准 JPEG），服务端此前一律兜成 `application/octet-stream` 透传，桌面端要 `image/*` 才肯转 data URL，于是所有图片素材都被画成了类型图标。现在响应头给不出具体类型时按字节魔数（JPEG / PNG / GIF / BMP / WEBP）或素材类型兜底 MIME，文件名继续沿用微信 `Content-Disposition` 给的名字（服务端 `decorateContent` 同时收敛 MIME 与扩展名）。仅 MIME 判定，素材列表 / 上传 / 删除行为与接口契约不变，对 App 无影响
23. 同步共享包镜像 `@mo-gallery/milkdown`：图片卡的节点外层也收窄到图片宽度——上一条只收了卡片本体，外层仍占满整栏，整栏都是一个「看不见的媒体块」，按元素框量出来（选中、悬浮层、视觉标注工具）都对不上图片；现在有真实图片的图片卡与待上传预览卡连外层一起跟着图片走。拼图、播放器、链接 / 文件卡、无图占位卡与带显式 `width` 属性的图片不变；窄图右侧那片空白不再属于卡片的框（点选命中范围＝卡片本体；拖拽合并的落点按「行带」放宽，卡片本体与同一行右侧那片空白都算落在这张卡上）（由 mo-gallery-shared `pnpm sync` 生成，接口与数据不变，对 Desktop / App 无影响）。
24. 同步共享包镜像 `@mo-gallery/milkdown`：正文里的 `<br>` 词元按硬换行 / 空段落渲染 —— 后台预览、故事与博客详情页此前把它显示成字面文本「<br />」（它是 Milkdown 的空段落方言：编辑器把空行存成独占一行的 `<br />`、解析回来又是空段落，编辑器因而看着正常，只读渲染器不开 rehype-raw 就按原文输出）；现在独占一行的渲染成空段落，混在段落里的行内 `<br />` 与被转义过的 `&lt;br /&gt;` 也一并认，代码块与行内代码里的 `<br />` 不动（由 mo-gallery-shared `pnpm sync` 生成，接口与数据不变，对 Desktop / App 无影响）。
25. 同步共享包镜像 `@mo-gallery/milkdown` / `@mo-gallery/tiptap-editor`：「复制为公众号文章」现在能保住拼图（并排图片）的排版 —— 公众号编辑器会丢掉 class 与外部 CSS，此前几格粘过去各自成行；只把排版折算成内联样式仍不够（编辑器还会吞掉外层 `div` 上的 `display:grid`），因此拼图改为**表格**结构（列数沿用 `galleryColumns`、格宽用 `td` 百分比、间隙用 `td` 的 `padding`、多出来的另起一行），`src/lib/wechat-article.ts` 的格式化选项带上这个收尾钩子（故事详情页与叙事编辑器的复制入口都走它）。公众号里不保留页面上的 4:3 铺满裁切（编辑器不支持 `aspect-ratio` / `object-fit`），图片按原图比例、同一行顶端对齐（由 mo-gallery-shared `pnpm sync` 生成，接口与数据不变，对 Desktop / App 无影响）。

## [0.8.4] - 2026-09-30

### feat
1. 服务端图片处理管线（EXIF / 主色 / 缩略图 / 压缩，原 `server/lib/{exif,colors,image-processing}.ts`）迁移至共享包 `@mo-gallery/image-pipeline`，上传行为不变

2. 存储源支持 `vendor` 标识（Prisma schema 迁移 + 接口重构 + 设置页展示）（`e3489d96`）
3. 公共故事编辑同步 `milkdown` 占位卡预览镜像，存储源 `vendor` 支持按类型缺省推导（`07b4dfad`）
4. 照片分类统一更名为标签（API 与后台 UI 全量对齐）（`b5052e9a`）
5. 采用 shared 包镜像同步机制（`276ecd48`）
6. 图库访客渲染组件接入共享包 `@mo-gallery/public-site`（mo-cloud-parity-plan W1）：网格视图与照片卡片（含虚拟化瀑布流内的卡片）改由共享组件渲染，新增 `src/lib/public-site.ts` 宿主适配器（照片 DTO ↔ 访客领域模型映射、媒体 URL/CDN 解析、站内路由注入）；照片卡片新增主色渐变占位与加载渐显，视图切换 / 分页 / 灯箱行为不变（仅前端渲染层，对 Desktop / App 无影响）
7. 故事 / 博客详情页正文渲染接入共享包 `@mo-gallery/public-site`（mo-cloud-parity-plan W1）：milkdown 正文与携带 `tiptapContentJson` 的 TipTap 正文改由共享 `ArticleBody`（`TiptapJsonView` 结构化渲染，不注入 HTML 字符串）渲染，正文内嵌照片点击、媒体 embed 卡（Spotify / 网易云）与故事引用卡在访客侧保留；仅存量无 JSON 的 TipTap 正文回落本地既有富文本管线，页面框架（封面、地图、照片画廊、评论）不变（仅前端渲染层，对 Desktop / App 无影响）
8. 同步共享包镜像：`@mo-gallery/public-site` 新增 `./theme.css` 主题层导出（`.psw` 作用域令牌与访客侧观感）与导航组合能力（`LinkAdapter` 可选 `about`、`SiteHeader` 新增 `showHomeNav`/`currentPath`/`transparentAtTop`），`@mo-gallery/api-client` 新增 `mo-cloud` 子模块；本仓库暂未消费新增能力，现有页面行为不变（镜像同步，对 Desktop / App 无影响）
9. 后台 `/admin` 外壳接入共享包 `@mo-gallery/admin-console`：侧栏（导航项、站点标题、主题/语言切换、退出登录）与顶栏（当前页面标题、返回站点、移动端抽屉）改由共享 `ConsoleShell` 渲染，菜单项与图库 / 上传 / 日志 / AI 助手 / 存储整理 / 设置 / 友链各面板的数据与交互不变（仅前端外壳层，对 Desktop / App 无影响）
10. 后台的单条删除确认弹窗改由共享包 `@mo-gallery/admin-console` 的 `ConsoleConfirmDialog` 渲染（`SimpleDeleteDialog` 变薄包装，对外 props 不变，22 处调用点零改动）：删除确认的观感与交互（Esc/Enter、遮罩、提交中禁用与 spinner、portal 挂载）两端统一，文案与删除动作仍由本仓库提供（对 Desktop / App 无影响）
11. 后台的多选/批量删除确认弹窗（`DeleteConfirmDialog`）与「照片已挂叙事」阻断态改用共享包 `@mo-gallery/admin-console` 的 `ConsoleConfirmDialog` / `ConsoleModal` 渲染：加载态、阻断态（关联故事清单仍可点进编辑器）、普通删除态（删除原图/缩略图两个选项继续生效）三态语义与对外 props 不变，自绘勾选动画与 framer-motion 依赖移除，观感与两端统一（对 Desktop / App 无影响）
12. 后台其余 5 个弹窗外壳统一到共享包 `@mo-gallery/admin-console`：URL 更新确认（`ConsoleConfirmDialog`，「更新照片地址 / 仅保存配置」合并为受控勾选 + 动态按钮文案）、重复照片提示、草稿恢复、上传设置、批量整理（后四者用 `ConsoleModal`，表单与业务逻辑原样保留）；这 5 个文件里的自绘遮罩/面板/头部、`createPortal` 与 framer-motion 全部移除，提交中三处关闭入口（✕/Esc/遮罩）统一被 `busy` 屏蔽（对 Desktop / App 无影响）

### fix
1. 暂无

2. 修复 Vercel 类型检查失败：依赖 `@mo-gallery/*` 升级至 v0.1.1（现已随镜像同步升级到 v0.1.2）（`2d3087af`）
