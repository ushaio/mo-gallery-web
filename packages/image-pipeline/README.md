# @mo-gallery/image-pipeline

Web 与 Official 共用的服务端图片上传处理管线。唯一可编辑源头在 `mo-gallery-shared` 仓库，消费方通过 `pnpm sync` 获得镜像，不要编辑镜像。

- `@mo-gallery/image-pipeline`（`.`）：纯 TS —— `ExifData` 类型、EXIF JSON/日期解析、展示格式化、管线常量。客户端可安全引用。
- `@mo-gallery/image-pipeline/node`：Node 运行时实现（sharp + exifreader）—— EXIF 提取、CIELAB 主色提取、缩略图生成（800px AVIF q72）、目标体积压缩、尺寸护栏与 sharp 超时包装。**只能在服务端导入。**

主色提取算法与 desktop Go 实现（`emulsion-desktop/local_library/media.go`）逐位一致，修改时必须两侧同步。
