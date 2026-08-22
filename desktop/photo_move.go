package main

import (
	"context"
	"errors"
	"fmt"
	"path"
	"strings"

	"mo-gallery-desktop/services"
	"mo-gallery-desktop/storage_plugins"
)

// MoveDesktopPhotoInput 描述一次桌面存储插件照片的移动。
// fromPath/fromThumbPath 是照片记录中的完整存储键（含 basePath）。
type MoveDesktopPhotoInput struct {
	ID            string `json:"id"`
	SourceID      string `json:"sourceId"`
	FromPath      string `json:"fromPath"`
	FromThumbPath string `json:"fromThumbPath"`
	ToFolder      string `json:"toFolder"`
}

// MoveDesktopPhotosInput 是批量移动绑定的请求体。
type MoveDesktopPhotosInput struct {
	Moves []MoveDesktopPhotoInput `json:"moves"`
}

// MoveDesktopPluginPhotos 将所选照片的原图与缩略图对象移动到目标目录。
// 对象移动通过存储插件执行（语义仍是移动），移动成功后登记新的存储键。
// 当前仅支持 R2 存储源；其他 S3 兼容源会返回明确错误。
func (a *App) MoveDesktopPluginPhotos(input MoveDesktopPhotosInput) (services.BatchResult, error) {
	if a.StoragePlugins == nil {
		return services.BatchResult{}, errors.New("存储插件不可用")
	}
	if len(input.Moves) == 0 {
		return services.BatchResult{}, errors.New("没有可移动的照片")
	}

	ctx := context.Background()
	var success, failed int
	var errorsOut []string
	metadata := make([]services.MoveMetadataItem, 0, len(input.Moves))

	for _, move := range input.Moves {
		toFolder, err := normalizeMoveFolder(move.ToFolder)
		if err != nil {
			failed++
			errorsOut = append(errorsOut, move.ID+": "+err.Error())
			continue
		}

		source, ok := a.StoragePlugins.GetSource(move.SourceID)
		if !ok {
			failed++
			errorsOut = append(errorsOut, move.ID+": 存储源不存在")
			continue
		}
		if !isR2StorageSource(source) {
			failed++
			errorsOut = append(errorsOut, move.ID+": 当前仅支持 R2 存储源移动")
			continue
		}

		basePath := strings.Trim(strings.ReplaceAll(source.Config["basePath"], "\\", "/"), "/")
		// fromPath/fromThumbPath 是含 basePath 的完整存储键，Stat/Move 均按完整键处理。
		// 目标目录按存储桶相对键处理（不拼接 basePath）：输入 weixin 即移到
		// weixin/<文件>，与文件夹选择器展示的桶根目录保持一致。
		fromKey, err := normalizeStorageKey(move.FromPath)
		if err != nil {
			failed++
			errorsOut = append(errorsOut, move.ID+": "+err.Error())
			continue
		}
		filename := path.Base(fromKey)
		toKey := path.Join(toFolder, filename)
		if toKey == fromKey {
			success++
			continue
		}

		// 预检源对象是否存在；只接受「不存在」，其余网络/凭据错误置后让 move 阶段给出原始报错。
		if _, statErr := a.StoragePlugins.Stat(ctx, storage_plugins.StatRequest{SourceID: move.SourceID, Key: fromKey}); statErr != nil && isStorageNotFound(statErr) {
			failed++
			errorsOut = append(errorsOut, fmt.Sprintf(
				"%s: 源对象在存储中不存在（插件键=%s，照片记录 path=%q，当前 basePath=%q）",
				move.ID, fromKey, move.FromPath, basePath))
			continue
		}

		// 先移动原图，再按 .thumbnails 规则移动缩略图；任一步失败则回滚原图。
		if _, err := a.StoragePlugins.Move(ctx, storage_plugins.MoveRequest{
			SourceID: move.SourceID,
			FromKey:  fromKey,
			ToKey:    toKey,
		}); err != nil {
			failed++
			errorsOut = append(errorsOut, fmt.Sprintf(
				"%s: 移动原图失败: %s（源键=%s，目标键=%s，basePath=%q）",
				move.ID, err.Error(), fromKey, toKey, basePath))
			continue
		}

		newThumbKey := ""
		if strings.TrimSpace(move.FromThumbPath) != "" {
			fromThumbKey, thumbErr := normalizeStorageKey(move.FromThumbPath)
			if thumbErr != nil {
				failed++
				errorsOut = append(errorsOut, move.ID+": "+thumbErr.Error())
				_ = a.bestEffortRollback(ctx, move.SourceID, toKey, fromKey)
				continue
			}
			// 原缩略图在同目录的 .thumbnails/<name>，目标缩略图须落在目标目录的 .thumbnails 下。
			newThumbKey = path.Join(toFolder, ".thumbnails", path.Base(fromThumbKey))
			if _, moveErr := a.StoragePlugins.Move(ctx, storage_plugins.MoveRequest{
				SourceID: move.SourceID,
				FromKey:  fromThumbKey,
				ToKey:    newThumbKey,
			}); moveErr != nil {
				failed++
				errorsOut = append(errorsOut, move.ID+": 移动缩略图失败: "+moveErr.Error())
				_ = a.bestEffortRollback(ctx, move.SourceID, toKey, fromKey)
				continue
			}
		}

		item := services.MoveMetadataItem{
			ID:   move.ID,
			Path: toKey,
		}
		if newThumbKey != "" {
			item.ThumbPath = newThumbKey
		}
		metadata = append(metadata, item)
		success++
	}

	if len(metadata) > 0 {
		var metaErr error
		metadataResult, metaErr := a.Photo.MoveMetadata(metadata)
		if metaErr != nil {
			// 对象已移动但登记失败：把本次成功数回退到失败，提示用户状态不一致。
			success -= len(metadata)
			failed += len(metadata)
			errorsOut = append(errorsOut, "登记存储键失败: "+metaErr.Error())
		} else if metadataResult != nil && len(metadataResult.Errors) > 0 {
			success -= len(metadataResult.Errors)
			failed += len(metadataResult.Errors)
			errorsOut = append(errorsOut, metadataResult.Errors...)
		}
	}

	return services.BatchResult{Success: success, Failed: failed, Errors: errorsOut}, nil
}

