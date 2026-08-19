# Desktop 插件市场仓库契约

- 内置索引：`https://raw.githubusercontent.com/ushaio/mo-gallery-plugin/master/index.json`
- 当前 Schema：`1`
- 宿主实现：`desktop/storage_plugins/marketplace.go`

Desktop 只读取宿主内置的仓库地址，不接受 renderer 或插件传入自定义源。索引用于发现、
版本和平台选择；它不能替代插件包自身的 checksum、Ed25519 签名、manifest、runtime 和
兼容性校验。

## 索引格式

```json
{
  "schemaVersion": 1,
  "updatedAt": "2026-08-17T00:00:00Z",
  "plugins": [
    {
      "id": "example.plugin",
      "name": "Example Plugin",
      "description": "Example contribution.",
      "author": "Publisher",
      "version": "1.0.0",
      "coreApiVersion": "1",
      "contributions": [
        { "domain": "storage", "apiVersion": "1" }
      ],
      "homepage": "https://github.com/ushaio/example-plugin",
      "repository": "https://github.com/ushaio/example-plugin",
      "platforms": {
        "windows-amd64": {
          "url": "https://github.com/ushaio/mo-gallery-plugin/releases/download/example-v1.0.0/example-windows-amd64.zip",
          "sha256": "64-character-lowercase-hex-digest",
          "size": 123456
        }
      }
    }
  ]
}
```

支持的平台键为 `windows-amd64`、`darwin-amd64`、`darwin-arm64`、`linux-amd64` 和
`linux-arm64`。每个平台包必须提供正数大小和 SHA-256；下载地址必须位于
`ushaio/mo-gallery-plugin` 的 GitHub Release 下。

## 发布顺序

1. 为每个目标平台构建插件包。
2. 使用正式插件签名密钥生成 `checksums.json` 和 `signature.sig`。
3. 将不可变 ZIP 上传到中央仓库的 GitHub Release。
4. 计算 Release 资产的实际字节数和 SHA-256，更新 `index.json`。
5. 先验证所有 URL、摘要和宿主兼容性，再提交索引更新。

索引刷新失败时，Desktop 会重新解析磁盘缓存并标记为离线缓存。包下载使用临时文件，
验证 HTTPS 重定向、大小和 SHA-256 后才交给统一安装器；任何一步失败都不会激活插件。
