# Release Notes

## v1.x.x (2026-01-03)

### 🔒 安全增强 / Security Enhancement

#### 照片删除保护 / Photo Deletion Protection

**中文说明：**
- 新增照片删除前的叙事关联校验功能
- 如果照片已关联到叙事（Story），将无法直接删除
- 删除确认对话框会显示关联的叙事列表
- 用户需要先从叙事中移除这些照片，然后再删除

**English Description:**
- Added photo deletion validation for story associations
- Photos associated with stories cannot be deleted directly
- Delete confirmation dialog displays a list of associated stories
- Users must remove photos from stories before deletion

### 📝 变更详情 / Changes

#### 后端 API / Backend API
- 新增 `GET /api/admin/photos/:id/stories` - 查询单张照片关联的叙事
- 新增 `POST /api/admin/photos/check-stories` - 批量检查多张照片的叙事关联
- 修改 `DELETE /api/admin/photos/:id` - 删除前检查叙事关联，如有关联返回错误

#### 前端 / Frontend
- 修改删除确认对话框，支持显示关联叙事警告
- 添加加载状态显示
- 如果有关联叙事，仅显示取消按钮，阻止删除操作

#### 国际化 / i18n
- 添加中英文提示文本支持

### 🛠 技术细节 / Technical Details

**修改的文件：**
- `hono/photos.ts` - 后端 API 逻辑
- `src/lib/api.ts` - 前端 API 调用
- `src/components/admin/DeleteConfirmDialog.tsx` - 删除确认对话框组件
- `src/app/admin/layout.tsx` - 管理后台布局逻辑
- `src/lib/i18n.ts` - 国际化文本

**数据库关系：**
- 利用现有的 Photo-Story 多对多关系 (`stories Story[] @relation("PhotoStories")`)