// ListDesktopStorageObjects 列出存储源对象，供移动弹窗的文件夹选择器使用。
func (a *App) ListDesktopStorageObjects(sourceID, prefix, cursor string, limit int) (storage_plugins.ListResult, error) {
	if a.StoragePlugins == nil {
		return storage_plugins.ListResult{}, errors.New("存储插件不可用")
	}
	return a.StoragePlugins.List(context.Background(), storage_plugins.ListRequest{
		SourceID: sourceID,
		Prefix:   prefix,
		Cursor:   cursor,
		Limit:    limit,
	})
}

// isR2StorageSource 判断存储源是否指向 R2/S3 兼容对象存储（仅这类源支持目录移动）。
func isR2StorageSource(source storage_plugins.Source) bool {
	endpoint := strings.ToLower(strings.TrimSpace(source.Config["endpoint"]))
	return strings.Contains(endpoint, "r2.cloudflarestorage.com") ||
		strings.Contains(endpoint, ".r2.cloudflare")
}

// normalizeMoveFolder 规范化目标目录：只接受不带前导/尾随斜杠的相对前缀。
func normalizeMoveFolder(value string) (string, error) {
	folder := strings.Trim(strings.ReplaceAll(strings.TrimSpace(value), "\\", "/"), "/")
	if folder == "" {
		return "", errors.New("目标目录不能为空")
	}
	for _, part := range strings.Split(folder, "/") {
		if part == ".." || part == "." {
			return "", errors.New("目标目录包含非法路径")
		}
	}
	return folder, nil
}

// normalizeStorageKey 规范化完整存储键（统一斜杠并去除首尾斜杠），供 Stat/Move 使用。
func normalizeStorageKey(key string) (string, error) {
	key = strings.Trim(strings.ReplaceAll(strings.TrimSpace(key), "\\", "/"), "/")
	if key == "" {
		return "", errors.New("照片存储键为空")
	}
	return key, nil
}

// isStorageNotFound 判断插件错误是否表示源对象不存在（HTTP 404 / NoSuchKey）。
func isStorageNotFound(err error) bool {
	if err == nil {
		return false
	}
	s := err.Error()
	return strings.Contains(s, "404") || strings.Contains(s, "NoSuchKey") || strings.Contains(s, "no such key")
}

// bestEffortRollback 在缩略图移动失败时尝试把原图移回原位，尽力保持一致性。
func (a *App) bestEffortRollback(ctx context.Context, sourceID, fromKey, toKey string) error {
	_, err := a.StoragePlugins.Move(ctx, storage_plugins.MoveRequest{
		SourceID: sourceID,
		FromKey:  fromKey,
		ToKey:    toKey,
	})
	return err
}
